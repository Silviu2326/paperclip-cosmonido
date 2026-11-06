# Ultra-fast LLM inference providers for a real-time voice-agent engine

Research date: 2026-10-22. Sources: official provider docs and pricing pages fetched on this date (WebFetch), plus a few third-party pages where noted. Page dates are often absent; "no date" means the fetched page showed none. Anything marked UNVERIFIED was not confirmed on an official page in this pass.

Coverage limits (read before relying on this):
- SambaNova official docs returned 404 for the URLs tried; only third-party pricing data was found.
- Hyperbolic docs redirected to a page that gives no API details (GPU-cloud focus).
- Baseten and Nebius pricing tables did not render in the fetched content.
- Mistral small-model prices were not on the pricing page fetched (only Mistral Large was listed).
- No provider's TTFT was measured here. Speed numbers are vendor-advertised unless labelled otherwise.
- Tool-calling reliability was not benchmarked. Notes reflect documented support only.

---

## 1. Provider reports

### 1.1 Cerebras Inference
- Base URL: `https://api.cerebras.ai/v1`. Chat: `POST /v1/chat/completions`.
- OpenAI-compatible: yes ("mostly"). Streaming SSE: yes. Tool calling: yes. Structured outputs (`response_format` JSON schema): yes.
- Auth: `Authorization: Bearer <key>`. Env var: `CEREBRAS_API_KEY`. Official SDKs: `@cerebras/cerebras_cloud_sdk`.
- Models: the docs example and the only model id shown is `qwen-3.8-27b` (reasoning_effort none/low/medium/high, default high). `kimi-k2.7-code` also appears in the OpenAI page. Context lengths were not shown on the fetched pages. Models page did not render.
- Speed: vendor claims gpt-oss-120B >3,000 tok/s and Llama 3.3 70B ~2,100-2,500 tok/s. One crypto-news item (secondary source) reports 981 tok/s on Kimi K2.6, described as independently verified by Artificial Analysis. Treat all as UNVERIFIED for this report. TTFT: not documented.
- Tool calling notes: documented as supported alone. Cannot combine `response_format` with tools on `gpt-oss-120b` (model-dependent).
- Rate limits / free tier: pricing page mentions a one-time $5 promotional credit that expires after 30 days. A third-party snapshot (April 2026, secondary) mentions a free tier of 1M tokens/day. UNVERIFIED.
- Pricing per 1M input/output (third-party snapshot, April 2026, NOT official; official pricing page did not render tables): Llama 3.1 8B ~$0.10 in; GPT-OSS 120B $0.35/$0.75; Qwen3 Coder 480B $2.00/$2.00; GLM-4.7 $2.25/$2.75. Confirm at cerebras.ai/pricing.
- Quirks: `n` must be 1. `service_tier` unavailable on shared inference. `tool_stream` must not be sent. Images only as base64 data URIs (no external URLs). Cerebras-specific fields `reasoning_format` and `clear_thinking` go in `extra_body` for OpenAI clients. `max_tokens` vs `max_completion_tokens`: not documented. `prediction` is not available for `qwen-3.8-27b` on shared inference.

### 1.2 Groq
- Base URL: `https://api.groq.com/openai/v1`. Chat endpoint path under base (`/chat/completions`), standard for OpenAI SDKs; the page did not spell out the path or auth header format explicitly.
- OpenAI-compatible: "mostly". Streaming and tool calling: not explicitly confirmed on the compatibility page; Groq's Responses API also supported (text/image input, function calling).
- Auth: Bearer key (OpenAI SDK convention). Env var: `GROQ_API_KEY`.
- Models (official models page, no dates shown):
  - `llama-3.1-8b-instant`: 131,072 ctx, 560 tok/s advertised, price "contact sales".
  - `llama-3.3-70b-versatile`: 131,072 ctx, 280 tok/s advertised, price "contact sales".
  - `openai/gpt-oss-120b`: 131,072 ctx, 500 tok/s advertised, $0.15 in / $0.60 out.
  - `openai/gpt-oss-20b`: 131,072 ctx, 1,000 tok/s advertised, $0.075 in / $0.30 out.
  - Whisper large-v3 and turbo (audio, priced per hour).
  - Preview models may be discontinued at short notice.
- Speed/TTFT: advertised tok/s above. Third-party comparisons say Groq is strong on TTFT (one source cites median 80 ms vs 280 ms on H100 GPUs, vendor-style claim). UNVERIFIED.
- Rate limits / free tier: not on the fetched pages. UNVERIFIED.
- Quirks (400 error if sent): `logprobs`, `logit_bias`, `top_logprobs`, `messages[].name`, `n` other than 1. `temperature: 0` is converted to `1e-8`. Unsupported audio formats: vtt, srt.
- Note: a third-party source says the catalog is curated and has peak-hour capacity errors. UNVERIFIED.

### 1.3 SambaNova Cloud
- Official docs: the models page returned 404; the quickstart page gave only a placeholder base URL (`your-sambanova-base-url`) and `API_KEY`/`URL` names in cURL. Base URL and env var must be confirmed at cloud.sambanova.ai. UNVERIFIED.
- OpenAI-compatible: yes per the quickstart (OpenAI JS/Python clients work with base URL + key).
- Auth: `Authorization: Bearer <key>`. Env var: not documented on the page fetched (cURL uses `API_KEY`).
- Models: example `Meta-Llama-3.3-70B-Instruct`. Third-party trackers (2026, secondary, inconsistent) list ~8-10 models incl. Llama 3.3 70B, Llama 4 Maverick, GPT-OSS 120B, DeepSeek variants, gemma-4-31B-it. Context lengths not verified.
- Pricing (third-party, July-August 2026, NOT official): gemma-4-31B-it and gpt-oss-120b ~$0.22 in / $0.59 out; Llama 3.3 70B $0.60/$1.20; DeepSeek V3.1/V3.2 $3.00/$4.50. Free tier ~$5 credits expiring in 30 days (third-party). Sources disagree on whether paid tier is pay-as-you-go or sales-quoted.
- Hardware: SN50 RDU announced 2026-02-26, shipping H2 2026 (third-party).
- Speed/TTFT: not verified. Rate limits: not verified.

### 1.4 Fireworks AI
- Base URL: `https://api.fireworks.ai/inference/v1`. Chat: `POST /chat/completions`.
- OpenAI-compatible: yes (OpenAI Python/JS SDK with base URL). Streaming, tool calling and JSON: standard for their OpenAI endpoint; not individually detailed on the page fetched. An Anthropic-compatible endpoint exists at `https://api.fireworks.ai/inference`.
- Auth: Bearer. Env var: `FIREWORKS_API_KEY`.
- Model ids use full paths, e.g. `accounts/fireworks/models/glm-5p3-flash`. Serverless modes include a Priority tier (`service_tier: "priority"`) and a "Fast" option (details not fetched).
- Pricing: the pricing page did not render per-token prices. Per-model prices not verified here.
- Speed/TTFT: not measured. Rate limits: not verified. Python SDK is alpha (`--pre`).

### 1.5 Together AI
- Base URL: `https://api.together.ai/v1`. Chat: `POST /v1/chat/completions`.
- OpenAI-compatible: yes; existing OpenAI SDK code works with new key + base URL. Supported: streaming, function calling, structured outputs, vision, embeddings.
- Auth: Bearer. Env var: `TOGETHER_API_KEY`.
- Model ids are namespaced (e.g. `openai/gpt-oss-120b`). OpenAI names such as `gpt-4o` return 404.
- Pricing per 1M in/out (official pricing page, no date shown): Meta-Llama-3.1-8B-Instruct-Turbo $0.02/$0.04; Mistral-Nemo-Instruct-2407 $0.029/$0.03; gemma-3-4b-it $0.05/$0.10; Mistral-Small-24B-Instruct-2501 $0.05/$0.08; gemma-3-12b-it $0.05/$0.15; Qwen3.5-9B $0.10/$0.15 (the list was from the DeepInfra page; the Together page returned these same cheapest rows).
- Quirks: `logit_bias` not supported on most models; `n` not on every model; `service_tier`, `store`, `metadata`, `prediction` accepted but ignored; `detail` on images ignored; no Assistants/Threads/Runs (build tool loops yourself); reasoning may appear under `reasoning` or `reasoning_content`; usage fields for cached/reasoning tokens may be in different places; `id` format is Together's, not OpenAI's.
- Speed/TTFT: not measured. Rate limits: not verified.

### 1.6 DeepInfra
- Base URL: `https://api.deepinfra.com/v1/openai`. Chat: `POST /v1/openai/chat/completions`.
- OpenAI-compatible: yes but "may not be 100% compatible". Streaming and tools: not individually confirmed on the overview page.
- Auth: Bearer. Env var in examples: `DEEPINFRA_API_KEY`.
- Model field accepts `MODEL_NAME`, `MODEL_NAME:VERSION`, or `deploy_id:DEPLOY_ID`. Example slug: `deepseek-ai/DeepSeek-V4-Flash-0731`.
- Pricing per 1M in/out (pricing page, copyright 2026, no effective date): Llama 3 8B Instruct Lite $0.14/$0.14; DeepSeek V4 Flash 0731 $0.14/$0.28 (cached $0.03 in); Qwen3.5 9B $0.17/$0.25; Qwen3.8 Flash $0.15/$0.47; GLM-5.3-Flash $0.15/$0.50; gpt-oss-120B $0.15/$0.60. Also Qwen3.5-9B $0.10/$0.15 and gemma-3-4b-it $0.05/$0.10 on the cheapest-models page (sources inconsistent; check live).
- Quirks: `service_tier` accepts `"priority"` (+50% surcharge) or `"flex"` (-20%, may wait up to 10 min or 429). Unsupported tier silently falls back to standard billing. `fail_fast: true` returns 429 `engine_overloaded` instead of queueing (not billed); takes precedence over priority. In the Python SDK these go in `extra_body`. Default `max_tokens` cap 16,384 for most models. Context overflow returns HTTP 400.
- Speed/TTFT: not measured.

### 1.7 Baseten (Model APIs)
- Base URL: `https://inference.baseten.co/v1`. Chat: `POST /v1/chat/completions`. Also an Anthropic-compatible beta at `https://inference.baseten.co/v1/messages` (needs `Authorization: Bearer` override in the Anthropic SDK).
- OpenAI-compatible: yes; no model deployment needed for Model APIs. All model APIs support tool calling; all except Muse Spark Open support structured outputs and JSON mode.
- Auth: Bearer. Env var: `BASETEN_API_KEY`.
- Models: example `zai-org/GLM-5.3`. Muse Spark Open (slug not shown; supports audio input; `n>1` returns 400). Fast variants share weights with separate slugs/pricing/rate limits (slugs not shown). Supported-models table did not render. List via `GET https://inference.baseten.co/v1/models` or `baseten model-api list`.
- Session affinity: `x-session-affinity` header improves cached-input reuse; recommended max ~60 req/min per session.
- Pricing and speed: not captured. Error codes include 529 (overloaded; retry with backoff).

### 1.8 Hyperbolic
- Docs redirected to `hyperbolic.ai/docs/`, which describes GPU hardware (H100/H200/B200/B300) and reserved pricing; no API base URL, auth, model list or pricing numbers were returned. The docs index is at `https://hyperbolic.ai/docs/llms.txt` (not fetched).
- Base URL, chat endpoint, env var, models, pricing: UNVERIFIED. Treat as "not researched" for voice use until confirmed.

### 1.9 Nebius AI Studio (Token Factory)
- Docs redirected to `docs.tokenfactory.nebius.com`. Base URL: `https://api.tokenfactory.nebius.com/v1/`. Chat: `POST /v1/chat/completions`.
- OpenAI-compatible: yes (standard OpenAI SDKs, base URL + key change).
- Auth: Bearer. Env var: `NEBIUS_API_KEY`.
- Models: only the quickstart example `deepseek-ai/DeepSeek-R1-0528` (reasoning model, not a fast choice). Context, speed and pricing not shown. UNVERIFIED for fast models.

### 1.10 NVIDIA NIM hosted API (successor to Lepton)
- Lepton AI was acquired by NVIDIA (April 2025, deal reported as closed). Its serverless inference product was discontinued and folded into DGX Cloud Lepton, a GPU marketplace. Do NOT use Lepton for this engine. (Secondary sources for the timeline; the $700M figure is unverified.)
- NVIDIA hosted API: base URL `https://integrate.api.nvidia.com`, chat `POST /v1/chat/completions`. Auth header and env var NOT on the page fetched (conventionally `Authorization: Bearer` and `NVIDIA_API_KEY`, UNVERIFIED). Rate limits and free tier not stated.
- Example hosted models: `meta/llama-3.1-8b-instruct`, `meta/llama-3.3-70b-instruct`, `openai/gpt-oss-120b`, `nvidia/nemotron-3-super-120b-a12b`, `qwen/qwen3-next-80b-a3b-instruct`, `z-ai/glm-5.3`, `deepseek-ai/deepseek-v4-pro`, `moonshotai/kimi-k3`. Page updated 2026-10-05. No speed or price figures on the page.

### 1.11 Mistral La Plateforme (small/fast)
- Base URL: `https://api.mistral.ai`. Chat: `POST /v1/chat/completions`.
- OpenAI-shaped chat completions with Mistral-specific params. Auth: `Authorization: Bearer $MISTRAL_API_KEY`. Env var: `MISTRAL_API_KEY`. Official SDKs: `@mistralai/mistralai` (TS, `client.chat.complete`) and Python `mistralai`.
- Streaming: yes, SSE, ends with `data: [DONE]`. Tools: yes, `tool_choice` (auto/none/any/required/named), `parallel_tool_calls` default true. Output: `response_format` text / json_object / json_schema. JSON mode requires an instruction in the prompt.
- Fast/small models on the models overview page (slugs, API aliases to verify): Ministral 3 3B `ministral-3-3b-25-12`; Ministral 3 8B `ministral-3-8b-25-12`; Ministral 3 14B `ministral-3-14b-25-12`; Mistral Small 4 `mistral-small-4-0-26-03` (Apache 2.0); Mistral Medium 3.5 `mistral-medium-3-5-26-04` (frontier class, not fast); Codestral `codestral-25-08`. Context lengths not shown except none for these; verify on model cards.
- Deprecations (from models page): Mistral Small 3.2 `mistral-small-2506` deprecated 2026-04-30, retires 2026-07-31 (replace with Small 4). Mistral Medium 3.1 `mistral-medium-2508` deprecated 2026-05-22, retires 2026-08-31. Magistral Small 1.2 retires 2026-07-31. These retirement dates are now in the past relative to 2026-10-22; do not use them.
- Pricing: official pricing page showed only Mistral Large ($0.50 in / $1.50 out); small-model prices not captured. Cached input billed at 10%; batch ~50% off.
- Quirks: `max_tokens` plus prompt must fit context. Temperature 0.0-0.7 recommended; change temperature or top_p, not both. `reasoning_effort` (none/minimal/low/medium/high/xhigh) and `prompt_mode` (only "reasoning") for reasoning models. `service_tier` only `auto` or `standard_only`. `random_seed` for determinism.

### 1.12 Google Gemini Flash / Flash-Lite
- OpenAI compatibility layer: base URL `https://generativelanguage.googleapis.com/v1beta/openai/`. Chat: `POST {base}chat/completions`. Auth: `Authorization: Bearer <key>`. Env var: `GEMINI_API_KEY`. Still labelled "beta".
- Supported: model, messages, stream, stream_options (include_usage), tools, tool_choice, reasoning_effort (e.g. low, none for 2.5 models), service_tier (priority/flex/standard), n and response_format (chat and image), structured output via `chat.completions.parse`. Gemini-specific fields via `extra_body`: cached_content, thinking_config, generation_config, safety_settings.
- Unsupported/limited: reasoning cannot be turned off for Gemini 2.5 Pro or 3 models; `reasoning_effort` cannot combine with `thinking_level` or `thinking_budget`; batch upload/download not through compat layer; for image generation unknown params are silently ignored.
- Model ids and prices (official pricing page, USD per 1M, standard paid tier; all list a free tier):
  - Gemini 3.8 Flash and 3.6 Flash: $0.75 in / $3.75 out through 2026-12-31; from 2027-01-01 $1.50 / $7.50. Priority $1.35 / $6.75 through 2026-12-31.
  - Gemini 3 Flash Preview: $0.50 (text/image/video), $1.00 (audio) in / $3.00 out.
  - Gemini 3.5 Flash-Lite: $0.30 / $2.50.
  - Gemini 3.1 Flash-Lite: $0.25 (text) / $0.50 (audio) in / $1.50 out.
  - Gemini 2.5 Flash: $0.30 / $2.50.
  - Gemini 2.5 Flash-Lite: $0.10 (text) / $0.30 (audio) in / $0.40 out.
  - Batch is about half price (not on free tier).
  - Note: the "3.8" and "3.6" Flash entries are in the fetched official table but I could not verify them independently; confirm the exact API slugs on the models page (the flash-lite-latest model page returned 404).
- Context lengths: not captured. Speed/TTFT: not measured. Rate limits: not captured (free tier exists; limits vary by model).
- Veo 3.1 preview models shut down 2026-10-22 (not relevant to chat, but shows churn).

### 1.13 Other notable low-latency providers (2026)
- Artificial Analysis (independent benchmarking) is the best place to check current tok/s and TTFT per model. Not an inference provider; use for measurement.
- Third-party roundups (secondary, not official) consistently rank Cerebras first on throughput and Groq strong on latency. Not verified here.
- Not researched in this pass (candidates to add if needed): OpenRouter (aggregator), Novita, Friendli, Parasail, Cloudflare Workers AI, Inception Labs (diffusion LLM). None were checked against official docs.

---

## 2. Ranked recommendation for voice agents

Ranking criterion: TTFT first, then tool-calling reliability. Caveat: TTFT and tool reliability were NOT measured here. Rank is based on documented speed claims and API feature support. Benchmark on your own prompts before committing.

1. **Groq** (`openai/gpt-oss-20b` or `llama-3.1-8b-instant`): advertised 560-1,000 tok/s; third-party says strongest TTFT of the group; documented OpenAI compatibility; cheapest tier for gpt-oss-20b ($0.075/$0.30). Watch the 400-error param list (`n>1`, `logprobs`, `name`) and possible peak-hour capacity errors.
2. **Cerebras** (`qwen-3.8-27b` or the other listed model): highest advertised throughput; supports tool calling and structured outputs; but the model catalog on the official docs is thin in this pass, and prices came from a secondary source. Good second choice for throughput-heavy tool loops.
3. **Gemini 2.5 Flash-Lite** (or Gemini 3.1 Flash-Lite): official docs, free tier, $0.10/$0.40 for 2.5 Flash-Lite; OpenAI layer is marked beta and has reasoning-control quirks. Speed not verified.
4. **Mistral Ministral / Small 4**: documented tool calling and json_schema; good for reliability over raw speed; small-model prices not captured.
5. **Fireworks, Together, DeepInfra** as fallback providers (all OpenAI-compatible, low prices on small models, documented). Speed not measured.

Not recommended for the default path: Lepton (discontinued), Nebius quickstart model (reasoning model), Hyperbolic (no API docs captured), SambaNova (official docs not reachable in this pass).

## 3. Adapter strategy

**Can share ONE generic OpenAI-compatible adapter (baseUrl + env var only):**
- Cerebras, Groq, Fireworks, Together, DeepInfra, Baseten, Nebius, Mistral, Gemini (OpenAI layer), NVIDIA NIM (verify auth).
- Expect per-provider param filtering: Groq (drop `logprobs`, `n`, `name`), Cerebras (`n` must be 1; put `reasoning_format` in extra body), DeepInfra (`fail_fast`, `service_tier` in extra body), Gemini (`reasoning_effort` rules), Together (namespaced model ids; ignore `reasoning` vs `reasoning_content` difference), Mistral (`reasoning_effort` and `prompt_mode` are Mistral-specific).
- These are configuration differences, not separate code paths. A small per-provider "param sanitizer" hook is enough.

**Needs a custom adapter or verification first:**
- SambaNova: base URL and env var unverified on official docs.
- Hyperbolic: no API docs captured.
- NVIDIA NIM hosted: auth/env not on the page; verify before reusing the generic adapter.
- Anthropic-compatible endpoints (Fireworks, Baseten beta) are not needed; use the OpenAI shape.

## 4. Provider table

| provider id | base URL | chat path | env var | default fast model (verify slug before use) |
|---|---|---|---|---|
| cerebras | https://api.cerebras.ai/v1 | /chat/completions | CEREBRAS_API_KEY | qwen-3.8-27b |
| groq | https://api.groq.com/openai/v1 | /chat/completions | GROQ_API_KEY | openai/gpt-oss-20b |
| sambanova | UNVERIFIED (check cloud.sambanova.ai) | /chat/completions (assumed) | UNVERIFIED | Meta-Llama-3.3-70B-Instruct (example only) |
| fireworks | https://api.fireworks.ai/inference/v1 | /chat/completions | FIREWORKS_API_KEY | accounts/fireworks/models/glm-5p3-flash |
| together | https://api.together.ai/v1 | /chat/completions | TOGETHER_API_KEY | meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo (namespace unverified) |
| deepinfra | https://api.deepinfra.com/v1/openai | /chat/completions | DEEPINFRA_API_KEY | deepseek-ai/DeepSeek-V4-Flash-0731 |
| baseten | https://inference.baseten.co/v1 | /chat/completions | BASETEN_API_KEY | zai-org/GLM-5.3 (not small; find a fast slug via /v1/models) |
| hyperbolic | UNVERIFIED | UNVERIFIED | UNVERIFIED | none (not researched) |
| nebius | https://api.tokenfactory.nebius.com/v1 | /chat/completions | NEBIUS_API_KEY | none verified for fast use |
| nvidia-nim | https://integrate.api.nvidia.com/v1 | /chat/completions | NVIDIA_API_KEY (UNVERIFIED) | meta/llama-3.1-8b-instruct |
| mistral | https://api.mistral.ai/v1 | /chat/completions | MISTRAL_API_KEY | ministral-3-8b-25-12 (verify API alias) |
| gemini | https://generativelanguage.googleapis.com/v1beta/openai/ | /chat/completions | GEMINI_API_KEY | gemini-2.5-flash-lite |

Note on the base URL for Mistral: the docs show `https://api.mistral.ai` with `/v1/chat/completions` appended; the table shows the `/v1` form.

## 5. Items to re-check (possibly outdated)
- All per-token prices: fetched 2026-10-22, most pages show no effective date. Re-check before budgeting.
- Cerebras and Groq speed numbers are vendor-advertised; Artificial Analysis is the independent source.
- Gemini 3.8 / 3.6 Flash rows: verify model ids and the 2027 price step.
- Mistral deprecations listed above are already past their retirement dates.
- SambaNova, Hyperbolic, Nebius, Baseten pricing: incomplete in this pass.
- Lepton: discontinued by NVIDIA; do not build against it.
