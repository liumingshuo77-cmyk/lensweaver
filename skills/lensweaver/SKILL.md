---
name: lensweaver
description: Guide for using the LensWeaver tools (vision_analyze, vision_ocr, vision_diagnose_error, vision_describe_ui, vision_extract_code) to read images, screenshots and clipboard content with text-only models. Use when the user references an image, pastes a screenshot, asks about an error screenshot, wants UI review, or wants text/code extracted from an image.
---

# LensWeaver 使用指南

## 何时使用

- 用户提到截图、报错画面、图片文件、或剪贴板里有图 → 用 vision 工具
- 用户问"这张图/这个报错/这个界面" → 用 vision 工具
- 模型本身不支持读图时, 所有"看图"需求都应走这些工具

## 工具选择

| 场景 | 工具 |
|---|---|
| 报错截图 (终端/控制台/崩溃框/测试失败) | `vision_diagnose_error` |
| 界面截图 (网页/桌面/移动端) 评审 | `vision_describe_ui` |
| 从图片提取代码 | `vision_extract_code` |
| 纯文字提取 / OCR | `vision_ocr` (本地 RapidOCR 优先) |
| 其他看图问答 (图表/示意图/文档截图) | `vision_analyze` |

## 传图方式 (三选一)

1. `imagePath`: 图片文件路径 (绝对路径, 或相对会话目录的路径)
2. `imageBase64`: base64 编码的图片数据
3. `clipboard: true`: 直接读系统剪贴板里的图片 (用户在 opencode 里粘贴图片时会自动落盘, 优先用 imagePath)

一次只能传一个来源。图片最大 25MB, 支持 png/jpg/jpeg/webp/gif/bmp。

## 使用要点

- 报错诊断优先用 `vision_diagnose_error`, 不要先用 vision_ocr 再自己解读 — 专用工具输出结构更好 (含 cause/fix/commands/confidence)
- 报错截图较模糊或关键文字被裁掉时, 结果 confidence 会是 low, 应主动提示用户重新截图
- `vision_ocr` 本地引擎失败或置信度过低时会自动回退云端; 结果里的 engine 字段标明实际来源
- 所有工具返回结构化 JSON, 直接向用户转述关键字段即可, 不必贴完整 JSON
- 结果有缓存: 同一张图短时间内重复分析会命中缓存 (TTL 默认 7 天), 不会重复消耗

## 配置

`~/.config/opencode/lensweaver.env` 存放 VISION_ 前缀配置:
- VISION_API_BASE_URL / VISION_API_KEY / VISION_MODELS: 云端视觉模型 (默认 opencode-go 的 mimo-v2.5)
- VISION_PYTHON: Python 侧车解释器路径
- VISION_OFFLINE=1: 纯本地模式 (仅 OCR)

## 排障

- "python executable ... not found" → 检查 VISION_PYTHON, 运行 `setup.ps1`
- "no vision model configured" → 检查 VISION_API_BASE_URL / VISION_API_KEY / VISION_MODELS
- "clipboard does not contain an image" → 让用户先复制图片再重试
