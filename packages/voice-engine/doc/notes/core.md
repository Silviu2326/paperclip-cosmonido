## core

Implemented only `src/core/` (excluding the immutable contracts) and `test/core/`.

Assumptions and contract limits:

- Both `provider:voice` strings and `VoiceRef` objects bind the selected voice. Retryable failures emit `willFallback: false` unless the caller explicitly sets `providerOptions.allowFallbackVoice: true` and another compatible catalog voice exists. A recommendation returns a normal descriptor; it does not silently opt into changing speakers. The engine removes this option before calling providers. Long synthesis keeps one provider/voice throughout.
- An oversized word remains intact; synthesis rejects it if it exceeds the provider limit. SSML is stripped for providers without SSML support; splitting supported SSML across multiple long-synthesis chunks is rejected rather than producing invalid XML. Alias replacements are case-sensitive and do not cascade. Billable-character estimates count normalized spoken Unicode code points; actual usage comes from providers.
- `planRoute` accepts providers or `{ provider, models }` entries; supplied model catalogs enable model-level capability/tier filtering. `streaming: true` on its request enables streaming filtering. The engine respects an explicit voice first and applies language preferences when choosing an opted-in fallback. `withRetry` counts total attempts, accepts `signal` in its options or policy, and treats Retry-After as a minimum even above the backoff cap. Engine timeouts apply per attempt; providers should still honor the signal because a timed-out implementation that ignores it cannot be forcibly stopped.
- Native streaming passes chunks through without buffering, retries or caching. It emits `synthesis.start`, errors when applicable, and estimated usage upon full consumption. `SynthesisChunk` has no final result/usage envelope, so native streaming cannot emit `synthesis.complete` without inventing or buffering a `SynthesisResult`. The non-streaming fallback emits ordinary synthesis events and yields one chunk.
- Unknown voice languages mean multilingual/unknown and remain eligible. Ranking uses exact region, primary language, then unknown languages; premade and flagship hints (`tags`, `raw.tier`, `raw.flagship`) break ties. The voice catalog caches unfiltered lists for five minutes and retries failed providers on subsequent reads.
- Cache keys include context and timestamps in addition to the requested fields. An idempotency key overrides request content within a provider. Engine cache namespaces additionally include company and credential hashes, preventing cross-company/account cache reuse. Cache hits return zero new usage and do not emit a billing event. Cache I/O failures are logged and do not turn completed synthesis into an error.
- Memory cache defaults to 64 MiB of audio and a one-hour TTL; file cache defaults to one hour. File cache sidecars atomically reference immutable, content-addressed audio; deleting/expiring a key leaves audio blobs for external directory cleanup. Environment resolution skips empty/blank variables; chained resolvers merge fields with earlier nonempty values winning. Registry instances retain the most recent credential hash per provider, so rotation recreates the instance.
- WAV concatenation supports PCM RIFF with 16/24/32-bit mono/stereo data, checks headers, and skips padded ancillary chunks. MP3/Ogg/Opus/PCM/mu-law/A-law use byte concatenation without transcoding or repairing compressed-container indexes; FLAC/AAC multi-output concatenation is unsupported. Duration estimates require PCM layout or a declared bitrate. `formatFromMimeType` returns an `AudioFormat` or `undefined`.
- `wavHeader(dataLength, sampleRateOrFormat = 44100, channels = 1, bitDepth = 16)` returns the header only; callers must append PCM data and odd-length padding. `fetchJson`/`fetchBytes` accept `(context, input, init?, { provider?, maxBytes? }?)`; `buildMultipart` takes `{ name, value, fileName?, contentType? }[]`.
- File storage requires a plain filename, creates files exclusively, and returns `file://` plus the absolute path. Memory storage provides `get(uri)` for inspection. Storage remains explicitly caller-managed: the immutable synthesis result has no storage URI field, and the engine does not auto-persist outputs through `options.storage`.

Exact module exports (no additional exported types):

| File | Exported symbols |
| --- | --- |
| `src/core/http.ts` | `withTimeout`, `iterateBody`, `readBounded`, `parseRetryAfter`, `errorFromResponse`, `fetchJson`, `fetchBytes`, `buildMultipart` |
| `src/core/languages.ts` | `normalizeLanguageTag`, `primaryLanguage`, `languageMatches`, `LANGUAGES`, `languageName` |
| `src/core/text.ts` | `normalizeText`, `chunkText`, `stripSsml`, `applyPronunciation`, `countBillableChars`, `estimateSpeechDurationMs` |
| `src/core/audio.ts` | `DEFAULT_FORMAT`, `mimeTypeFor`, `formatFromMimeType`, `wavHeader`, `concatAudio`, `estimateDurationMs`, `isSilentPcm16` |
| `src/core/credentials.ts` | `EnvCredentialResolver`, `StaticCredentialResolver`, `ChainCredentialResolver`, `hasRequiredCredentials`, `createEnvCredentialResolver` |
| `src/core/cache.ts` | `synthesisCacheKey`, `MemoryCacheStore`, `FileCacheStore`, `createMemoryCache`, `createFileCache` |
| `src/core/storage.ts` | `FileAudioStorage`, `MemoryAudioStorage`, `createFileStorage` |
| `src/core/registry.ts` | `ProviderRegistry`, `createProviderRegistry` |
| `src/core/catalog.ts` | `parseEngineVoiceId`, `toEngineVoiceId`, `toVoiceRef`, `filterVoices`, `rankVoices`, `VoiceCatalog`, `createVoiceCatalog` |
| `src/core/router.ts` | `DEFAULT_ROUTING`, `planRoute`, `withRetry` |
| `src/core/engine.ts` | `DefaultVoiceEngine`, `createVoiceEngine` |
| `src/core/long-synthesis.ts` | `synthesizeLongText` (internal module, not exported from the package barrel) |
| `test/core/fakes.ts` | `fakeVoice`, `fakeProvider` |
| `test/core/*.test.ts` | None |

The existing `types.ts`, `errors.ts` and package barrels are unchanged.

Verification:

- `node ../../node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`
- `node ../../node_modules/vitest/vitest.mjs run test/core`
- Strict standalone TypeScript checking of every `src/core/*.ts` and `test/core/*.ts` file using NodeNext, ES2023 and `--noEmit` (the package tsconfig excludes tests).

Tests use fake providers/fetch and temporary local directories; no live API calls. Repository-wide checks/build were not run, per the area-specific brief.
