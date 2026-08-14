import { writeFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "plugin")
const out = join(dirname(fileURLToPath(import.meta.url)), "dist-test.mjs")

await build({
  entryPoints: [join(root, "lensweaver.ts")],
  outfile: out,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "es2022",
  external: ["@opencode-ai/plugin", "node:*"],
  logLevel: "error",
})

writeFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "test-env.json"),
  JSON.stringify({ out, root }),
)
console.log("bundled ->", out)
