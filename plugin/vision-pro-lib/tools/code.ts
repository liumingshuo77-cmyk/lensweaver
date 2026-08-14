import { tool } from "@opencode-ai/plugin"
import type { VisionRuntime } from "../core"

const z = tool.schema

export function codeTool(runtime: VisionRuntime) {
  return tool({
    description:
      "Extract code shown in an image (screenshot of an editor, terminal, error trace with code) using a cloud vision model. " +
      "Returns structured JSON with the language, the code reproduced exactly, and a brief explanation.",
    args: {
      imagePath: z.string().optional().describe("Path to an image file, absolute or relative to the session directory"),
      imageBase64: z.string().optional().describe("Base64-encoded image data"),
      clipboard: z.boolean().optional().describe("Set true to read the image from the system clipboard"),
      languageHint: z.string().optional().describe("Optional language hint, e.g. typescript, python, go"),
    },
    async execute(args, context) {
      const image = await runtime.resolveImage(args, context)
      const { value, cached, model } = await runtime.runStructured("code", image, args.languageHint ?? "")
      const v = value as { language: string; code: string; explanation: string; confidence: string }
      return {
        title: `vision_extract_code (${v.language}, ${v.confidence})`,
        output: JSON.stringify(v, null, 2),
        metadata: { engine: "cloud", model, cached },
      }
    },
  })
}
