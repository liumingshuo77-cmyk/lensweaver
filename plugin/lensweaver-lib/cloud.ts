import type { VisionConfig } from "./config"
import type { ImageInput } from "./image"
import type { z } from "zod"
import { parseStructured } from "./repair"

export type VisionErrorKind = "config" | "auth" | "network" | "rate_limit" | "model" | "upstream" | "offline" | "parse"

export class VisionError extends Error {
  kind: VisionErrorKind
  retriable: boolean

  constructor(kind: VisionErrorKind, message: string, retriable = false) {
    super(message)
    this.kind = kind
    this.retriable = retriable
  }
}

interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string | Array<{ type: string; text?: string; image_url?: { url: string; detail?: string } }>
}

let modelsCache: { base: string; at: number; models: string[] } | undefined

async function listModels(config: VisionConfig): Promise<string[]> {
  if (modelsCache && modelsCache.base === config.apiBaseUrl && Date.now() - modelsCache.at < 3600_000) {
    return modelsCache.models
  }
  if (config.offline) return []
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`
    const res = await fetch(`${config.apiBaseUrl}/models`, { headers, signal: AbortSignal.timeout(config.timeoutMs) })
    if (!res.ok) return []
    const body = (await res.json()) as { data?: Array<{ id: string }> }
    const models = (body.data ?? []).map((m) => m.id)
    modelsCache = { base: config.apiBaseUrl, at: Date.now(), models }
    return models
  } catch {
    return []
  }
}

function visionScore(id: string): number {
  const lower = id.toLowerCase()
  let score = 0
  for (const token of ["vision", "multimodal", "omni"]) if (lower.includes(token)) score += 4
  for (const token of ["4o", "pixtral", "gemini", "qwen", "llama-4", "glm", "minicpm", "vl", "v-l"]) {
    if (lower.includes(token)) score += 2
  }
  return score
}

async function selectCandidates(config: VisionConfig): Promise<string[]> {
  const candidates: string[] = []
  const seen = new Set<string>()
  const push = (id: string) => {
    if (!seen.has(id)) {
      seen.add(id)
      candidates.push(id)
    }
  }
  for (const model of config.models) push(model)
  const discovered = await listModels(config)
  discovered
    .map((id) => ({ id, score: visionScore(id) }))
    .sort((a, b) => b.score - a.score)
    .forEach((entry) => push(entry.id))
  return candidates
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content
      .map((part) => (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string"
        ? (part as { text: string }).text
        : ""))
      .join("")
  }
  return ""
}

async function requestCompletion(
  config: VisionConfig,
  model: string,
  messages: ChatMessage[],
  json: boolean,
): Promise<string> {
  if (config.offline) {
    throw new VisionError(
      "offline",
      "LensWeaver: offline mode is enabled (VISION_OFFLINE=1), cloud vision tasks are disabled. Use vision_ocr for local-only OCR.",
    )
  }
  if (!config.apiBaseUrl) {
    throw new VisionError("config", "LensWeaver: VISION_API_BASE_URL is not set")
  }
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`
  let res: Response
  try {
    res = await fetch(`${config.apiBaseUrl}/chat/completions`, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(config.timeoutMs),
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 4096,
        ...(json ? { response_format: { type: "json_object" } } : {}),
      }),
    })
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new VisionError("network", `LensWeaver: request to ${model} timed out`, true)
    }
    throw new VisionError("network", `LensWeaver: network error calling ${model}: ${String(err)}`, true)
  }
  if (res.status === 401 || res.status === 403) {
    throw new VisionError("auth", "LensWeaver: API key rejected (401/403). Set VISION_API_KEY")
  }
  const body = (await res.json().catch(() => ({}))) as {
    error?: { message?: string }
    choices?: Array<{ message?: { content?: unknown } }>
  }
  const errorMessage = body.error?.message ?? ""
  if (!res.ok) {
    const lower = errorMessage.toLowerCase()
    if (res.status === 404 || lower.includes("model_not_found") || (lower.includes("model") && lower.includes("not found"))) {
      throw new VisionError("model", `model ${model} not available: ${errorMessage || res.status}`, true)
    }
    if (res.status === 429) {
      throw new VisionError("rate_limit", `rate limited on ${model}: ${errorMessage || res.status}`, true)
    }
    if (res.status >= 500) {
      throw new VisionError("upstream", `upstream error ${res.status} on ${model}: ${errorMessage}`, true)
    }
    if (json && (res.status === 400 || res.status === 422) && /response_format|response format|json_object|json mode/i.test(lower)) {
      return requestCompletion(config, model, messages, false)
    }
    throw new VisionError("upstream", `request to ${model} failed (${res.status}): ${errorMessage}`)
  }
  const content = body.choices?.[0]?.message?.content
  return contentText(content)
}

export interface StructuredCall {
  system: string
  user: string
  image?: ImageInput
  schema: z.ZodType
  detail?: "low" | "high"
  maxAttempts?: number
  parseRetries?: number
}

export class CloudClient {
  private config: VisionConfig

  constructor(config: VisionConfig) {
    this.config = config
  }

  async structured(call: StructuredCall): Promise<{ value: unknown; model: string; attempts: number }> {
    const candidates = await selectCandidates(this.config)
    if (candidates.length === 0) {
      throw new VisionError(
        "model",
        "LensWeaver: no vision model configured. Set VISION_MODELS or add vision-capable models to VISION_API_BASE_URL",
      )
    }
    const maxAttempts = call.maxAttempts ?? this.config.maxRetries + 1
    const parseRetries = call.parseRetries ?? 2
    let lastError: VisionError | undefined

    for (const model of candidates) {
      const messages = this.buildMessages(call)
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const raw = await requestCompletion(this.config, model, messages, true)
          const parsed = parseStructured(call.schema, raw)
          if (parsed.ok) {
            return { value: parsed.value, model, attempts: attempt + 1 }
          }
          if (attempt < parseRetries) {
            messages.push({ role: "user", content: `Your previous output was invalid: ${parsed.error}. Return ONLY a valid JSON object matching the schema exactly.` })
            continue
          }
          throw new VisionError("parse", `LensWeaver: model ${model} returned unparseable JSON after ${parseRetries} retries: ${parsed.error}`)
        } catch (err) {
          const visionErr = err instanceof VisionError ? err : new VisionError("upstream", String(err))
          if (visionErr.kind === "model") {
            lastError = visionErr
            break
          }
          if (visionErr.kind === "auth") throw visionErr
          if (visionErr.retriable && attempt < maxAttempts - 1) {
            await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt))
            continue
          }
          lastError = visionErr
          break
        }
      }
    }
    throw lastError ?? new VisionError("upstream", "LensWeaver: cloud request failed")
  }

  private buildMessages(call: StructuredCall): ChatMessage[] {
    const messages: ChatMessage[] = [{ role: "system", content: call.system }]
    const parts: ChatMessage["content"] = [{ type: "text", text: call.user }]
    if (call.image) {
      parts.push({
        type: "image_url",
        image_url: { url: call.image.dataUrl, detail: call.detail ?? "auto" },
      })
    }
    messages.push({ role: "user", content: parts })
    return messages
  }
}
