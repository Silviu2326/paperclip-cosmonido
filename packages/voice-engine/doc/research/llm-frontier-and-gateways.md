# LLM frontier providers and routing gateways for a TypeScript voice-agent engine

Research date: 2026-10-22. Sources: official provider docs (fetched through WebFetch) unless marked otherwise.

**Verification legend**
- `[V]` verified on an official page fetched on 2026-10-22.
- `[S]` secondary source only (blog, aggregator, or search snippet). Treat as provisional.
- `[U]` not found on the fetched official page; based on prior knowledge or convention. Confirm before coding.

Prices are USD per 1M tokens (standard tier, base input/output) unless noted. "Fast" means the cheapest or lowest-latency tier that the provider positions for high-volume, latency-sensitive work. No provider publishes time-to-first-token (TTFT) numbers in its docs, so TTFT notes are qualitative and must be measured in our own harness.

---

## 1. Anthropic (native Messages API)

- **Base URL / endpoint:** `https://api.anthropic.com/v1/messages` `[V]` (OpenAI-compat base is `https://api.anthropic.com/v1/`, see below).
- **Wire format:** Native (Anthropic Messages). Content is a list of typed blocks (`text`, `image`, `tool_use`, `tool_result`, `thinking`).
- **Auth:** header `x-api-key: $ANTHROPIC_API_KEY` plus `anthropic-version: 2023-06-01` `[V]`.
- **Streaming:** SSE. Events: `message_start`, `content_block_start`, `content_block_delta` (deltas: `text_delta`, `input_json_delta` for tool args, `thinking_delta`), `content_block_stop`, `message_delta`, `message_stop`, `ping`, `error` `[V]`. Usage (including cache fields) appears in `message_start` and `message_delta`.
- **Tool calling:** `tools[]` with `name`, `description`, `input_schema`. Model returns `tool_use` blocks (`id`, `name`, `input`). Results go back as `tool_result` blocks in a user message, matched by `tool_use_id` `[V]` (general format).
  - Forced `tool_choice` (`required` or named) is **not supported** on Opus 5.5, Sonnet 5.5, Fable 5.1 and Mythos 5.1; use `auto` on those `[V]`. Haiku 5.5 is not listed in that note; check before relying on forced tool use.
  - `strict: true` on a tool validates tool inputs against the schema. Max 20 strict tools per request `[V]`.
- **Structured outputs:** `output_config.format = {"type":"json_schema","schema":{...}}`, GA, no beta header needed. Limits: no `minimum`/`maxLength`-style constraints, `additionalProperties` must be `false`, no recursive schemas `[V]`. Older `output_format` needs beta header `structured-outputs-2025-11-13` `[V]`.
- **Prompt caching:** explicit `cache_control: {"type":"ephemeral"}` on blocks (up to 4 breakpoints), or top-level automatic caching. TTL `5m` (default) or `1h` (write costs more) `[V]`. Minimum cacheable prompt: **512 tokens** for the 5.5 and 5 families, 1,024 for Sonnet 5 and 4.x, 4,096 for Haiku 4.5 `[V]`. Usage fields: `cache_creation_input_tokens`, `cache_read_input_tokens`, `input_tokens` `[V]`.
- **Vision / audio:** Image input on all current models `[V]` ("text and image input"). **No audio input** on the Messages API in the docs reviewed. Voice input must be transcribed by a separate STT provider.
- **Thinking:** adaptive thinking. On Claude 5 models it is on by default. Manual `thinking.type="enabled"` + `budget_tokens` is legacy and rejected on later models `[V]`. Effort parameter default: Fable 5.1 `high`, Opus 5.5 `medium`, Sonnet 5.5 `high`, Haiku 5.5 `medium` `[V]`.
- **Sampling caveat:** On Claude 4.7+ models, `temperature` below 1 and any `top_p` other than 0.99 return 400. Omit them `[V]` (from OpenAI-compat page, which states the same limits).

**Current models (official `[V]`, from platform.claude.com models overview, 2026):**

| Tier | Model ID (API and alias) | Context | Max output | Input / Output per MTok | Cache read per MTok | Retirement not sooner than |
|---|---|---|---|---|---|---|
| Flagship (slowest) | `claude-fable-5-1` | 1M | 128K | $10 / $50 | $0.25 | 2027-09-01 |
| Balanced (reasoning and agentic coding) | `claude-opus-5-5` | 1M | 128K | $4 / $20 | $0.20 | 2027-09-22 |
| Balanced-fast | `claude-sonnet-5-5` | 1M | 128K | $2 / $10 | $0.10 | 2027-09-28 |
| Fast | `claude-haiku-5-5` | 1M | 128K | $0.10 / $0.50 (prompts up to 100K tokens); $0.50 / $2.50 above 100K | $0.01 (up to 100K) | 2027-10-07 |

- The user-named IDs `claude-fable-5-1`, `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5` are confirmed `[V]`. The `-5-5` suffix is the dateless snapshot ID.
- Cache write prices (5-minute TTL): Opus 5.5 $5, Sonnet 5.5 $2.50, Haiku 5.5 $0.125 (up to 100K), Fable 5.1 $12.50 `[V]`.
- Batch API: 50% off `[V]`. Batch output up to 300K tokens with beta header `output-300k-2026-03-24` `[V]`.
- Older models still listed: Fable 5, Opus 5, Sonnet 5 (all `[V]`).
- Note: Sonnet 5 had introductory pricing listed in some aggregator pages; the official pricing table lists Sonnet 5 at $2 / $10 with a footnote `[V]`. Do not use aggregator prices.

**Latency for voice:** Haiku 5.5 is positioned as "fastest" and Sonnet 5.5 as "fast"; Fable and Opus are "slower" and "moderate" `[V]`. No TTFT numbers published. Keep effort at `low`/`medium` for voice turns if the option is exposed (effort is a documented parameter).

**Anthropic OpenAI SDK compatibility layer** `[V]`: base URL `https://api.anthropic.com/v1/`, same API key. Docs say it is for testing, not production. Ignores `strict`, `response_format`, `seed`, `service_tier`, audio input, image `detail`. **Prompt caching is not supported** through it. Do not use it for the engine.

---

## 2. OpenAI

- **Base URL / endpoints:** `https://api.openai.com/v1`. Responses `POST /v1/responses` (recommended for all new projects) and Chat Completions `POST /v1/chat/completions` (still supported) `[V]`.
- **Wire format:** Responses is native OpenAI item-based. Chat Completions is the OpenAI-compatible shape that most vendors copy.
- **Auth:** `Authorization: Bearer $OPENAI_API_KEY` `[U]` (convention; not re-fetched).
- **Streaming:** Responses emits typed events: `response.created`, `response.output_text.delta`, `response.function_call_arguments.delta`, `response.function_call_arguments.done`, `response.completed`, `error` `[V]`. Chat Completions streams `choices[0].delta` chunks; usage in the final chunk with `stream_options.include_usage` `[U]` for the last point.
- **Tool calling:** Chat: externally tagged `{"type":"function","function":{name,...}}`, results as `role:"tool"` messages. Responses: internally tagged `{"type":"function","name",...}`, results as `function_call_output` items matched by `call_id` `[V]`. Hosted tools (web search, file search, computer use) only in Responses `[V]`.
- **Structured outputs:** Responses `text.format`; Chat `response_format` `[V]`.
- **State:** Responses stores by default, supports `previous_response_id` or a Conversations API `[V]`.
- **Prompt caching:** automatic; cached input priced separately (see below) `[V]`.
- **Vision / audio:** Realtime audio models exist (`gpt-realtime-2.1`, `gpt-realtime-2.1-mini`) `[V]`. Whether the GPT-6 text models accept image input is not stated on the models page `[U]`.
- **Reasoning effort:** Astra and Sol support `low`, `medium`, `high`, `xhigh`, `max`; Luna also `none` `[V]`.

**Current models (official `[V]`, developers.openai.com models and pricing pages; the page has no last-updated date):**

| Tier | Model ID | Context | Max output | Input / cached / Output per MTok (≤272K input) |
|---|---|---|---|---|
| Flagship | `gpt-6-astra` | 1.05M | 128K | $10 / $1 / $50 |
| Balanced | `gpt-6.1-sol` | 1.05M | 128K | $2 / $0.10 / $10 |
| Fast / efficient | `gpt-6-luna` | 1.05M | 128K | $0.10 / $0.01 / $0.50 |

- Realtime `[V]`: `gpt-realtime-2.1` audio $32 in / $0.40 cached / $64 out; text $4 / $0.40 / $24. `gpt-realtime-2.1-mini` audio $10 / $0.30 / $20; text $0.60 / $0.06 / $2.40.
- Pricing for prompts above 272K input is higher `[V]` (page says short-context tier).
- Older GPT models are not reviewed here.

**Latency for voice:** `gpt-6-luna` is the stated efficient model. Realtime voice goes through the Realtime API (WebSocket or WebRTC), not Chat Completions; that path is not covered in depth here `[U]`.

---

## 3. Google Gemini API and Vertex AI

- **Base URLs:**
  - Native: `https://generativelanguage.googleapis.com/v1beta` `[V]`. Endpoints: `POST /{model=models/*}:generateContent` and `:streamGenerateContent?alt=sse` `[V]`.
  - OpenAI-compatible: `https://generativelanguage.googleapis.com/v1beta/openai/` `[V]`, marked "still in beta".
  - Vertex AI: regional `aiplatform.googleapis.com` / `{REGION}-aiplatform.googleapis.com` endpoints `[U]` (the Vertex model page fetched did not show endpoint details). Auth is OAuth / Application Default Credentials (bearer token) `[U]`.
- **Wire format:** Native is `contents[].parts[]`, `systemInstruction`, `tools[].functionDeclarations`, `generationConfig` (`responseMimeType`, `responseSchema`). Compat layer uses OpenAI shapes.
- **Auth:** The native doc examples pass `?key=$GEMINI_API_KEY` `[V]`. `x-goog-api-key` header is the commonly used alternative `[U]`. Compat layer: `Authorization: Bearer $GEMINI_API_KEY` `[V]`.
- **Streaming:** `alt=sse`; each event is a full `GenerateContentResponse` chunk with partial `candidates[].content.parts`; `usageMetadata` appears in chunks; final chunk has `finishReason` `[V]`.
- **Tool calling:** `tools[].functionDeclarations`; `toolConfig.functionCallingConfig.mode` = `auto` / `any` / `none` `[V]`. Function calls arrive as whole `functionCall` parts, not as argument deltas `[V]` (implied by the response shape; treat as to-verify).
- **Structured outputs:** `generationConfig.responseMimeType` + `responseSchema` (native) `[V]`; `response_format` json_schema via compat `[V]`.
- **Prompt caching:** `cachedContent` (explicit context cache) `[V]`; implicit caching `[U]`.
- **Vision / audio:** Image, video and audio input `[V]` (compat layer lists audio understanding and image understanding).
- **Thinking:** compat `reasoning_effort` maps to thinking levels or budgets; 2.5 Pro and Gemini 3 models cannot turn reasoning off `[V]`.

**Current model IDs (official `[V]`, ai.google.dev models page, last updated 2026-10-22 UTC):**

| Tier | Model ID | Status | Price input / output per MTok (standard, text) |
|---|---|---|---|
| Flagship | `gemini-4-argon` | Stable | $2 / $10 until Nov 30 2026; $4 / $20 from Dec 1 2026. Context: 1M (stated) |
| Fast | `gemini-3.8-flash` | Stable | $0.75 / $3.75 until Dec 31 2026; $1.50 / $7.50 from Jan 1 2027 |
| Fast | `gemini-3.6-flash` | Stable | same as 3.8 Flash |
| Flash-Lite (cheapest) | `gemini-3.5-flash-lite` | Stable | $0.30 (text/audio) / $2.50 |
| Flash-Lite (cheapest) | `gemini-3.1-flash-lite` | Stable | $0.25 text / $1.50 output; audio input $0.50 |
| Live / audio | `gemini-3.8-live` | Stable | $0.75 text in; $3.00 or $0.005/min audio in; $4.50 text out; audio out $12 or $0.018/min |
| TTS | `gemini-3.8-flash-tts`, `gemini-3.8-flash-lite-tts` | Stable | not reviewed |

- Context windows for the Flash and Flash-Lite models are **not listed** on the pricing or models page `[V]`. Gemini 2.5 family has limited access; Gemini 2.0 Flash shut down `[V]`.
- Vertex model IDs for the Gemini family are not confirmed on the fetched page `[U]`.

**Latency for voice:** `gemini-3.8-live` is the native-audio live model. Flash-Lite is the cheapest text tier. No TTFT numbers published `[U]`.

---

## 4. xAI (Grok)

- **Base URL:** `https://api.x.ai/v1` `[V]`.
- **Wire format:** OpenAI-compatible. `POST /v1/responses` is documented `[V]`. `/v1/chat/completions` support is not stated on the fetched page `[U]` (it is expected to work).
- **Auth:** `Authorization: Bearer $XAI_API_KEY` `[V]`.
- **Streaming / tools / structured outputs:** not confirmed on the fetched pages `[U]`; assume OpenAI-shaped SSE and function tools.
- **Prompt caching:** cached input price is listed `[V]`.
- **Vision / audio:** voice product is priced per minute (below) `[V]`.
- **Anthropic-compatible endpoint:** not found `[U]`.

**Models (official `[V]`, docs.x.ai models page; no date shown):**

| Tier | Model ID | Context | Input / cached / Output per MTok (under 200K prompt) |
|---|---|---|---|
| Flagship | `grok-4.7` | 500K | $2 / $0.50 / $6 (above 200K: $4 / $12) |
| Flagship | `grok-4.6` | 500K | $2 / $0.50 / $6 |
| Flagship | `grok-4.5` | 500K | $2 / $0.30 / $6 |
| Mid | `grok-4.3` | 1M | $1.25 / $0.20 / $2.50 |
| Coding | `grok-build-0.1` | 256K | $1 / $0.20 / $2 |

- No model is labelled "fast" or "mini" on the page `[V]`. `grok-4.3` is the cheapest 1M-context text option `[V]`.
- Voice: `grok-voice-3.0` at $0.08/min `[V]`. `grok-voice-2.0` deprecated `[V]`. STT $0.10/hr REST, $0.20/hr streaming; TTS $15 per 1M characters `[V]`.

---

## 5. Mistral

- **Base URL:** `https://api.mistral.ai` with `POST /v1/chat/completions` `[V]`.
- **Wire format:** OpenAI-compatible Chat Completions shape `[V]`.
- **Auth:** `Authorization: Bearer $MISTRAL_API_KEY` `[V]`.
- **Streaming:** `stream: true`, SSE `data:` chunks, ends with `data: [DONE]` `[V]`.
- **Tools:** `tools[]`, `tool_choice` in `auto` / `none` / `any` / `required` / named; `parallel_tool_calls` default true; `role: tool` messages `[V]`.
- **Structured outputs:** `response_format` `json_object` (requires an instruction to emit JSON) or `json_schema` `[V]`.
- **Vision:** Large 4, Medium 3.5, Large 3, Ministral 3 (multimodal) `[V]`. Voxtral family is transcription and speech, not vision `[V]`.

**Models (official `[V]`, docs.mistral.ai models page; no pricing shown there):**

| Tier | Model (display name) | Context | Vision |
|---|---|---|---|
| Flagship | Mistral Large 4 (v26.10) | not stated | yes |
| Balanced | Mistral Medium 3.5 (v26.04) | not stated | yes |
| Fast | Mistral Small 4 (v26.03) | not stated | not stated |
| Edge | Ministral 3 14B / 8B / 3B (v25.12) | not stated | yes |
| Voice | Voxtral family (transcription / speech) | - | - |

- The fetched pages did not show the exact API IDs (aliases such as `mistral-small-latest`) `[U]`. Check the API reference before coding.
- Pricing: the Mistral cloud-pricing URL I tried returned 404 `[U]`. No verified price.

---

## 6. DeepSeek

- **Base URLs:** OpenAI-compatible `https://api.deepseek.com` `[V]`; Anthropic-compatible `https://api.deepseek.com/anthropic` `[V]`.
- **Wire format:** OpenAI-compatible and Anthropic-compatible `[V]`.
- **Auth:** `Authorization: Bearer ${DEEPSEEK_API_KEY}` `[V]`.
- **Streaming:** `stream: true` returns a streamed response `[V]` (format assumed OpenAI SSE).
- **Tools / structured outputs:** not covered on the official quickstart page `[U]`.
- **Thinking:** `thinking: {type: "enabled"}` and `reasoning_effort: "high"` in examples `[V]`.
- **Prompt caching:** cache-hit pricing exists `[S]`.
- **Vision:** `deepseek-v4-flash-vision-exp` legacy alias (retired) suggests vision was tested `[U]`.

**Models (official `[V]` for IDs; prices `[S]`):**
- `deepseek-v4-pro` (flagship).
- `deepseek-flash` (fast): now served by DeepSeek-V4.1-Flash-1017 `[V]`.
- Legacy `deepseek-v4-flash` still accepted but retired (billed at Flash price) `[V]`. Old `deepseek-chat` / `deepseek-reasoner` are not on the current page `[V]` (absence).
- Context 1M and max output 384K `[S]`.
- Prices `[S]`, provisional: Flash about $0.14 input (miss) / $0.0028 (hit) / $0.28 output. Pro conflicting: $0.435 / $0.87 or $1.74 / $3.48. A time-of-day surcharge (peak hours Beijing time) was reported `[S]` with unclear effective date. Check the pricing page.

**Latency for voice:** Flash is the fast tier. Off-peak and peak pricing could also shift latency `[U]`.

---

## 7. Alibaba Qwen (DashScope / Model Studio)

- **Base URLs (OpenAI-compatible)** `[S]` (region-specific, from Alibaba docs quoted in search results):
  - Singapore: `https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1`; legacy `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` still works.
  - US (Virginia): `https://dashscope-us.aliyuncs.com/compatible-mode/v1`.
  - China (Beijing): `https://dashscope.aliyuncs.com/compatible-mode/v1` and workspace form `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`.
  - Keys are region-specific `[S]`.
- **Wire format:** OpenAI-compatible `[S]`; native DashScope API also exists `[U]`.
- **Auth:** `Authorization: Bearer $DASHSCOPE_API_KEY` `[U]` (convention).
- **Streaming / tools / structured outputs / caching:** not confirmed on fetched pages `[U]`.

**Models (official `[V]` for IDs and prices, Model Studio pages dated Oct 11, 2026 and later):**

| Tier | Model ID | Context | Input / Output per MTok (Singapore) | China (Beijing) |
|---|---|---|---|---|
| Flagship | `qwen3.8-max` | up to 1M | $2 / $6 | $1.65 / $4.951 |
| Plus / balanced | `qwen3.7-plus` | ≤256K: $0.40 / $1.60; 256K–1M: $1.20 / $4.80 | | $0.276 / $1.101 (≤256K, limited-time 20% off) |
| Flash / fast | `qwen3.8-flash` | up to 1M | $0.15 / $0.47 | $0.113 / $0.382 |

- Qwen3.7-plus snapshot `qwen3.7-plus-2026-05-26` has the same prices `[V]`.
- Older names (`qwen-plus`, `qwen-flash`, `qwen-max`) appear in LiteLLM docs `[S]`; treat as aliases to verify.

---

## 8. Moonshot Kimi

- **Base URL:** `https://api.moonshot.ai/v1` `[V]` (from kimi-k3 quickstart). China mainland endpoint `[U]`.
- **Wire format:** OpenAI-compatible Chat Completions `[V]`. Anthropic-compatible `/anthropic` path reported by a search snippet `[S]`, not confirmed on the official page.
- **Auth:** `Authorization: Bearer $MOONSHOT_API_KEY` `[V]`.
- **Streaming:** reasoning and answer in separate fields `reasoning_content` and `content` `[V]`.
- **Tools:** standard `tools`; `tool_choice="required"` forces a call on the first turn `[V]`. Official tools run through "Formula" `[V]`.
- **Structured outputs:** `json_schema` with `strict: true` `[V]`.
- **Prompt caching:** automatic; TTL 5m default or 1h via `prompt_cache_options.ttl` `[V]`.
- **Vision:** base64 or `ms://<file-id>` references; no public image URLs `[V]`.
- **Thinking:** always on for K3; `reasoning_effort` accepts `low`, `high`, `max` (default `max`) `[V]`. `temperature`, `top_p`, `n`, penalties are fixed, so omit them `[V]`.
- **Context:** 1M `[V]` for K3. `max_completion_tokens` default 131,072, up to 1,048,576 `[V]`.

**Models:**
- `kimi-k3` (flagship, launched July 2026 `[S]`), `kimi-k2.7-code` (coding) `[S]`, `kimi-k2.6` (general) `[S]`, `kimi-k2.5` `[S]`.
- Prices `[S]`: kimi-k3 about $3 input / $15 output, cache hit about $0.30. kimi-k2.6 conflicting ($0.95/$4.00 or $0.68/$3.41). kimi-k2.5 about $0.60/$3.00. The official pricing page did not render the tables `[U]`.
- No fast tier confirmed `[U]`. Original kimi-k2 reportedly retired (May 2026) `[S]`.
- Top-up minimum $1 `[V]`.

---

## 9. Zhipu GLM (Z.ai)

- **Base URLs:** native/OpenAI-compatible `https://api.z.ai/api/paas/v4` `[S]` (blog). Anthropic-compatible route `[U]`. Official OpenAI intro page returned 404 on the attempt `[U]`.
- **Auth:** Bearer token `[S]`.
- **Wire format:** OpenAI-compatible `[S]`.
- **Streaming / tools / structured outputs:** not confirmed `[U]`.

**Models (prices `[V]` from docs.z.ai pricing page, no date shown; context `[S]`):**

| Tier | Model ID | Input / Output per MTok |
|---|---|---|
| Flagship | `GLM-5.3` | $1.40 / $4.40 |
| Flagship (prior) | `GLM-5.2`, `GLM-5.1` | $1.40 / $4.40 |
| Fast | `GLM-5.3-Flash` | $0.15 / $0.50 |
| Fast | `GLM-5.3-FlashX` | $0.37 / $1.25 |
| Fast (cheapest) | `GLM-4.7-FlashX` | $0.07 / $0.40 |
| Vision | `GLM-4.6V`, `GLM-4.5V` | $0.30 / $0.90 and $0.60 / $1.80 |

- GLM-5.3 and GLM-5.3-Flash are listed as 1M context `[V]` (Mistral page reference for Z.ai GLM 5.3 and 5.3 Flash listing 1M tokens) `[S]`.
- Free models: GLM-4.7-Flash and GLM-4.5-Flash `[V]`.

---

## 10. MiniMax (text models)

- **Base URL:** `https://api.minimax.io/v1` (OpenAI-compatible) `[V]`, set via `OPENAI_BASE_URL`.
- **Auth:** `OPENAI_API_KEY` set to the MiniMax key `[V]`.
- **Models:** `MiniMax-M3`, `MiniMax-M3.1-Flash`; 1,000,000-token context `[V]`.
- **Streaming:** `stream=True`; thinking as `reasoning_content` fragments; usage via `stream_options.include_usage` `[V]`.
- **Tools:** `tools` parameter; deprecated `function_call` unsupported; preserve assistant `tool_calls` and thinking content across turns `[V]`.
- **Constraints:** `temperature`, `top_p` not supported (fixed 1 and 0.95) `[V]`. `n=1` only. **No audio input** `[V]`.
- **Anthropic-compatible endpoint:** not on the fetched page `[U]`.
- **Pricing:** not found on the fetched page `[U]`.

---

## 11. Cohere

- **Base URL:** compatibility API `https://api.cohere.ai/compatibility/v1` `[V]`. Native v2 API at `https://api.cohere.com/v2` `[U]`.
- **Wire format:** OpenAI SDK compatible via the compatibility layer `[V]`.
- **Auth:** `Authorization: Bearer $COHERE_API_KEY` `[V]`.
- **Streaming:** `stream: true` `[V]`. **Tools:** `tools` with `strict` (guarantees schema conformance per docs) `[V]`. **Structured outputs:** `response_format` JSON Schema `[V]`.
- **Vision:** not mentioned `[V]` (absence).
- **Models:** chat `command-a-plus-05-2026` (only chat model listed) `[V]`; embeddings `embed-v5.0-pro`; transcription `cohere-transcribe-03-2026` `[V]`.
- **Context and pricing:** not on the fetched page `[U]`.

---

## 12. Perplexity

- **Base URLs:**
  - Agent API (recommended, Open Responses compatible): `https://api.perplexity.ai/v1/agent` `[V]`. Request uses `input`; response is typed `output[]`.
  - Sonar Chat Completions: `https://api.perplexity.ai/v1/sonar` `[V]`. Support for Sonar Chat Completions ends **2026-09-27** `[V]`, which is already past. Treat as legacy.
- **Auth:** `Authorization: Bearer $PERPLEXITY_API_KEY` `[V]`.
- **Models:** `sonar` (Chat); Agent examples use `openai/gpt-5.6-luna` and models from OpenAI, Anthropic, Google, xAI, Z.AI, Moonshot, NVIDIA, Perplexity Sonar `[V]`.
- **Pricing and context:** not on the fetched page `[U]`.
- **Voice relevance:** web-grounded answers add search latency. Not a good default for a low-latency voice loop.

---

## 13. Gateways and routers

### 13a. OpenRouter
- **Base URL:** `https://openrouter.ai/api/v1/chat/completions` `[V]`. EU in-region: `https://eu.openrouter.ai/api/v1` (Business / Enterprise) `[V]`.
- **Auth:** `Authorization: Bearer` `[V]`; optional `HTTP-Referer` and `X-OpenRouter-Title` headers `[V]`. Env var `OPENROUTER_API_KEY` `[U]` (convention).
- **Wire format:** OpenAI-compatible `[V]`. Anthropic-compatible endpoint not found on the page `[U]`.
- **Model IDs:** `provider/model` slugs `[V]`; `~` prefix = "latest" alias (e.g. `~openai/gpt-sol-latest`) `[V]`. List via `GET /api/v1/models` `[V]`.
- **Routing:** automatic fallbacks; picks most cost-effective provider per request `[V]`. Explicit `models` array and provider preference parameters not documented on the fetched page `[U]`.
- **Streaming format:** SSE is likely `[U]`.
- **Pricing:** pass-through per model `[U]` (not fetched).

### 13b. Vercel AI Gateway
- **Base URL:** `https://ai-gateway.vercel.sh/v1` `[V]`. Endpoints `POST /v1/chat/completions` `[V]`, OpenAI Responses `[V]`, Anthropic Messages `[V]` (listed as supported SDK/API surface).
- **Auth:** `Authorization: Bearer $AI_GATEWAY_API_KEY` `[V]`. Vercel deployments can use OIDC `[V]`.
- **Model IDs:** `provider/model`, e.g. `openai/gpt-6-astra` `[V]`.
- **Routing / fallback:** ordered provider routing, model fallbacks, BYOK, budgets, request logs (provider attempts, latency, cost) `[V]`.
- **Pricing:** "zero markup" on provider token prices, including BYOK `[V]`.
- **Modalities:** text, image, video, speech, transcription, realtime, embeddings, reranking `[V]`.

### 13c. Cloudflare AI Gateway
- **Base URL (unified OpenAI-compatible):** `https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/compat/chat/completions` `[V]`. Note: the page says this single-call compat endpoint is deprecated; new integrations should use `https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/v1/chat/completions` `[V]`.
- **Model names:** `{provider}/{model}`, e.g. `openai/gpt-5-mini`, `anthropic/claude-sonnet-4-5`, `google-ai-studio/gemini-2.5-flash`; `dynamic/{route}` for routes `[V]`.
- **Auth:** provider key as `Authorization: Bearer`, plus `cf-aig-authorization: Bearer {cf_api_token}` when the gateway is authenticated; BYOK stored keys use a Cloudflare token `[V]`.
- **Features:** caching, retries and model fallbacks, logging `[V]`.
- Anthropic-native endpoint pattern not confirmed `[U]`.

### 13d. LiteLLM (self-hosted proxy)
- **Base URL:** the proxy, e.g. `http://0.0.0.0:4000` or your host; do not append paths to the base URL (the client adds them) `[V]`.
- **Auth:** bearer key, including virtual keys `[V]`.
- **Model naming:** client requests a `model_name` alias defined in `config.yaml`; upstream uses `openai/`-style provider prefixes `[V]`.
- **Anthropic `/v1/messages` and streaming:** not covered by the fetched page `[U]`. LiteLLM is commonly used as a unified proxy; verify before relying on it.

---

## 14. Local serving

### 14a. Ollama
- **Base URL:** `http://localhost:11434/v1/` (OpenAI-compatible) `[V]`. Cloud: `https://ollama.com/v1` with `OLLAMA_API_KEY` `[V]`.
- **Auth:** local ignores the key; any placeholder works `[V]`.
- **Endpoints:** `/v1/chat/completions` (streaming, JSON mode, tools, reasoning control, vision via base64 only); `/v1/completions`; `/v1/models`; `/v1/embeddings`; `/v1/audio/speech` (WAV/PCM, streamed, v0.40.8+); `/v1/responses` (streaming, function tools; no `previous_response_id`) `[V]`.
- **Anthropic-compatible endpoint:** not on the fetched page `[U]`.
- **Latency:** hardware dependent. Not measured here.

### 14b. LM Studio
- **Base URL:** `http://localhost:1234/v1` `[V]`.
- **Endpoints:** `POST /v1/chat/completions`, `POST /v1/responses`, `POST /v1/embeddings`, `POST /v1/completions`, `GET /v1/models`, `POST /v1/decisions` `[V]`. Anthropic Messages compatibility section exists `[V]` (exists, not documented in detail on the fetched page).
- **Auth:** not described on the fetched page `[U]`.

### 14c. vLLM
- **Base URL:** `http://localhost:8000/v1` default port `[U]` (not on the fetched page). Serve with `--api-key` for auth `[U]`.
- **Endpoints:** `/v1/chat/completions` (requires a chat template), `/v1/responses`, `/v1/completions`, `/v1/messages` and `/v1/messages/count_tokens` (Anthropic Messages) `[V]`, embeddings, transcriptions `[V]`.
- **Tools:** `parallel_tool_calls` documented `[V]`; the server flags `--enable-auto-tool-choice` and `--tool-call-parser` are `[U]` (from prior knowledge).
- The docs page is labelled as the latest preview, dated 2026-10-14 `[V]`.

---

## 15. Recommended common `LlmProvider` interface

Minimal shape that fits Anthropic-native, OpenAI-compatible (Chat and Responses) and Gemini-native. Provider adapters translate; the engine sees only this.

```ts
// Normalised conversation. Images are by URL or base64; no provider-specific fields.
export type LlmContent =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: string; data?: string; url?: string }
  | { type: "tool_call"; id: string; name: string; input: unknown }
  | { type: "tool_result"; toolCallId: string; output: string; isError?: boolean };

export interface LlmMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: LlmContent[];
}

export interface LlmToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema subset valid on all targets
  strict?: boolean;
}

export interface LlmRequest {
  model: string;
  system?: string;               // hoisted to system field / system role / systemInstruction
  messages: LlmMessage[];
  tools?: LlmToolDef[];
  toolChoice?: "auto" | "none" | "required" | { name: string };
  maxOutputTokens: number;
  temperature?: number;          // omitted automatically when the model rejects it
  effort?: "none" | "low" | "medium" | "high" | "max";
  responseFormat?: { type: "text" } | { type: "json_schema"; name: string; schema: Record<string, unknown> };
  cache?: { ttl?: "5m" | "1h" };
  signal?: AbortSignal;
}

export type LlmStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "thinking_delta"; text: string }
  | { type: "tool_call_start"; id: string; name: string }
  | { type: "tool_call_args_delta"; id: string; json: string } // Gemini emits none; adapter emits start+end together
  | { type: "tool_call_end"; id: string; input: unknown }
  | { type: "usage"; usage: LlmUsage }
  | { type: "stop"; reason: "end_turn" | "tool_use" | "max_tokens" | "refusal" | "error" | "other" }
  | { type: "error"; code?: string; message: string; retryable: boolean };

export interface LlmUsage {
  inputTokens: number;           // total input, including cached
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
}

export interface LlmProvider {
  readonly id: string;           // see table in section 17
  stream(req: LlmRequest): AsyncIterable<LlmStreamEvent>;
  complete(req: LlmRequest): Promise<{ messages: LlmMessage[]; usage: LlmUsage; stop: LlmStreamEvent & { type: "stop" } }>;
  capabilities(model: string): { tools: boolean; strictTools: boolean; vision: boolean; audioIn: boolean; jsonSchema: boolean; cache: boolean };
}
```

Mapping notes:
- **Anthropic:** `system` top-level; `content_block_delta` `input_json_delta` maps to `tool_call_args_delta`; usage from `message_start` and `message_delta`; `tool_result` maps to a user-role block.
- **OpenAI Chat:** `system` role; `delta.tool_calls[].function.arguments` string fragments; usage only in the last chunk when `include_usage` is set.
- **OpenAI Responses:** `response.function_call_arguments.delta` / `.done`; `function_call_output` items with `call_id`.
- **Gemini native:** `systemInstruction`; `functionCall` arrives whole, so emit start and end back-to-back; usage in `usageMetadata` on chunks.
- Anthropic `temperature` below 1 and `top_p` values on 4.7+ must be dropped by the adapter, not the caller.

---

## 16. Which providers can reuse one OpenAI-compatible adapter

**One shared OpenAI Chat Completions adapter (base URL and key differ only):**
- OpenAI (Chat path; Responses path is a separate small adapter if needed)
- DeepSeek (`https://api.deepseek.com`)
- Qwen / DashScope (`compatible-mode/v1`)
- Moonshot Kimi (`https://api.moonshot.ai/v1`)
- Zhipu GLM (`https://api.z.ai/api/paas/v4`) `[S]` base URL
- MiniMax (`https://api.minimax.io/v1`)
- xAI (`https://api.x.ai/v1`) (chat path not confirmed `[U]`)
- Mistral (`https://api.mistral.ai/v1`)
- OpenRouter, Vercel AI Gateway (`/v1/chat/completions`), Cloudflare AI Gateway compat, LiteLLM proxy
- Ollama (`/v1`), LM Studio (`/v1`), vLLM (`/v1`)
- Gemini OpenAI-compat (`/v1beta/openai/`) is possible but in beta; prefer native for caching and live audio.
- Cohere compat (`/compatibility/v1`) works for chat, tools and JSON, but is a compatibility layer; native is safer.

**Needs a native adapter (or a separate one):**
- Anthropic Messages (`/v1/messages`). Also reachable through Vercel AI Gateway, vLLM and DeepSeek/GLM/Kimi Anthropic-compatible routes, but the Anthropic-native adapter is the primary.
- Gemini native (`:streamGenerateContent?alt=sse`), for caching, `cachedContent`, and Live audio (`gemini-3.8-live`).
- Perplexity Agent API (Open Responses shape).
- OpenAI Responses API (only if we need hosted tools or stateful response chaining; not needed for voice turns).
- Cohere native v2 (optional).
- OpenAI Realtime and xAI voice are separate audio transports; they are not chat adapters.

---

## 17. Provider id -> baseUrl -> env var -> default fast model for voice

Env var names marked `[U]` are conventions, not verified on official pages. Fast model IDs are the cheapest or lowest-latency options named by the provider; none of these is benchmarked for TTFT.

| provider id | baseUrl | env var | default fast model for voice | Adapter | Notes |
|---|---|---|---|---|---|
| `anthropic` | `https://api.anthropic.com/v1` | `ANTHROPIC_API_KEY` `[V]` | `claude-haiku-5-5` | native | `anthropic-version: 2023-06-01`; no audio input |
| `openai` | `https://api.openai.com/v1` | `OPENAI_API_KEY` `[U]` | `gpt-6-luna` | openai-chat | Realtime voice separate: `gpt-realtime-2.1-mini` |
| `gemini` | `https://generativelanguage.googleapis.com/v1beta` | `GEMINI_API_KEY` `[U]` | `gemini-3.5-flash-lite` | native (or openai compat `/v1beta/openai/`) | Live audio: `gemini-3.8-live` |
| `vertex` | `https://{REGION}-aiplatform.googleapis.com` `[U]` | ADC / `GOOGLE_APPLICATION_CREDENTIALS` `[U]` | `gemini-3.5-flash-lite` (confirm Vertex ID) | native | Bearer token from ADC |
| `xai` | `https://api.x.ai/v1` `[V]` | `XAI_API_KEY` `[V]` | `grok-4.3` | openai-chat | No "fast" tier published; cheapest 1M |
| `mistral` | `https://api.mistral.ai/v1` `[V]` | `MISTRAL_API_KEY` `[V]` | Mistral Small 4 (confirm API ID) | openai-chat | Pricing unverified |
| `deepseek` | `https://api.deepseek.com` `[V]` | `DEEPSEEK_API_KEY` `[V]` | `deepseek-flash` `[V]` | openai-chat (or `/anthropic`) | Prices provisional |
| `qwen` | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` (or workspace endpoint) `[S]` | `DASHSCOPE_API_KEY` `[U]` | `qwen3.8-flash` `[V]` | openai-chat | Region-specific keys |
| `kimi` | `https://api.moonshot.ai/v1` `[V]` | `MOONSHOT_API_KEY` `[V]` | `kimi-k3` (no fast tier confirmed) `[U]` | openai-chat | Thinking always on; use `reasoning_effort: low` |
| `glm` | `https://api.z.ai/api/paas/v4` `[S]` | `ZAI_API_KEY` `[U]` | `GLM-5.3-Flash` `[V]` | openai-chat | Base URL not confirmed on official docs |
| `minimax` | `https://api.minimax.io/v1` `[V]` | `MINIMAX_API_KEY` `[U]` | `MiniMax-M3.1-Flash` `[V]` | openai-chat | No audio input; temperature fixed |
| `cohere` | `https://api.cohere.ai/compatibility/v1` `[V]` | `COHERE_API_KEY` `[V]` | `command-a-plus-05-2026` `[V]` | openai-chat (compat) | No fast tier; no pricing |
| `perplexity` | `https://api.perplexity.ai/v1/agent` `[V]` | `PERPLEXITY_API_KEY` `[V]` | n/a for voice | perplexity-agent | Web search adds latency |
| `openrouter` | `https://openrouter.ai/api/v1` `[V]` | `OPENROUTER_API_KEY` `[U]` | `openai/gpt-6-luna` (slug `[U]`) | openai-chat | Pass-through pricing |
| `vercel` | `https://ai-gateway.vercel.sh/v1` `[V]` | `AI_GATEWAY_API_KEY` `[V]` | `openai/gpt-6-luna` `[U]` slug | openai-chat or anthropic-messages | Zero markup; OIDC on Vercel |
| `cloudflare` | `https://gateway.ai.cloudflare.com/v1/{account}/{gateway}/compat` `[V]` | provider key + `CLOUDFLARE_API_TOKEN` (for `cf-aig-authorization`) `[V]` | `openai/gpt-6-luna` `[U]` slug | openai-chat | Compat endpoint deprecated for single calls |
| `litellm` | `http://localhost:4000` (self-hosted) `[V]` | `LITELLM_API_KEY` `[U]` | your alias for a fast model | openai-chat | Verify `/v1/messages` if used |
| `ollama` | `http://localhost:11434/v1` `[V]` | `OLLAMA_API_KEY` (cloud only) `[V]` | local model you pull | openai-chat | Vision base64 only |
| `lmstudio` | `http://localhost:1234/v1` `[V]` | none `[U]` | local model | openai-chat | Auth not documented on fetched page |
| `vllm` | `http://localhost:8000/v1` `[U]` | `VLLM_API_KEY` `[U]` (if `--api-key`) | served model name | openai-chat or anthropic-messages (`/v1/messages` `[V]`) | Chat template required |

---

## 18. Caveats and items to check before coding

1. No provider publishes TTFT. Build a small measurement harness and measure per provider and region.
2. Several model IDs and prices come from third-party sources (DeepSeek, Kimi, GLM, Qwen beyond the official Qwen table, Perplexity, OpenRouter). Confirm each before committing.
3. Official pages showing no date: OpenAI models, xAI, Mistral, Kimi, DeepSeek, Cohere, Perplexity, MiniMax. Treat these as current as of 2026-10-22 but re-fetch before release.
4. Anthropic's Haiku 5.5 is not in the forced-tool-use exception list. Verify before relying on forced tool choice with Haiku.
5. Gemini Flash and Flash-Lite context windows are not stated on official pages.
6. Gemini `x-goog-api-key` header is not confirmed on the fetched native doc (examples use `?key=`).
7. Perplexity Sonar Chat Completions support ends 2026-09-27 (already past): do not target it.
8. Cloudflare's single-call compat endpoint is marked deprecated in the fetched docs.
9. The Anthropic OpenAI-SDK compatibility layer is for evaluation only, has no prompt caching, and drops `strict`. Use the native Messages API.
10. Some Anthropic prompt-cache read rates differ by model (Fable 5.1 cache read $0.25, Opus 5.5 $0.20, Sonnet 5.5 $0.10, Haiku 5.5 $0.01 per MTok); the models overview quoted percentages (2.5%, 5%, 10%) that match.
