import type { Plugin } from "@opencode-ai/plugin"
import { VisionRuntime } from "./lensweaver-lib/core"
import { analyzeTool } from "./lensweaver-lib/tools/analyze"
import { ocrTool } from "./lensweaver-lib/tools/ocr"
import { diagnoseTool } from "./lensweaver-lib/tools/diagnose"
import { uiTool } from "./lensweaver-lib/tools/ui"
import { codeTool } from "./lensweaver-lib/tools/code"

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

export default { id: "lensweaver", server }
