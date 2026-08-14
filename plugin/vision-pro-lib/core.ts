import type { ToolContext } from "@opencode-ai/plugin"
import { loadConfig, type VisionConfig } from "./config"
import { ResultCache } from "./cache"
import { CloudClient } from "./cloud"
import { WorkerBridge } from "./ocr"
import {
  decodeBase64Image,
  readImageFile,
  sha256,
  sniffMime,
  dataUrl,
  type ImageInput,
} from "./image"
import { TASK_PROMPTS, OCR_FALLBACK_PROMPT } from "./prompts"
import { TASK_SCHEMAS, CloudOcrSchema, type Task } from "./schema"

const MAX_IMAGE_BYTES = 25 * 1024 * 1024

export interface ImageArgs {
  imagePath?: string
  imageBase64?: string
  clipboard?: boolean
}

export interface StructuredOutcome {
  value: unknown
  cached: boolean
  model?: string
  engine: "cloud" | "rapidocr"
}

export class VisionRuntime {
  private config: VisionConfig
  private cache: ResultCache
  private cloud: CloudClient
  private worker: WorkerBridge
  private ready: Promise<void>

  constructor() {
    this.config = loadConfig()
    this.cache = new ResultCache(this.config)
    this.cloud = new CloudClient(this.config)
    this.worker = new WorkerBridge(this.config)
    this.ready = this.cache.init()
  }

  async resolveImage(args: ImageArgs, context: ToolContext): Promise<ImageInput> {
    const provided = [args.imagePath, args.imageBase64, args.clipboard ? true : undefined].filter(
      (v) => v !== undefined,
    ).length
    if (provided === 0) {
      throw new Error("vision-pro: provide exactly one of imagePath, imageBase64, or clipboard=true")
    }
    if (provided > 1) {
      throw new Error("vision-pro: provide only one of imagePath, imageBase64, or clipboard=true")
    }
    let image: ImageInput
    if (args.imagePath) {
      image = await readImageFile(args.imagePath, context.directory)
    } else if (args.imageBase64) {
      image = await decodeBase64Image(args.imageBase64)
    } else {
      const clip = await this.worker.clipboard()
      if (!clip) throw new Error("vision-pro: clipboard does not contain an image")
      image = await decodeBase64Image(clip.image_base64)
    }
    if (image.bytes.length > MAX_IMAGE_BYTES) {
      throw new Error("vision-pro: image exceeds the 25 MB limit")
    }
    return image
  }

  private async cacheKey(task: string, signature: string, extra: string, image: ImageInput): Promise<string> {
    return sha256(JSON.stringify([task, signature, extra]) + "\u0000" + Buffer.from(image.bytes))
  }

  private async preprocessForCloud(image: ImageInput): Promise<ImageInput> {
    const processed = await this.worker.preprocess(image, this.config.maxDim)
    if (!processed) return image
    const bytes = new Uint8Array(Buffer.from(processed.image_base64, "base64"))
    return {
      bytes,
      mime: "image/jpeg",
      dataUrl: dataUrl(bytes, "image/jpeg"),
    }
  }

  async runStructured(
    task: Exclude<Task, "ocr">,
    image: ImageInput,
    extra: string,
  ): Promise<StructuredOutcome> {
    await this.ready
    const prompt = TASK_PROMPTS[task]
    const key = await this.cacheKey(task, prompt.signature, extra, image)
    const hit = this.cache.get(key)
    if (hit !== undefined) return { value: hit, cached: true, engine: "cloud" }

    const processed = await this.preprocessForCloud(image)
    const { value, model } = await this.cloud.structured({
      system: prompt.system,
      user: prompt.user(extra),
      image: processed,
      schema: TASK_SCHEMAS[task],
      detail: "high",
    })
    await this.cache.set(key, value)
    return { value, cached: false, model, engine: "cloud" }
  }

  async runOcr(image: ImageInput, extra = ""): Promise<StructuredOutcome> {
    await this.ready
    const key = await this.cacheKey("ocr", OCR_FALLBACK_PROMPT.signature, extra, image)
    const hit = this.cache.get(key)
    if (hit !== undefined) {
      const hitEngine = (hit as { engine?: string }).engine === "cloud" ? "cloud" : "rapidocr"
      return { value: hit, cached: true, engine: hitEngine }
    }

    let local:
      | { text: string; blocks: Array<{ text: string; confidence: number; bbox: number[] }>; engine: string; confidence: number }
      | null = null
    if (this.worker.available) {
      try {
        local = await this.worker.ocrLocal(image)
      } catch {
        local = null
      }
    }
    if (
      local &&
      local.text.trim() !== "" &&
      local.confidence >= this.config.ocrMinConfidence
    ) {
      await this.cache.set(key, local)
      return { value: local, cached: false, engine: "rapidocr" }
    }

    if (this.config.offline) {
      if (local) {
        await this.cache.set(key, local)
        return { value: local, cached: false, engine: "rapidocr" }
      }
      throw new Error(
        "vision-pro: offline mode enabled but local OCR produced no readable text. Reason: " +
          (this.worker.unavailableReason ?? "empty result"),
      )
    }

    const processed = await this.preprocessForCloud(image)
    const { value, model } = await this.cloud.structured({
      system: OCR_FALLBACK_PROMPT.system,
      user: OCR_FALLBACK_PROMPT.user(""),
      image: processed,
      schema: CloudOcrSchema,
      detail: "low",
    })
    const cloudResult = {
      text: (value as { text: string }).text,
      blocks: [],
      engine: "cloud" as const,
      confidence: 0.7,
    }
    await this.cache.set(key, cloudResult)
    return { value: cloudResult, cached: false, model, engine: "cloud" }
  }

  async pingWorker(): Promise<string | null> {
    if (!this.worker.available) return this.worker.unavailableReason ?? "worker unavailable"
    try {
      await this.worker.ping()
      return null
    } catch (err) {
      return err instanceof Error ? err.message : String(err)
    }
  }

  dispose(): void {
    this.worker.dispose()
  }
}

export function imageMime(bytes: Uint8Array, pathHint?: string): string | undefined {
  return sniffMime(bytes, pathHint)
}
