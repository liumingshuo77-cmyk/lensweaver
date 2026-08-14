import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const VISION_ENV_FILE = join(homedir(), ".config", "opencode", "lensweaver.env")

function fileEnv(): Record<string, string> {
  const map: Record<string, string> = {}
  try {
    if (!existsSync(VISION_ENV_FILE)) return map
    for (const line of readFileSync(VISION_ENV_FILE, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      const idx = trimmed.indexOf("=")
      if (idx === -1) continue
      const key = trimmed.slice(0, idx).trim()
      const value = trimmed.slice(idx + 1).trim()
      if (key.startsWith("VISION_")) map[key] = value
    }
  } catch {
    // ignore unreadable env file
  }
  return map
}

const FILE_ENV = fileEnv()

export interface VisionConfig {
  apiBaseUrl: string
  apiKey: string | undefined
  models: string[]
  offline: boolean
  maxRetries: number
  timeoutMs: number
  maxDim: number
  ocrMinConfidence: number
  pythonCmd: string
  cacheFile: string
  cacheTtlMs: number
  maxCacheEntries: number
}

function firstEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name] ?? FILE_ENV[name]
    if (value && value.trim() !== "") return value.trim()
  }
  return undefined
}

const DEFAULT_API_BASE_URL = "https://opencode.ai/zen/go/v1"
const DEFAULT_MODELS = "mimo-v2.5,qwen3.7-plus,qwen3.6-plus"

function defaultPython(): string {
  const candidates = [
    join(homedir(), ".config", "opencode", "lensweaver-venv", "Scripts", "python.exe"),
    join(homedir(), ".config", "opencode", "lensweaver-venv", "bin", "python"),
  ]
  return candidates.find((candidate) => existsSync(candidate)) ?? "python"
}

export function loadConfig(): VisionConfig {
  const base = (firstEnv("VISION_API_BASE_URL") ?? DEFAULT_API_BASE_URL).replace(/\/+$/, "")
  const models = (firstEnv("VISION_MODELS", "VISION_MODEL") ?? DEFAULT_MODELS)
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean)
  const cacheDir = firstEnv("VISION_CACHE_DIR") ?? join(homedir(), ".cache", "lensweaver")
  return {
    apiBaseUrl: base,
    apiKey: firstEnv("VISION_API_KEY", "GROQ_API_KEY", "OPENCODE_GO_API_KEY"),
    models,
    offline: firstEnv("VISION_OFFLINE") === "1" || firstEnv("VISION_OFFLINE") === "true",
    maxRetries: Number(firstEnv("VISION_MAX_RETRIES") ?? 2),
    timeoutMs: Number(firstEnv("VISION_TIMEOUT_MS") ?? 60000),
    maxDim: Number(firstEnv("VISION_MAX_DIM") ?? 1568),
    ocrMinConfidence: Number(firstEnv("VISION_OCR_MIN_CONFIDENCE") ?? 0.55),
    pythonCmd: firstEnv("VISION_PYTHON") ?? defaultPython(),
    cacheFile: join(cacheDir, "cache.json"),
    cacheTtlMs: Number(firstEnv("VISION_CACHE_TTL_MS") ?? 7 * 24 * 3600 * 1000),
    maxCacheEntries: Number(firstEnv("VISION_CACHE_MAX") ?? 500),
  }
}
