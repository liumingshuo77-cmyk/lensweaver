# vision-pro

给 opencode 纯文本模型 (DeepSeek / GLM 等) 补上"看图"能力的插件。本地 RapidOCR + 云端视觉模型，全部结构化输出。

## 特性

- **5 个结构化输出工具**: `vision_analyze` / `vision_ocr` / `vision_diagnose_error` / `vision_describe_ui` / `vision_extract_code`
- **混合视觉后端**: 本地 RapidOCR (免费离线, 带置信度/bbox) + 云端视觉模型 (OpenAI 兼容)
- **质量优先**: 每任务独立 prompt + few-shot、Zod Schema 校验、JSON 修复与反馈重试、模型自动回退
- **成本优化**: 图片降采样预处理、sha256 结果缓存 (TTL 7 天)、本地 OCR 优先
- **隐私**: 密钥存 `~/.config/opencode/vision-pro.env`, 支持 `VISION_OFFLINE=1` 纯本地模式

## 架构

```
opencode (DS 主模型)                    vision-pro 插件
        │                                      │
  需要看图 ──────────── 调用 vision 工具 ────────┤
        │                                      │
        │                   本地 RapidOCR ◄─────┼── 文字提取优先走本地
        │                                      │
        │              OpenAI 兼容端点 ◄────────┴── 理解任务走云端
        │                (opencode-go mimo-v2.5)    (图片转文字描述)
        │                                      │
  基于文字描述继续推理 / 改代码 / 执行命令
```

主模型始终是 DeepSeek 等文本模型; 视觉模型只负责"看图转文字", 不参与任何后续操作。

```
plugin/
├── vision-pro.ts            # 插件入口 (id: vision-pro), 注册 5 个工具
└── vision-pro-lib/
    ├── config.ts            # 配置: 环境变量 + vision-pro.env
    ├── image.ts             # 图片读取 / 魔数嗅探 / 哈希
    ├── schema.ts            # Zod 输出 Schema
    ├── repair.ts            # JSON 提取 / 修复 / 校验
    ├── prompts.ts           # 每任务 prompt + few-shot
    ├── cloud.ts             # OpenAI 兼容客户端 (重试 / 模型回退 / JSON 降级)
    ├── cache.ts             # 磁盘缓存
    ├── ocr.ts               # Python 侧车进程管理 (常驻, JSON lines)
    ├── worker.py            # RapidOCR + 预处理 + 剪贴板
    ├── setup.ps1            # venv 初始化
    └── tools/               # 5 个工具定义
```

## 安装

```powershell
# 1. 克隆仓库
git clone https://github.com/liumingshuo77-cmyk/vision-pro
cd vision-pro

# 2. 安装: 复制插件 + skill + 初始化 Python 侧车 (venv + rapidocr + pillow)
powershell -ExecutionPolicy Bypass -File install.ps1

# 3. (可选) 配置视觉后端
notepad "$env:USERPROFILE\.config\opencode\vision-pro.env"
```

重启 opencode 后 5 个工具自动可用。

### 默认配置 (零配置可用)

| 项 | 默认值 |
|---|---|
| 云端端点 | `https://opencode.ai/zen/go/v1` (opencode-go) |
| 视觉模型 | `mimo-v2.5` (回退: qwen3.7-plus, qwen3.6-plus) |
| API Key | 自动读取 `OPENCODE_GO_API_KEY` / `GROQ_API_KEY` / `VISION_API_KEY` |
| 本地 OCR | 需 Python venv (setup.ps1 自动创建) |

## 用法

```
用户: (粘贴报错截图) 这个报错怎么回事?
助手: 调用 vision_diagnose_error(imagePath=...) → {error_type, root_cause, fix_steps, commands, ...}

用户: 看我剪贴板里的截图
助手: 调用 vision_analyze(clipboard=true)

用户: 把 src/screenshot.png 里的代码提取出来
助手: 调用 vision_extract_code(imagePath="src/screenshot.png")
```

opencode TUI 里 `Ctrl+V` 粘贴图片会自动存盘, agent 拿到路径后直接传 `imagePath`。

## 工具输出

| 工具 | 输出结构 |
|---|---|
| `vision_analyze` | `{summary, key_details[], actions[]}` |
| `vision_ocr` | `{text, blocks[{text, confidence, bbox}], engine: rapidocr\|cloud, confidence}` |
| `vision_diagnose_error` | `{error_type, summary, root_cause, fix_steps[], commands[], affected_files[], confidence}` |
| `vision_describe_ui` | `{app_name, components[], visible_text[], layout, problems[], suggestions[]}` |
| `vision_extract_code` | `{language, code, explanation, confidence}` |

## 配置项 (`vision-pro.env` 或环境变量, 环境变量优先)

| 变量 | 默认 | 说明 |
|---|---|---|
| VISION_API_BASE_URL | opencode.ai/zen/go/v1 | OpenAI 兼容端点 |
| VISION_API_KEY | 空 | API key (回退 GROQ_API_KEY / OPENCODE_GO_API_KEY) |
| VISION_MODELS | mimo-v2.5,... | 逗号分隔模型列表 (自动回退) |
| VISION_PYTHON | python | Python 侧车解释器路径 |
| VISION_OFFLINE | 0 | 1 = 纯本地 OCR, 禁止云请求 |
| VISION_MAX_DIM | 1568 | 云端请求前图片最大长边 |
| VISION_OCR_MIN_CONFIDENCE | 0.55 | 本地 OCR 置信度阈值, 低于则回退云端 |
| VISION_TIMEOUT_MS | 60000 | 云端请求超时 |
| VISION_CACHE_TTL_MS | 7 天 | 结果缓存有效期 |
| VISION_CACHE_MAX | 500 | 缓存最大条目数 |

## 质量保障链路

1. 云端请求带 `response_format: json_object` (端点不支持时自动降级重试)
2. 响应先经 JSON 修复器 (代码块 / 截断 / 尾逗号)
3. Zod Schema 校验; 失败则把错误反馈回模型重试 (最多 2 次)
4. 模型 404 / 下线自动切换候选 (启动时拉取端点 `/models` 动态发现)
5. 5xx / 429 指数退避重试

## 开发

```powershell
cd dev
npm install
npx tsc -p tsconfig.json          # 类型检查
node bundle.mjs                   # 打包为测试用 bundle
node unit.mjs                     # mock provider 单元测试 (模型回退/JSON 修复/反馈重试)
node e2e.mjs                      # 本地 OCR 端到端 (需 python + rapidocr)
```

## 已知限制

- 云端模型回退依赖端点 `/models` 列表可访问
- 剪贴板读取仅在剪贴板含图片时成功
- 截图含敏感信息时请自行评估是否上传云端 (可切 `VISION_OFFLINE=1`)

## License

MIT
