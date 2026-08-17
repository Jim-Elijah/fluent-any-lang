# Agent Prompt：FluentAnyLang 语音评分后端（MVP）

> 用途：交给 AI Agent，从零生成独立仓库 `fluent-any-lang-speech-api` 的完整代码。  
> 关联前端：`fluent-any-lang`（Lit + Vite + PWA，IndexedDB 本地存储）

---

## 背景

FluentAnyLang 是一个 Lit + Vite + PWA 的语言听说练习 Web 应用。数据以 IndexedDB 本地为主。

**第一阶段目标**：新建独立 Python 后端仓库，负责：

- 接收用户录音 + 参考文本（Subtitle Segment 的原文）
- 返回发音评分：准确度、流利度、完整度、韵律、综合总分
- 前端仅调用 API 并展示结果（不在此仓库实现前端）

桌面端 / 移动端延后；本服务只提供 HTTP API。

---

## 技术栈（必须）

| 类别 | 选型 |
|------|------|
| 语言 | Python 3.11+ |
| Web 框架 | FastAPI + Uvicorn |
| ASR / 对齐 | WhisperX（底层 faster-whisper） |
| VAD（可选） | Silero VAD（流利度：停顿 / 语速） |
| 校验 | pydantic v2 |
| 上传 | python-multipart |
| 鉴权 | API Key（无注册 / 登录） |
| 格式化 & Lint | **ruff**（`ruff format` + `ruff check`） |
| 推理设备 | **CPU 与 GPU（CUDA）均须支持** |

---

## 仓库与项目结构

**仓库名**：`fluent-any-lang-speech-api`

```
fluent-any-lang-speech-api/
├── app/
│   ├── main.py                 # FastAPI app、CORS、路由挂载
│   ├── config.py               # 环境变量（模型、设备、限流、CORS）
│   ├── auth/
│   │   └── api_key.py          # X-API-Key 校验、过期、吊销
│   ├── middleware/
│   │   └── rate_limit.py       # 按 key 的 QPS / 日配额
│   ├── routers/
│   │   └── pronunciation.py    # POST /api/v1/pronunciation/score
│   ├── services/
│   │   ├── asr.py              # WhisperX 封装
│   │   ├── alignment.py        # 词级对齐
│   │   ├── scoring.py          # 五维评分逻辑
│   │   ├── prosody.py          # 语速 / 节奏 / F0 / 重音
│   │   └── device.py           # CPU/GPU 检测与设备选择
│   ├── models/
│   │   └── schemas.py          # Pydantic 模型
│   └── utils/
│       └── audio.py            # 格式转换、时长校验、16 kHz mono
├── tests/
│   ├── test_auth.py
│   ├── test_scoring.py
│   ├── test_device.py
│   └── fixtures/               # 短 wav + reference text
├── scripts/
│   └── generate_api_key.py     # 生成带过期时间的 key
├── docker/
│   ├── Dockerfile              # CPU 默认镜像
│   └── Dockerfile.gpu          # CUDA 镜像（可选）
├── .env.example
├── pyproject.toml              # 依赖 + ruff 配置
├── docker-compose.yml          # CPU 默认
├── docker-compose.gpu.yml      # GPU 覆盖（nvidia runtime）
├── README.md
└── Makefile                    # ruff check + ruff format + pytest
```

---

## CPU / GPU 支持（必须实现）

### 环境变量

在 `.env.example` 中提供：

```env
# cpu | cuda | auto（默认 auto：有 CUDA 则用 GPU，否则 CPU）
DEVICE=auto

# WhisperX 模型：tiny / base / small / medium（MVP 默认 base，CPU 可跑）
WHISPERX_MODEL=base

# cuda 时可选：cuda:0
CUDA_DEVICE=0

# 批大小（GPU 可调大；CPU 保持 1）
BATCH_SIZE=1
```

### 设备选择逻辑（`app/services/device.py`）

1. `DEVICE=auto`：`torch.cuda.is_available()` 为真 → `cuda`，否则 `cpu`
2. `DEVICE=cuda` 但无 CUDA → 启动时打 **warning** 并回退 `cpu`（README 说明此行为）
3. `DEVICE=cpu` → 强制 CPU，`compute_type=int8`（faster-whisper）等 CPU 友好参数
4. GPU → `compute_type=float16`（或 float32，按 WhisperX 文档）
5. `/health` 响应中返回当前设备：`"device": "cpu" | "cuda"`

### Docker

- **CPU**：默认 `docker-compose.yml`，无 NVIDIA 依赖
- **GPU**：`docker-compose.gpu.yml` + `Dockerfile.gpu`（`nvidia/cuda` 基础镜像），文档说明需安装 [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html)
- README 分别给出 CPU / GPU 启动命令

### README 要求

- 最低配置：仅 CPU 可运行（小模型 + 较长延迟可接受）
- 推荐配置：NVIDIA GPU + CUDA，说明预期延迟差异
- 首次运行需下载的 WhisperX 模型及大致磁盘占用

---

## 代码质量：ruff（必须）

在 `pyproject.toml` 中配置 ruff，并暴露脚本：

```toml
[project]
# ...

[dependency-groups]
dev = ["ruff>=0.8", "pytest", "pytest-asyncio", "httpx"]

[tool.ruff]
target-version = "py311"
line-length = 100
src = ["app", "tests", "scripts"]

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B", "SIM"]
ignore = []

[tool.ruff.format]
quote-style = "double"
```

**Makefile**：

```makefile
lint:
	ruff check app tests scripts
format:
	ruff format app tests scripts
format-check:
	ruff format --check app tests scripts
test:
	pytest
```

Agent 交付的代码须通过 `ruff check` 与 `ruff format --check`（或已 format 后的干净树）。不使用 black / isort 混用。

---

## API 契约

### POST `/api/v1/pronunciation/score`

**Headers**

- `X-API-Key: <key>`（必填）
- `Content-Type: multipart/form-data`

**Form fields**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `audio` | file | 是 | 用户录音，wav / webm / m4a / mp3，≤ 60 s，≤ 10 MB |
| `reference_text` | string | 二选一 | 参考原文（Subtitle Segment 文本）；与 `reference_audio` 同时存在时优先使用 |
| `reference_audio` | file | 二选一 | 参考原声音频；仅在无 `reference_text` 时 ASR 转写为参考文本 |
| `language` | string | 否 | BCP-47，如 `en`、`zh`、`ja`；默认 `auto` |

**Response 200**

```json
{
  "accuracy": 82.5,
  "fluency": 92.0,
  "completeness": 95.0,
  "prosody": 81.0,
  "overall": 84.6,
  "details": {
    "transcript": "识别出的文本",
    "word_scores": [
      { "word": "hello", "start": 0.12, "end": 0.45, "score": 90 }
    ],
    "missing_words": ["the"],
    "extra_words": [],
    "speech_rate_wpm": 128,
    "pause_count": 1,
    "duration_sec": 4.2,
    "reference_transcript": null,
    "prosody_breakdown": {
      "speed": 100.0,
      "rhythm": 85.0,
      "intonation": 78.0,
      "stress": 82.0
    }
  },
  "meta": {
    "model": "whisperx-base",
    "device": "cuda",
    "latency_ms": 3200,
    "reference_source": "text"
  }
}
```

**错误码**

| 状态码 | 含义 |
|--------|------|
| 401 | 无效 / 过期 API Key |
| 413 | 音频过大或过长 |
| 422 | 参数校验失败 |
| 429 | 超出配额 |
| 503 | 模型未加载 |

### GET `/health`

无需鉴权：

```json
{
  "status": "ok",
  "device": "cpu",
  "model_loaded": true
}
```

---

## 评分逻辑（脚本朗读 / Azure Scripted 对齐）

跟读字幕有原文，**不评 Grammar / Vocabulary**（那是自由说）。在 WhisperX 转写 + 词级强制对齐基础上实现五维评分：

1. **完整度 (completeness)**  
   SequenceMatcher 覆盖率；英文缩写/连读双向展开（`its` ↔ `it is`）。漏词扣完整度，不直接扣准确度。

2. **准确度 (accuracy)**  
   `0.7 * 词面匹配 + 0.3 * 校准声学`。词面对上为 100，近音用编辑距离；WhisperX 对齐置信度经曲线校准（约 45→70、70→88、90→97），避免 raw×100 把正常朗读打到 50–70。词级 `word_scores` 使用同一混合分。

3. **流利度 (fluency)**  
   只评不当静音停顿（对齐 Azure Fluency）。词间 gap > 0.5s 且不在标点后：每次 -8，最多 -40。语速不进入流利度。

4. **韵律 (prosody)**  
   `0.35*语速 + 0.25*节奏 + 0.25*语调 + 0.15*重音`。语速在区间内满分（英文 90–180 WPM，CJK 150–280 CPM）；节奏看非标点词间 gap；语调来自 F0 变异系数；重音比较内容词与虚词的时长/能量。

5. **综合分 (overall)**  
   默认：`0.4 * accuracy + 0.2 * fluency + 0.2 * completeness + 0.2 * prosody`，权重可通过环境变量配置。

所有分数 **0–100**，保留一位小数。标定目标：母语跟读约 90–100，能听清、少量停顿约 75–88。

---

## 鉴权与防滥用（内测 MVP）

- API Key 存配置或 JSON / SQLite：`key_hash`、`expires_at`、`daily_quota`、`used_today`、`revoked`
- 每 key 限制：**10 req/min**、**100 req/day**、单次音频 **≤ 60 s**
- Key 支持过期；提供 `scripts/generate_api_key.py`
- 日志：key_id（非明文）、latency、audio_duration；**不持久化原始音频**（处理完删除临时文件）

---

## 非功能需求

- **CORS**：`http://localhost:5173`、`http://127.0.0.1:5173` + `.env` 可配置 `CORS_ORIGINS`
- 模型 **懒加载 + 单例**，避免每请求重载
- MVP 同步处理即可；README 注明后续 Celery + Redis
- 类型注解完整；公共函数有 docstring
- 至少 **5 个单元测试**（含 `test_device.py` mock CUDA 有无）
- 集成测试可选，标记 `@pytest.mark.slow`
- **不要**实现前端；**不要**实现用户注册登录

---

## 交付物清单

- [ ] 可运行 FastAPI 项目：`uvicorn app.main:app --reload`
- [ ] CPU 与 GPU 均可启动（文档 + Docker 双路径）
- [ ] `pyproject.toml` 含 ruff 配置；`make lint` / `make format` 可用
- [ ] 中文 README：本地启动、Docker CPU/GPU、curl 示例、与 FluentAnyLang 对接说明
- [ ] `.env.example` + `generate_api_key.py`
- [ ] ≥ 5 单元测试，CI 友好（ruff + pytest）

---

## 约束摘要

| 项 | 要求 |
|----|------|
| 设备 | CPU 默认可跑；GPU 加速可选，`DEVICE=auto` |
| 依赖 | 版本 pin 在 `pyproject.toml` |
| 风格 | ruff format + ruff check，无 black / isort 混用 |
| 范围 | 仅后端 API，不含前端 |

---

## Agent 执行说明

请从零生成完整仓库代码，并在 README 末尾附：

1. 首次运行前需执行的命令（含模型下载）
2. CPU vs GPU 预期延迟量级（示例句 5 s 音频）
3. 已知限制与后续迭代方向（Celery、音素 GOP、多语言分词优化）

完成后自检：

```bash
ruff check app tests scripts
ruff format --check app tests scripts
pytest -q
uvicorn app.main:app --host 0.0.0.0 --port 8000
```
