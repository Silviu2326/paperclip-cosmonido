# OpenAI-compatible LLM adapter notes

Checked 2026-10-22. Prices remain unset unless an official page explicitly exposed the value; model notes identify the official source/date or identify a local/configured alias.

## Official documentation checks and differences

- OpenAI lists Chat Completions as supported alongside Responses, although Responses is recommended for new integrations. This adapter implements Chat Completions; `providerOptions.api: "responses"` is not implemented. [Chat API](https://platform.openai.com/docs/api-reference/chat/object?lang=ruby)
- Groq confirms `https://api.groq.com/openai/v1` and lists unsupported request properties including message `name`; the adapter filters `name`-like and sampling parameters to avoid known incompatibility. Groq's models page currently documents `openai/gpt-oss-20b` and `openai/gpt-oss-120b`. [Compatibility](https://console.groq.com/docs/openai), [models](https://console.groq.com/docs/models)
- SambaNova Cloud's accessible official docs do not give a universal cloud base URL: they describe account/endpoint-specific URLs and use a `key` header on the OpenAI-compatible API example. Consequently `baseUrl` is required and the conventional bearer-key behavior remains an assumption; deployment-specific URL and auth may need adapting. [Function calling / API example](https://docs.sambanova.ai/sambastudio/latest/function-calling.html)
- Research described Cloudflare's `{account}/{gateway}/compat/chat/completions` URL as the unified endpoint and notes it is deprecated for new single-call integrations. This adapter uses that gateway-specific route because the requested preset requires both `accountId` and `gatewayId`; new integrations should migrate to Cloudflare's recommended account AI API route. The provider key and optional Cloudflare gateway token are separate credentials. [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/usage/chat-completion/)
- Baseten's general official docs found in this pass show its management API uses `Authorization: Api-Key`, while the Model APIs OpenAI-compatible endpoint/auth combination could not be confirmed from accessible primary docs. The implementation retains the researched Bearer convention pending verification. [Baseten docs](https://docs.baseten.co/)
- Research lists Cerebras `qwen-3.8-27b`, DeepSeek `deepseek-flash`, Qwen `qwen3.8-flash`, and Kimi `kimi-k3`; these IDs were not all independently corroborated by accessible search result pages. Static lists are labeled with checked date, and prices are omitted when not verified. SambaNova, Hyperbolic, Baseten and Nebius use base URL overrides where endpoint certainty is incomplete.
- Official Nebius examples confirm `https://api.tokenfactory.nebius.com/v1/` and `NEBIUS_API_KEY`. [Nebius example](https://docs.tokenfactory.nebius.com/fine-tuning/deploy-custom-model)
- DeepInfra's official pages confirm `/v1/openai/chat/completions`, `DEEPINFRA_TOKEN`, and current examples for `deepseek-ai/DeepSeek-V4.1-Flash`; research used alternate key spelling and older model snapshots. [DeepInfra current model API example](https://deepinfra.com/blog/deepseek-v4-1-flash-deepinfra)
- Local Ollama/LM Studio/vLLM catalogs are configuration dependent. Their static descriptors are illustrative aliases and carry notes; no prices are assigned. vLLM default base URL remains the common local convention from research.

## Remaining assumptions

- Common error envelopes and OpenAI-style SSE shape are assumed for compatible services unless a preset documents a notable exception. Provider-specific retry-reset headers are interpreted as seconds when numeric values are below 1000 and milliseconds otherwise.
- API keys are sent as bearer tokens for compatible providers. SambaNova and Baseten may require a provider-specific auth scheme; SambaNova's account-specific key header is noted above.
- `healthcheck()` uses `GET /models`; services which omit or protect model listing may report unhealthy despite chat being usable.
- OpenAI Responses support was explicitly out of scope for this implementation pass; only Chat Completions is used.
