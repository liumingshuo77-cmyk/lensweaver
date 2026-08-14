import { tool } from "@opencode-ai/plugin"
import type { VisionRuntime } from "../core"

const z = tool.schema

export function diagnoseTool(runtime: VisionRuntime) {
  return tool({
    description:
      "Analyze an error screenshot (terminal output, browser console, crash dialog, test failure) using a cloud vision model " +
      "and return a structured diagnosis: error type, root cause, ordered fix steps, shell commands, affected files, and confidence.",
    args: {
      imagePath: z.string().optional().describe("Path to an image file, absolute or relative to the session directory"),
      imageBase64: z.string().optional().describe("Base64-encoded image data"),
      clipboard: z.boolean().optional().describe("Set true to read the image from the system clipboard"),
      context: z.string().optional().describe("Additional context, e.g. language, framework, what the user was doing"),
    },
    async execute(args, context) {
      const image = await runtime.resolveImage(args, context)
      const { value, cached, model } = await runtime.runStructured("diagnose", image, args.context ?? "")
      const v = value as {
        error_type: string
        summary: string
        root_cause: string
        fix_steps: string[]
        commands: string[]
        affected_files: string[]
        confidence: string
      }
      return {
        title: `vision_diagnose_error: ${v.error_type} (${v.confidence})`,
        output: JSON.stringify(v, null, 2),
        metadata: { engine: "cloud", model, cached },
      }
    },
  })
}
