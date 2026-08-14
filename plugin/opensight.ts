import type { Plugin } from "@opencode-ai/plugin"
import { VisionRuntime } from "./opensight-lib/core"
import { analyzeTool } from "./opensight-lib/tools/analyze"
import { ocrTool } from "./opensight-lib/tools/ocr"
import { diagnoseTool } from "./opensight-lib/tools/diagnose"
import { uiTool } from "./opensight-lib/tools/ui"
import { codeTool } from "./opensight-lib/tools/code"

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

export default { id: "opensight", server }
