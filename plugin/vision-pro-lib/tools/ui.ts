import { tool } from "@opencode-ai/plugin"
import type { VisionRuntime } from "../core"

const z = tool.schema

export function uiTool(runtime: VisionRuntime) {
  return tool({
    description:
      "Analyze a UI / interface screenshot (web page, desktop app, mobile screen) using a cloud vision model and return a structured " +
      "inventory: app name, components with type/label/position, visible text, layout description, visible problems and suggestions.",
    args: {
      imagePath: z.string().optional().describe("Path to an image file, absolute or relative to the session directory"),
      imageBase64: z.string().optional().describe("Base64-encoded image data"),
      clipboard: z.boolean().optional().describe("Set true to read the image from the system clipboard"),
    },
    async execute(args, context) {
      const image = await runtime.resolveImage(args, context)
      const { value, cached, model } = await runtime.runStructured("ui", image, "")
      const v = value as {
        app_name: string
        components: Array<{ type: string; label: string; position: string; details?: string }>
        visible_text: string[]
        layout: string
        problems: string[]
        suggestions: string[]
      }
      return {
        title: `vision_describe_ui: ${v.app_name} (${v.components.length} components)`,
        output: JSON.stringify(v, null, 2),
        metadata: { engine: "cloud", model, cached },
      }
    },
  })
}
