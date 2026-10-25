# voice-engine v2 — STT, LLM, agent pipeline and realtime (contributor brief)

Read `doc/CONTRIBUTING.md` first: every rule there still applies (zero runtime deps, ESM with `.js`
suffixes, injected `fetch`, `VoiceEngineError` mapping, fake-fetch Vitest tests, no installs,
no git, only touch your own directories). This brief adds what is new.

## New contracts (read-only for you)
- `src/stt/types.ts`   — speech-to-text providers, streaming, engine interface.
- `src/llm/types.ts`   — provider-neutral chat/tool/streaming interface and engine interface.
- `src/agent/types.ts` — STT->LLM->TTS voice-agent pipeline, transports, VAD/end-of-turn interfaces.
- `src/realtime/types.ts` — speech-to-speech realtime sessions (OpenAI Realtime, Gemini Live).
- `src/core/types.ts`  — now also defines `WebSocketLike` / `WebSocketFactory` and `ProviderContext.webSocket`.
- `src/net/websocket.ts` — `defaultWebSocketFactory` (global WebSocket). Use `ctx.webSocket ?? defaultWebSocketFactory`
  in every streaming adapter so tests inject a fake socket.
- Barrels `src/stt/index.ts`, `src/llm/index.ts`, `src/agent/index.ts`, `src/realtime/index.ts`, `src/net/index.ts`
  already exist and import specific module paths and export names. Do NOT edit them or any `types.ts`.
  If a contract gap blocks you, note it in `doc/notes/<area>.md` and work around it locally.

## Research you must read for your area (written 2026-10-22 by an earlier research pass)
`doc/research/stt-providers.md`, `doc/research/llm-fast-inference.md`,
`doc/research/llm-frontier-and-gateways.md`, `doc/research/realtime-voice-agents.md`.
These are secondary research: prices, model ids and some endpoints are UNVERIFIED. Re-check the
endpoint and wire format against the vendor's official docs with web search before coding, prefer
what the official docs say over the report, and record every discrepancy and every remaining
assumption in `doc/notes/<area>.md` (with the doc URL and date). Model ids and prices go in
`*_MODELS` constants with a `notes` field stating source and date; never invent a price (leave undefined).

## Provider module shape
STT: `src/stt/providers/<dir>/index.ts` exports `<camel>SttProvider: SttProviderDefinition`,
`create<Pascal>SttProvider(ctx)`, `<UPPER>_STT_MODELS`. LLM: see your task. Realtime: see your task.
Credential field names follow the TTS convention (`apiKey`, plus `region`, `projectId`, `baseUrl`… when needed);
`credentialEnv` lists env var names in priority order.

## Quality bar
- Streaming adapters must handle: partial frames, abort via `signal`, socket close/error mid-stream, backpressure-free
  `send`, keepalive where the vendor requires it, and a clean `close()` that resolves after the socket closes.
- Every adapter maps vendor errors to `VoiceEngineError` (auth, rate_limit with `Retry-After`, quota_exceeded,
  invalid_request, provider_unavailable, timeout, aborted).
- Tests use fakes only. Include a fake WebSocket helper in your own test dir (do not share files across areas).
- Typecheck: `node ../../node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` (filter to your paths; other
  areas are written concurrently, so errors elsewhere are expected). Tests: `node ../../node_modules/vitest/vitest.mjs run test/<area>`.
