import { tool } from "@opencode-ai/plugin"
import type { z as Zod } from "zod"

const z = tool.schema

export const AnalyzeSchema = z.object({
  summary: z.string().describe("One-paragraph summary of what the image shows"),
  key_details: z.array(z.string()).describe("Important details visible in the image"),
  actions: z.array(z.string()).describe("Suggested next steps; empty if none"),
})

export const OcrBlockSchema = z.object({
  text: z.string(),
  confidence: z.number().min(0).max(1),
  bbox: z.array(z.number()).length(4).describe("x0, y0, x1, y1 in image pixels"),
})

export const OcrSchema = z.object({
  text: z.string().describe("All extracted text, lines joined by newlines"),
  blocks: z.array(OcrBlockSchema),
  engine: z.enum(["rapidocr", "cloud"]),
  confidence: z.number().min(0).max(1).describe("Average confidence of the extraction"),
})

export const DiagnoseSchema = z.object({
  error_type: z.string().describe("Short identifier such as connection_refused, syntax_error, module_not_found"),
  summary: z.string().describe("What the error is, in one or two sentences"),
  root_cause: z.string().describe("Most likely cause based only on what is visible"),
  fix_steps: z.array(z.string()),
  commands: z.array(z.string()).describe("Shell commands to fix or verify; empty if none"),
  affected_files: z.array(z.string()).describe("File paths mentioned or implied; empty if none"),
  confidence: z.enum(["high", "medium", "low"]),
})

export const UiComponentSchema = z.object({
  type: z.string().describe("Component kind: button, input, dialog, menu, card, text, icon, table, etc."),
  label: z.string().describe("Visible label or best guess if unlabeled"),
  position: z.string().describe("Approximate location in the layout, e.g. top-right"),
  details: z.string().optional().describe("Anything notable about the component"),
})

export const UiSchema = z.object({
  app_name: z.string().describe("Name of the application or window; unknown if not readable"),
  components: z.array(UiComponentSchema),
  visible_text: z.array(z.string()).describe("Notable text strings shown on screen"),
  layout: z.string().describe("Short description of the overall layout structure"),
  problems: z.array(z.string()).describe("UI problems visible in the screenshot; empty if none"),
  suggestions: z.array(z.string()).describe("Concrete improvement suggestions; empty if none"),
})

export const CodeSchema = z.object({
  language: z.string().describe("Programming language of the extracted code"),
  code: z.string().describe("The code exactly as shown, preserving indentation and line breaks"),
  explanation: z.string().describe("Brief explanation of what the code does"),
  confidence: z.enum(["high", "medium", "low"]),
})

export const CloudOcrSchema = z.object({
  text: z.string().describe("All text visible in the image, line by line, exactly as written"),
})

export type Task = "analyze" | "ocr" | "diagnose" | "ui" | "code"

export const TASK_SCHEMAS: Record<Task, Zod.ZodType> = {
  analyze: AnalyzeSchema,
  ocr: OcrSchema,
  diagnose: DiagnoseSchema,
  ui: UiSchema,
  code: CodeSchema,
}
