import { tool } from "@opencode-ai/plugin"
import type { VisionRuntime } from "../core"

const z = tool.schema

export function ocrTool(runtime: VisionRuntime) {
  return tool({
    description:
      "Extract all text from an image. Uses local RapidOCR (free, offline) when available; falls back to a cloud vision model " +
      "when local OCR confidence is low or local OCR is unavailable. Returns structured JSON with the full text, per-block " +
      "confidence and bounding boxes.",
    args: {
      imagePath: z.string().optional().describe("Path to an image file, absolute or relative to the session directory"),
      imageBase64: z.string().optional().describe("Base64-encoded image data"),
      clipboard: z.boolean().optional().describe("Set true to read the image from the system clipboard"),
      languageHint: z.string().optional().describe("Optional language hint, e.g. zh-CN, en, ja"),
    },
    async execute(args, context) {
      const image = await runtime.resolveImage(args, context)
      const { value, cached, model, engine } = await runtime.runOcr(image, args.languageHint ?? "")
      const v = value as { text: string; blocks: unknown[]; engine: string; confidence: number }
      return {
        title: `vision_ocr (${v.engine}): ${v.text.slice(0, 60).replace(/\n/g, " ")}`,
        output: JSON.stringify(v, null, 2),
        metadata: { engine, model, cached },
      }
    },
  })
}
