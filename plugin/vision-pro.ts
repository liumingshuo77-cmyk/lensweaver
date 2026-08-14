import type { Plugin } from "@opencode-ai/plugin"
import { VisionRuntime } from "./vision-pro-lib/core"
import { analyzeTool } from "./vision-pro-lib/tools/analyze"
import { ocrTool } from "./vision-pro-lib/tools/ocr"
import { diagnoseTool } from "./vision-pro-lib/tools/diagnose"
import { uiTool } from "./vision-pro-lib/tools/ui"
import { codeTool } from "./vision-pro-lib/tools/code"

const server: Plugin = async () => {
  const runtime = new VisionRuntime()
  return {
    tool: {
      vision_analyze: analyzeTool(runtime),
      vision_ocr: ocrTool(runtime),
      vision_diagnose_error: diagnoseTool(runtime),
      vision_describe_ui: uiTool(runtime),
      vision_extract_code: codeTool(runtime),
    },
    dispose: async () => {
      runtime.dispose()
    },
  }
}

export default { id: "vision-pro", server }
