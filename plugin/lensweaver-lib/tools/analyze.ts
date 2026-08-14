import { tool } from "@opencode-ai/plugin"
import type { VisionRuntime } from "../core"

const z = tool.schema

export function analyzeTool(runtime: VisionRuntime) {
  return tool({
    description:
      "Analyze an image (screenshot, diagram, chart, drawing) using a cloud vision model and answer questions about it. " +
      "Use for generic \"look at this image\" requests that are not error screenshots, UI screenshots, code, or pure OCR.",
    args: {
      imagePath: z.string().optional().describe("Path to an image file, absolute or relative to the session directory"),
      imageBase64: z.string().optional().describe("Base64-encoded image data"),
      clipboard: z.boolean().optional().describe("Set true to read the image from the system clipboard"),
      prompt: z.string().optional().describe("Specific question or instruction about the image"),
    },
    async execute(args, context) {
      const image = await runtime.resolveImage(args, context)
      const { value, cached, model } = await runtime.runStructured("analyze", image, args.prompt ?? "")
      const v = value as { summary: string; key_details: string[]; actions: string[] }
      return {
        title: `vision_analyze: ${v.summary.slice(0, 60)}`,
        output: JSON.stringify(v, null, 2),
        metadata: { engine: "cloud", model, cached },
      }
    },
  })
}
