import { createServer } from "node:http"
import { rmSync, existsSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { makeTestImage } from "./test-image.mjs"

const here = dirname(fileURLToPath(import.meta.url))
process.env.VISION_WORKER_PATH ??= join(here, "..", "plugin", "opensight-lib", "worker.py")

const cacheFile = `${homedir()}/.cache/opensight/cache.json`
if (existsSync(cacheFile)) rmSync(cacheFile)

const port = 19000 + Math.floor(Math.random() * 500)
let requestLog = []

const server = createServer((req, res) => {
  let body = ""
  req.on("data", (c) => (body += c))
  req.on("end", () => {
    requestLog.push({ url: req.url, body })
    try {
      if (req.url === "/v1/models") {
        res.setHeader("Content-Type", "application/json")
        res.end(JSON.stringify({ data: [{ id: "mock-vision-1" }, { id: "mock-plain" }] }))
        return
      }
      if (req.url === "/v1/chat/completions") {
        const parsed = JSON.parse(body)
        const model = parsed.model
        res.setHeader("Content-Type", "application/json")
        if (model === "mock-a") {
          res.statusCode = 404
          res.end(JSON.stringify({ error: { message: "model 'mock-a' not found" } }))
          return
        }
        const feedback = parsed.messages.some(
          (m) => m.role === "user" && typeof m.content === "string" && m.content.includes("invalid"),
        )
        if (feedback) {
          res.end(
            JSON.stringify({
              choices: [{ message: { content: '{"summary":"fixed after feedback","key_details":[],"actions":[]}' } }],
            }),
          )
          return
        }
        res.end(
          JSON.stringify({
            choices: [{ message: { content: "```json\n{\"summary\": \"hello\"}" } }],
          }),
        )
      }
    } catch (err) {
      res.statusCode = 500
      res.end(JSON.stringify({ error: { message: "mock internal error: " + err.message } }))
    }
  })
})

await new Promise((resolve) => server.listen(port, resolve))

process.env.VISION_API_BASE_URL = `http://127.0.0.1:${port}/v1`
process.env.VISION_MODELS = "mock-a"
delete process.env.VISION_OFFLINE
delete process.env.VISION_API_KEY

const mod = await import("./dist-test.mjs")
const hooks = await mod.default.server({})
const context = {
  sessionID: "t",
  messageID: "t",
  agent: "build",
  directory: process.cwd(),
  worktree: process.cwd(),
  abort: new AbortController().signal,
  metadata: () => {},
  ask: () => {},
}

const testImage = makeTestImage()

const result = await hooks.tool["vision_analyze"].execute(
  { imagePath: testImage },
  context,
)
console.log("=== vision_analyze via mock provider ===")
console.log(result.output)
console.log("metadata:", JSON.stringify(result.metadata))

console.log("\n=== repair unit checks ===")
const repairMod = await import("../plugin/opensight-lib/repair.ts").catch(() => null)
if (repairMod) {
  const { extractJsonObject } = repairMod
  const cases = [
    ["```json\n{\"a\": 1}\n```", { a: 1 }],
    ['{"a": 1,}', { a: 1 }],
    ['{\n  "a": [1, 2,],\n  "b": "x"', null],
  ]
  for (const [input] of cases) {
    const out = extractJsonObject(input)
    console.log(JSON.stringify(input.slice(0, 30)), "->", out ? JSON.stringify(JSON.parse(out)) : "no parse")
  }
}

await hooks.dispose()
server.closeAllConnections?.()
server.close()
console.log("\nunit done")
process.exit(0)
