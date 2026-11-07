# Engine notes

Date: 2026-10-22

## Assumptions

- `providers` is the engine registry; omitted providers yields an empty registry.
- Environment credentials use the first nonblank value in each field's configured priority list. Missing credential errors name configured env var alternatives.
- STT routes language overrides before preferences, filters requested capabilities and file/encoding constraints, and cross-provider falls back only on retryable `VoiceEngineError` when enabled.
- LLM routes configured/default preference, then remaining registered providers. Streaming fallback is allowed only before a content/tool delta is yielded. Attempt cancellation is linked to the caller signal.
- Tool handlers for a step run concurrently. Their results are stored in one `role: "tool"` message; thrown handler errors become `isError: true` results.
- Cost uses USD/hour for STT and USD/million input/output tokens for LLM. Unknown pricing returns `null`.

## Exact exports

- `src/net/credentials.ts`: `Definition`, `createDefinitionCredentialResolver`, `hasRequiredDefinitionCredentials`.
- `src/stt/engine.ts`: `DEFAULT_STT_ROUTING`, `createSttEngine`.
- `src/llm/engine.ts`: `DEFAULT_LLM_ROUTING`, `createLlmEngine`.

## Official endpoint verification (2026-10-22)

- Deepgram official streaming STT reference documents `wss://api.deepgram.com/v1/listen`, `Authorization: Token`, binary audio, and JSON control messages: https://developers.deepgram.com/reference/speech-to-text/listen-streaming
- ElevenLabs official batch STT reference documents `POST /v1/speech-to-text`, multipart upload, `xi-api-key`, and `model_id`: https://elevenlabs.io/docs/api-reference/speech-to-text/convert
- Groq official API reference documents `POST https://api.groq.com/openai/v1/chat/completions`: https://console.groq.com/docs/api-reference
- Google official API reference documents `generateContent`, SSE `streamGenerateContent`, and the `x-goog-api-key` header: https://ai.google.dev/api.md
- Provider endpoints are implemented in provider-owned files rather than these engine facades. The references above matched the research endpoint descriptions; provider-specific assumptions should be recorded by those provider owners.

## Verification

Fake-provider tests passed: `node ../../node_modules/vitest/vitest.mjs run test/net test/stt/engine test/llm/engine` (8 tests).
