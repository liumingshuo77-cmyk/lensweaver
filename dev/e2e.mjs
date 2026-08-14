import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { makeTestImage } from "./test-image.mjs"

const here = dirname(fileURLToPath(import.meta.url))
process.env.VISION_WORKER_PATH ??= join(here, "..", "plugin", "vision-pro-lib", "worker.py")
process.env.VISION_OFFLINE ??= "1"

const mod = await import("./dist-test.mjs")
const hooks = await mod.default.server({})
const context = {
  sessionID: "test",
  messageID: "test",
  agent: "build",
  directory: process.cwd(),
  worktree: process.cwd(),
  abort: new AbortController().signal,
  metadata: () => {},
  ask: () => {},
}

const testImage = makeTestImage()

async function runTool(name, args) {
  const t0 = Date.now()
  const result = await hooks.tool[name].execute(args, context)
  console.log(`\n=== ${name} (${Date.now() - t0}ms) ===`)
  console.log(result.output ?? result)
  console.log("metadata:", JSON.stringify(result.metadata ?? {}))
  return result
}

console.log("-- tool inventory --")
console.log(Object.keys(hooks.tool))

await runTool("vision_ocr", { imagePath: testImage })
await runTool("vision_ocr", { imagePath: testImage })

try {
  await runTool("vision_analyze", { imagePath: testImage })
} catch (err) {
  console.log("\nanalyze offline rejected:", err.message)
}

try {
  await runTool("vision_ocr", { imagePath: "C:/Windows/win.ini" })
} catch (err) {
  console.log("\nnon-image rejected:", err.message)
}

try {
  await runTool("vision_ocr", {})
} catch (err) {
  console.log("\nmissing source rejected:", err.message)
}

await hooks.dispose()
console.log("\nall done")
