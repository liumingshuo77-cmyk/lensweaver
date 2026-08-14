import { spawn, type ChildProcess } from "node:child_process"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import type { VisionConfig } from "./config"
import type { ImageInput } from "./image"

const DEFAULT_WORKER_PATH = join(dirname(fileURLToPath(import.meta.url)), "worker.py")

function workerPath(): string {
  const override = process.env.VISION_WORKER_PATH
  return override && override.trim() !== "" ? override.trim() : DEFAULT_WORKER_PATH
}

interface WorkerResponse {
  id?: number
  ok: boolean
  result?: any
  error?: string
}

interface PendingCall {
  resolve: (value: any) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

let proc: ChildProcess | undefined
let unavailableReason: string | undefined
let nextId = 1
const pending = new Map<number, PendingCall>()

function failPending(message: string) {
  for (const call of pending.values()) {
    clearTimeout(call.timer)
    call.reject(new Error(message))
  }
  pending.clear()
}

function handleLine(line: string) {
  let msg: WorkerResponse
  try {
    msg = JSON.parse(line) as WorkerResponse
  } catch {
    return
  }
  if (msg.id === undefined) return
  const call = pending.get(msg.id)
  if (!call) return
  pending.delete(msg.id)
  clearTimeout(call.timer)
  if (msg.ok) call.resolve(msg.result)
  else call.reject(new Error(`OpenSight worker: ${msg.error ?? "unknown error"}`))
}

function startWorker(cfg: VisionConfig): ChildProcess {
  const path = workerPath()
  if (!existsSync(path)) {
    unavailableReason = `worker script not found at ${path}`
    throw new Error(unavailableReason)
  }
  const child = spawn(cfg.pythonCmd, [path], {
    stdio: ["pipe", "pipe", "inherit"],
    windowsHide: true,
  })
  let buffer = ""
  child.stdout?.on("data", (chunk: Buffer) => {
    buffer += chunk.toString()
    let index: number
    while ((index = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, index).trim()
      buffer = buffer.slice(index + 1)
      if (line) handleLine(line)
    }
  })
  child.on("error", (err) => {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      unavailableReason = `python executable "${cfg.pythonCmd}" not found. Install Python or set VISION_PYTHON`
    } else {
      unavailableReason = `worker process error: ${err.message}`
    }
    failPending(unavailableReason)
  })
  child.on("exit", (code) => {
    if (proc === child) proc = undefined
    failPending(`OpenSight worker exited unexpectedly (code ${code})`)
  })
  return child
}

function ensureWorker(cfg: VisionConfig): ChildProcess {
  if (unavailableReason) throw new Error(unavailableReason)
  if (!proc || proc.killed || proc.exitCode !== null) {
    proc = startWorker(cfg)
  }
  return proc
}

async function rpc<T>(cfg: VisionConfig, type: string, payload: Record<string, unknown>, timeoutMs = 30000): Promise<T> {
  const child = ensureWorker(cfg)
  const id = nextId++
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`OpenSight worker: ${type} timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    pending.set(id, { resolve, reject, timer })
    const line = JSON.stringify({ id, type, ...payload }) + "\n"
    child.stdin?.write(line, (err) => {
      if (err) {
        clearTimeout(timer)
        pending.delete(id)
        reject(new Error(`OpenSight worker: failed to send ${type}: ${err.message}`))
      }
    })
  })
}

export class WorkerBridge {
  private cfg: VisionConfig

  constructor(cfg: VisionConfig) {
    this.cfg = cfg
  }

  get available(): boolean {
    return unavailableReason === undefined
  }

  get unavailableReason(): string | undefined {
    return unavailableReason
  }

  async ping(): Promise<void> {
    await rpc<string>(this.cfg, "ping", {})
  }

  async ocrLocal(image: ImageInput): Promise<{ text: string; blocks: Array<{ text: string; confidence: number; bbox: number[] }>; engine: string; confidence: number } | null> {
    try {
      if (image.path) {
        return await rpc(this.cfg, "ocr", { image_path: image.path }, 60000)
      }
      return await rpc(this.cfg, "ocr", { image_base64: Buffer.from(image.bytes).toString("base64") }, 60000)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes("RapidOCR is not installed")) {
        unavailableReason = "RapidOCR is not installed in the python environment"
        throw new Error(unavailableReason)
      }
      throw err
    }
  }

  async preprocess(image: ImageInput, maxDim: number): Promise<{ image_base64: string; width: number; height: number } | null> {
    try {
      if (image.path) {
        return await rpc(this.cfg, "preprocess", { image_path: image.path, max_dim: maxDim })
      }
      return await rpc(this.cfg, "preprocess", { image_base64: Buffer.from(image.bytes).toString("base64"), max_dim: maxDim })
    } catch {
      return null
    }
  }

  async clipboard(): Promise<{ image_base64: string } | null> {
    return await rpc(this.cfg, "clipboard", {})
  }

  dispose(): void {
    if (proc) {
      proc.kill()
      proc = undefined
    }
  }
}
