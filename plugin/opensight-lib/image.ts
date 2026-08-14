import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

export interface ImageInput {
  path?: string
  bytes: Uint8Array
  mime: string
  dataUrl: string
}

const MIME_SIGNATURES: Array<{ mime: string; match: (b: Uint8Array) => boolean }> = [
  {
    mime: "image/png",
    match: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    mime: "image/jpeg",
    match: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: "image/gif",
    match: (b) => b.length > 6 && b.slice(0, 6).toString() === "GIF89a",
  },
  {
    mime: "image/bmp",
    match: (b) => b.length > 2 && b[0] === 0x42 && b[1] === 0x4d,
  },
  {
    mime: "image/webp",
    match: (b) => b.length > 12 && b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP",
  },
]

const EXT_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
}

export function sniffMime(bytes: Uint8Array, pathHint?: string): string | undefined {
  for (const sig of MIME_SIGNATURES) {
    if (sig.match(bytes)) return sig.mime
  }
  if (pathHint) {
    const lower = pathHint.toLowerCase()
    for (const ext of Object.keys(EXT_MIME)) {
      if (lower.endsWith(ext)) return EXT_MIME[ext]
    }
  }
  return undefined
}

export function dataUrl(bytes: Uint8Array, mime: string): string {
  const b64 = Buffer.from(bytes).toString("base64")
  return `data:${mime};base64,${b64}`
}

export function stripDataUrlPrefix(payload: string): string {
  const comma = payload.indexOf(",")
  return comma > -1 && payload.slice(0, comma).includes("base64") ? payload.slice(comma + 1) : payload
}

export async function readImageFile(p: string, baseDir: string): Promise<ImageInput> {
  const resolved = resolve(baseDir, p)
  const bytes = new Uint8Array(await readFile(resolved))
  const mime = sniffMime(bytes, resolved)
  if (!mime) {
    throw new Error(`OpenSight: "${p}" is not a supported image (png/jpg/jpeg/webp/gif/bmp)`)
  }
  return { path: resolved, bytes, mime, dataUrl: dataUrl(bytes, mime) }
}

export async function decodeBase64Image(payload: string): Promise<ImageInput> {
  const cleaned = stripDataUrlPrefix(payload.trim())
  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(Buffer.from(cleaned, "base64"))
  } catch {
    throw new Error("OpenSight: imageBase64 is not valid base64")
  }
  if (bytes.length === 0) throw new Error("OpenSight: imageBase64 is empty")
  const mime = sniffMime(bytes)
  if (!mime) throw new Error("OpenSight: imageBase64 does not look like a supported image")
  return { bytes, mime, dataUrl: dataUrl(bytes, mime) }
}

export function sha256(input: Uint8Array | string): string {
  return createHash("sha256").update(input).digest("hex")
}
