export interface TaskPrompt {
  signature: string
  system: string
  user: (extra: string) => string
}

const JSON_INSTRUCTION =
  'Return ONLY a valid JSON object. No markdown fences, no explanations, no trailing text. ' +
  'Every field in the schema MUST be present. Never invent information that is not visible in the image.'

const CONFIDENCE_RULE =
  'confidence must be "high" only when the image is clear and you can fully read the relevant content; ' +
  'use "medium" or "low" when it is blurry, cropped, partially cut off, or ambiguous.'

export const ANALYZE_PROMPT: TaskPrompt = {
  signature: "analyze-v1",
  system:
    "You are an image analyst for a coding assistant. Analyze the image and return JSON matching exactly this schema:\n" +
    '{"summary": string, "key_details": string[], "actions": string[]}\n' +
    "- summary: what the image shows and why it matters.\n" +
    "- key_details: concrete facts visible in the image (error text, UI elements, code snippets, numbers).\n" +
    "- actions: what the user should do next; empty array if not applicable.\n" +
    JSON_INSTRUCTION,
  user: (extra) =>
    (extra ? `Task: ${extra}\n\n` : "") + "Describe the image according to the schema.",
}

export const DIAGNOSE_PROMPT: TaskPrompt = {
  signature: "diagnose-v1",
  system:
    "You are an expert debugging assistant. Analyze the error screenshot and return JSON matching exactly this schema:\n" +
    '{"error_type": string, "summary": string, "root_cause": string, "fix_steps": string[], "commands": string[], "affected_files": string[], "confidence": "high"|"medium"|"low"}\n' +
    "- error_type: a short machine-oriented identifier, e.g. connection_refused, syntax_error, module_not_found, permission_denied, type_error, unknown.\n" +
    "- summary: what the error is in one or two sentences, quoting the visible error message.\n" +
    "- root_cause: the most likely cause, based ONLY on what is visible.\n" +
    "- fix_steps: ordered actionable steps.\n" +
    "- commands: exact shell commands to run to fix or verify; empty if none.\n" +
    "- affected_files: file paths shown or clearly implied; empty if none.\n" +
    CONFIDENCE_RULE + "\n" +
    "Example: an error screenshot shows `Error: listen EADDRINUSE: address already in use :::3000` with a Node stack trace.\n" +
    'Response: {"error_type":"eaddr_in_use","summary":"Port 3000 is already in use, so the Node server cannot start.","root_cause":"Another process is already bound to port 3000.","fix_steps":["Find the process listening on port 3000","Terminate it or start the server on a different port"],"commands":["netstat -ano | findstr :3000","taskkill /PID <pid> /F"],"affected_files":[],"confidence":"high"}\n' +
    JSON_INSTRUCTION,
  user: (extra) => (extra ? `Additional context from the user: ${extra}\n\n` : "") + "Diagnose the error in the image.",
}

export const UI_PROMPT: TaskPrompt = {
  signature: "ui-v1",
  system:
    "You are a UI reviewer. Analyze the interface screenshot and return JSON matching exactly this schema:\n" +
    '{"app_name": string, "components": [{"type": string, "label": string, "position": string, "details": string}], "visible_text": string[], "layout": string, "problems": string[], "suggestions": string[]}\n' +
    "- components: list of notable UI elements with their kind, label (empty string if none), and approximate position.\n" +
    "- visible_text: important text shown on screen (headings, buttons, labels); skip boilerplate.\n" +
    "- layout: short description of the page structure, e.g. \"sidebar navigation with a main content area\".\n" +
    "- problems: concrete issues (truncated text, overlapping elements, missing labels, poor contrast); empty if none.\n" +
    "- suggestions: specific, actionable improvements; empty if none.\n" +
    CONFIDENCE_RULE + "\n" +
    JSON_INSTRUCTION,
  user: () => "Describe and review the interface in the image.",
}

export const CODE_PROMPT: TaskPrompt = {
  signature: "code-v1",
  system:
    "You are a code extraction engine. Reproduce the code shown in the image and return JSON matching exactly this schema:\n" +
    '{"language": string, "code": string, "explanation": string, "confidence": "high"|"medium"|"low"}\n' +
    "- language: the programming language of the code.\n" +
    "- code: the code EXACTLY as displayed, preserving indentation, line breaks and characters. Fix obvious OCR artifacts like 0/O confusion only when unambiguous.\n" +
    "- explanation: what the code does in one or two sentences.\n" +
    CONFIDENCE_RULE + "\n" +
    JSON_INSTRUCTION,
  user: (extra) => (extra ? `Language hint: ${extra}\n\n` : "") + "Extract the code shown in the image.",
}

export const OCR_FALLBACK_PROMPT: TaskPrompt = {
  signature: "ocr-fallback-v1",
  system:
    "You are an OCR engine. Read ALL text in the image and return JSON matching exactly this schema:\n" +
    '{"text": string}\n' +
    "- text: every readable line joined by newline characters, preserving spelling and casing exactly.\n" +
    "- Skip nothing visible; do not paraphrase, translate, or summarize.\n" +
    JSON_INSTRUCTION,
  user: () => "Extract all text from the image.",
}

export const TASK_PROMPTS: Record<string, TaskPrompt> = {
  analyze: ANALYZE_PROMPT,
  diagnose: DIAGNOSE_PROMPT,
  ui: UI_PROMPT,
  code: CODE_PROMPT,
}

export function systemForCloudOcr(): string {
  return OCR_FALLBACK_PROMPT.system
}
