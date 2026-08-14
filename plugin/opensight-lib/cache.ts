import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import type { VisionConfig } from "./config"

interface CacheEntry {
  t: number
  v: unknown
}

interface CacheFile {
  entries: Record<string, CacheEntry>
}

export class ResultCache {
  private config: VisionConfig
  private store: CacheFile = { entries: {} }
  private loaded = false
  private writing: Promise<void> = Promise.resolve()

  constructor(config: VisionConfig) {
    this.config = config
  }

  async init(): Promise<void> {
    if (this.loaded) return
    this.loaded = true
    try {
      const raw = await readFile(this.config.cacheFile, "utf8")
      this.store = JSON.parse(raw) as CacheFile
      if (!this.store.entries || typeof this.store.entries !== "object") this.store = { entries: {} }
    } catch {
      this.store = { entries: {} }
    }
  }

  get(key: string): unknown | undefined {
    const entry = this.store.entries[key]
    if (!entry) return undefined
    if (Date.now() - entry.t > this.config.cacheTtlMs) {
      delete this.store.entries[key]
      return undefined
    }
    return entry.v
  }

  async set(key: string, value: unknown): Promise<void> {
    this.store.entries[key] = { t: Date.now(), v: value }
    const entries = this.store.entries
    const keys = Object.keys(entries)
    if (keys.length > this.config.maxCacheEntries) {
      keys
        .sort((a, b) => entries[a].t - entries[b].t)
        .slice(0, keys.length - this.config.maxCacheEntries)
        .forEach((k) => delete entries[k])
    }
    this.writing = this.writing.then(async () => {
      try {
        await mkdir(dirname(this.config.cacheFile), { recursive: true })
        await writeFile(this.config.cacheFile, JSON.stringify(this.store), "utf8")
      } catch {
        // cache write failures must never break tool execution
      }
    })
    return this.writing
  }
}
