# voice-engine — contributor brief (read fully before editing)

You are one of several agents working IN PARALLEL on this package. Other agents are
editing other directories at the same time. Follow these rules strictly.

## What this package is
`@paperclipai/voice-engine` is a STANDALONE, dependency-free TypeScript (ESM) voice engine:
text-to-speech, streaming TTS, voice cloning (instant + professional), voice design from a
prompt, speech-to-speech, unified multi-provider voice catalog, language-aware routing with
fallback, caching, cost estimation, and an injectable integration surface (credentials,
storage, usage events) so it can later be wired into the Paperclip control plane
(company-scoped API keys, artifact storage, usage/cost records). It must NOT import anything
from `server/`, `ui/`, `packages/shared`, `packages/db` or any other workspace package.

## The contract (read-only for you)
- `src/core/types.ts` — ALL public types. Read it completely first.
- `src/core/errors.ts` — `VoiceEngineError`, `codeFromStatus`.
- `src/index.ts` and `src/providers/index.ts` — barrel files, already written. They
  reference module paths that MUST exist with the exact export names listed below.
Do NOT edit those four files. If you find a genuine gap in the contract, write it down in
`NOTES-<your-area>.md` at the package root and work around it locally (e.g. via
`providerOptions` or `raw`). Never widen the contract yourself.

## Hard rules
1. Only create/edit files inside YOUR assigned directories (given in your task) plus
   `test/<your-area>/**` and `NOTES-<your-area>.md`. Never touch other areas.
2. Zero runtime dependencies. Use global `fetch`, `node:crypto`, `node:fs/promises`,
   `node:path`, `node:stream`, `node:buffer`. No npm installs.
3. ESM with explicit `.js` suffixes on relative imports (`import x from "../core/types.js"`).
   `strict` TypeScript per `../../tsconfig.base.json` (NodeNext, isolatedModules, ES2023).
4. Everything network-related takes `fetch` from `ProviderContext.fetch` (never the global
   directly inside providers) so tests can inject a fake. Honour `signal` and `timeoutMs`.
5. Map every provider error into `VoiceEngineError` with the right `code`, `status`,
   `retryable` and `retryAfterMs` (parse `Retry-After`).
6. Tests: Vitest, under `test/<area>/*.test.ts`, no network, fake fetch, fast. Cover the
   happy path, error mapping, request-body mapping of `VoiceSettings`, and streaming when
   implemented.
7. Commands (run from the package dir `packages/voice-engine`):
   - typecheck: `node ../../node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`
     Errors about modules OUTSIDE your area are expected while others are still writing
     them; only your own files must be clean. Filter the output to your paths.
   - tests: `node ../../node_modules/vitest/vitest.mjs run test/<area>`
8. Do not run `pnpm install`, `git add/commit`, or anything at the repo root.
9. Keep files focused (< ~400 lines each). Prefer small modules. Document public functions
   with a one-line JSDoc. Write code comments in English.

## Provider module shape (for provider tasks)
Each provider lives in `src/providers/<dir>/` and `src/providers/<dir>/index.ts` MUST export:
- `export const <camelName>Provider: ProviderDefinition` (id, name, docsUrl, credentialEnv,
  requiredCredentials, create)
- `export function create<PascalName>Provider(ctx: ProviderContext): VoiceProvider`
- `export const <UPPER>_MODELS: ModelDescriptor[]` (static, best current public models,
  with languages, tiers, pricing when public)
Exact export names required by `src/providers/index.ts`:
  elevenLabsProvider, fishAudioProvider, minimaxProvider, openAiProvider, azureProvider,
  googleProvider, cartesiaProvider, deepgramProvider, playHtProvider, humeProvider.
Provider ids (strings): elevenlabs, fish-audio, minimax, openai, azure, google, cartesia,
deepgram, playht, hume.

Provider implementation guidance:
- `listVoices` normalizes to `VoiceDescriptor` (id = `${provider}:${voiceId}`, languages as
  BCP-47, gender/age/tags best-effort from provider labels, `raw` keeps the original).
  For providers with no voice-list endpoint, return the static premade list.
- `synthesize` maps `VoiceSettings` to the provider's native knobs; ignore knobs the
  provider lacks; emit `UsageRecord` with `unit: "character"` and `units` = text length and
  `estimatedCents` from the model's `usdPerMillionChars` when known (else `null`).
- `synthesizeStream` yields `SynthesisChunk` from a chunked HTTP response body (or
  WebSocket if trivial; HTTP streaming is enough).
- `defaultModel({ language, tier })` returns the best model id for that language/tier.
- Return `mimeType` consistent with the requested `AudioFormat`; translate `AudioFormat`
  to the provider's output format string and throw `unsupported` for impossible combos.
- Expose extra provider endpoints (sound effects, dubbing, pronunciation dictionaries…) as
  additional exported functions in their own file inside the provider dir; don't widen
  `VoiceProvider`.
- Use the newest public API versions and model ids you know of; put the pricing source and
  date in `notes`. If unsure of an exact endpoint, implement from the official docs as you
  know them and mark assumptions in a comment.

## Future Paperclip integration (keep in mind, do not implement wiring)
- Credentials will come from company-scoped connections → `CredentialResolver`.
- Audio outputs will be stored as artifacts → `AudioStorage`.
- Usage will be recorded per company/agent → `EngineEvent` of type `usage`
  (`UsageRecord` is shaped to be compatible with the server's existing cost records:
  cents, unit, units, pricing source).
- Existing server code already calls ElevenLabs `eleven_multilingual_v2` with an
  `xi-api-key` header and `output_format=mp3_44100_128`; the engine must be able to
  reproduce that exact call.
