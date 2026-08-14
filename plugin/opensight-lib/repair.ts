import type { z } from "zod"

export interface ParseOk<T> {
  ok: true
  value: T
}

export interface ParseFail {
  ok: false
  error: string
}

function trimCodeFence(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim()
}

function fixTrailingCommas(text: string): string {
  return text.replace(/,\s*([}\]])/g, "$1")
}

function findJsonSlice(text: string): string {
  const first = text.indexOf("{")
  if (first === -1) return ""
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = first; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === "\\") escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === "{") depth++
    else if (ch === "}") {
      depth--
      if (depth === 0) return text.slice(first, i + 1)
    }
  }
  return text.slice(first)
}

function repairTruncated(text: string): string {
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === "\\") escaped = true
      else if (ch === '"') inString = false
      else if (ch === "\n") inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === "{") depth++
    else if (ch === "}") depth--
  }
  let repaired = text
  if (inString) repaired += '"'
  for (let i = 0; i < depth; i++) repaired += "}"
  return repaired
}

export function extractJsonObject(text: string): string | undefined {
  const fenced = trimCodeFence(text)
  let sliced = findJsonSlice(fenced)
  if (!sliced) return undefined
  sliced = fixTrailingCommas(sliced)
  const attempts = [sliced, repairTruncated(sliced)]
  for (const candidate of attempts) {
    try {
      JSON.parse(candidate)
      return candidate
    } catch {
      continue
    }
  }
  return undefined
}

export function parseStructured<T>(schema: z.ZodType<T>, text: string): ParseOk<T> | ParseFail {
  const raw = extractJsonObject(text)
  if (raw === undefined) {
    return { ok: false, error: "no JSON object found in model output" }
  }
  const parsed = JSON.parse(raw) as unknown
  const result = schema.safeParse(parsed)
  if (result.success) return { ok: true, value: result.data }
  return {
    ok: false,
    error: "JSON schema validation failed: " +
      result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; "),
  }
}
