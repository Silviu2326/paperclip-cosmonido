# Fish Audio and MiniMax provider notes

Implementation date: 2026-10-22. Scope: only `src/providers/fish-audio/`,
`src/providers/minimax/`, their tests, and this file. No shared contracts, core
helpers, barrel files, or dependencies were changed. All network calls use the
injected `ProviderContext.fetch`.

## Fish Audio

- Registration: `fishAudioProvider`, `createFishAudioProvider`, and
  `FISH_AUDIO_MODELS`. Environment credentials: `FISH_AUDIO_API_KEY`, then
  `FISH_API_KEY`. The base URL defaults to `https://api.fish.audio`.
- Requested compatibility models remain `s1`, `s1-mini`, `speech-1.6`, and
  `speech-1.5`. S1 is the default. Current docs advertise newer models, mark S1
  deprecated, and say unknown model headers can fall back to the service default.
  Hosted availability of the other requested historical IDs is unverified.
- S1 is approximately USD 15 per million **UTF-8 bytes**, checked 2026-10-22.
  The shared `usdPerMillionChars` field holds 15 because the contract has no
  byte-price field. Actual synthesis usage reports `unit: "byte"` and estimates
  cost from the complete submitted text, including an added S1 emotion marker.
  Other models have unknown prices rather than invented estimates. Any core
  cost estimator must account for this byte/character distinction separately.
- TTS uses JSON `POST /v1/tts`, bearer auth, and the `model` header. HTTP response
  chunks are yielded directly without container framing or transcoding.
  `synthesize({ providerOptions: { streaming: true } })` buffers those chunks;
  `synthesizeStream` yields them. Pitch, similarity, style, and seed have no
  automatic mapping. Speed and dB volume map directly to Fish prosody; stability
  maps to inverse temperature clamped to 0.1–1.
- `providerOptions` accepts `latency`, `normalize`, `temperature`, `top_p`,
  `chunk_length`, and native prosody options. Chunk length is clamped to 100–300.
  Shared request/settings fields take precedence over conflicting native fields.
- Zero-shot references use `providerOptions.references: [{ audio, text }]`.
  `audio` accepts an existing base64 string or `Uint8Array` (encoded locally).
  Use an empty `voice.voiceId`, or set `providerOptions.reference_id: null`, to
  omit a saved voice reference. JSON/base64 is implemented as requested; current
  prose still recommends MessagePack for inline references, so this compatibility
  path needs a credentialed provider smoke test.
- MP3 supports 32/44.1 kHz and 64/128/192 kbps. WAV/PCM support
  8/16/24/32/44.1 kHz, 16-bit mono. Opus requires 48 kHz and supports
  24/32/48/64 kbps. Shared Opus kbps is converted to native bps.
- `/model` responses are normalized from `items` (or `models`), with `_id`/`id`,
  title, language(s), tags, and sample/cover preview URLs. Original author and
  like-count fields remain in `raw`. `listVoices` fetches one page (default 50);
  `listFishVoices` exposes pagination, title, tag, self, author, language, and
  sort filters. `listOwnVoices` explicitly sets `self=true`.
- Cloning requires `consent.attested` and at least one sample. Multipart creation
  fixes `visibility=private`, `type=tts`, and `train_mode=fast`; transcripts come
  from `providerOptions.texts`, tags from `providerOptions.tags`, and denoise maps
  to `enhance_audio_quality`. File fields are repeated `voices`; transcript/tag
  fields are repeated `texts[]`/`tags[]`, per the requested compatibility API.
  Current generated create-model docs show a JSON variant; multipart behavior
  has been tested against fake fetch, not the live provider.
- `updateVoice` uses JSON for metadata-only PATCH and multipart when adding
  samples. `UpdateVoiceRequest` lacks native tags/visibility fields, so
  `labels.tags` is a comma-separated tag list and `labels.visibility` is
  `private`, `public`, or `unlisted`. An empty PATCH response triggers a GET to
  return the updated descriptor. Current update docs show metadata JSON only;
  sample addition/visibility are compatibility assumptions. Individual sample
  removal and professional cloning return `unsupported`.
- Extra exports: `transcribe(ctx, audio, { language, ignoreTimestamps, signal })`
  sends JSON/base64 to `/v1/asr` and preserves its response; `getBalance` returns
  `/wallet/self/api-credit`. Healthcheck uses that wallet endpoint.

References: [TTS and audio formats](https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech),
[create model](https://docs.fish.audio/api-reference/endpoint/model/create-model),
[update model](https://docs.fish.audio/api-reference/endpoint/model/update-model),
[catalog](https://docs.fish.audio/api-reference/endpoint/model/list-models),
[pricing source](https://github.com/fishaudio/docs/blob/main/developer-guide/models-pricing/pricing-and-rate-limits.mdx).

## MiniMax

- Registration: `minimaxProvider`, `createMinimaxProvider`, `MINIMAX_MODELS`.
  `MINIMAX_API_KEY` is required; `MINIMAX_GROUP_ID` is optional. When supplied,
  GroupId is URL-encoded on every API request. `baseUrl` supports China endpoint
  `https://api.minimaxi.com`; the default is `https://api.minimax.io`.
- The requested six models are retained. The default is `speech-02-hd`; fast
  and balanced routing select `speech-02-turbo`. Current docs list later versions
  instead of the requested 2.5 preview IDs; those IDs need availability checks.
  Dated public prices are USD 100/M characters for speech-02-hd and USD 60/M
  for speech-02-turbo. Unconfirmed preview/01 prices remain undefined.
- TTS uses JSON `/v1/t2a_v2`, `output_format=hex`, and strict hex decoding.
  Speed/pitch are clamped to native ranges; dB volume becomes linear amplitude
  `clamp(10 ** (dB / 20), 0, 10)`, so neutral 0 dB remains native `vol=1`.
  Unknown emotions map to neutral; excited maps to happy. Language tags map to
  native names, including `yue -> Chinese,Yue`; unknown tags use auto.
- MP3, WAV, PCM, and FLAC are exposed; WAV streaming is rejected. Sample rates
  are 8/16/22.05/24/32/44.1 kHz and bitrates 32/64/128/256 kbps. Bitrates are
  converted to native bps. Native nested voice/audio options are preserved,
  while explicit shared request fields win conflicts.
- SSE parsing handles split UTF-8 sequences, CRLF, comments, event metadata,
  missing final newline, `[DONE]`, and native errors inside HTTP 200 responses.
  `stream_options.exclude_aggregated_audio=true` requests only incremental audio,
  avoiding replay of a final whole-utterance audio field. JSON error responses
  are also detected when the server returns JSON instead of SSE.
- Usage prefers `extra_info.usage_characters`; fallback is input text length.
  `audio_length` is treated as milliseconds. Word timestamps request
  `subtitle_enable=true` and `subtitle_type=word`, fetch `subtitle_file` through
  the injected fetch without bearer credentials, and preserve milliseconds.
  Accepted subtitle shapes include top-level arrays and `timestamped_words`,
  `words`, `subtitles`, `subtitle`, or `segments`; nested word rows take priority.
  Sentence-only legacy rows remain sentence spans; word boundaries are not
  fabricated. Streaming also accepts inline `data.subtitle`.
- `/v1/get_voice` requests all categories and preserves each source object.
  Languages are inferred from language-name prefixes, including Mandarin and
  Cantonese; description text supplies best-effort gender/age. Failures return
  a small static system catalog and log a warning when a logger is supplied.
  Abort/timeout still throw. Healthcheck never uses the fallback.
- Cloning requires consent and exactly one audio file; multiple files cannot
  be safely concatenated without decoding/transcoding. The upload uses `file`
  and `purpose=voice_clone`; `/v1/voice_clone` keeps the upload's file-id type.
  `providerOptions.voice_id` sets the caller's ID; otherwise one is generated
  from the name plus randomness. IDs must start with a letter and have at least
  8 letters/digits/hyphens. Preview text/model, normalization, and accuracy use
  native providerOptions. Professional cloning is unsupported.
- `/v1/voice_design` yields one candidate, regardless of `candidates`. Its ID is
  already persisted by MiniMax. `saveDesignedVoice` therefore performs **no
  network request**; name and description affect the returned descriptor only.
  Trial audio is treated as MP3 hex. Delete targets `voice_type=voice_cloning`.
- Every JSON response checks `base_resp`, even on HTTP 200. Code 1039 is an
  invalid request (shorten input), not a retryable quota error. Codes 1002/1004/
  1008/2013/2037/2038 map to the requested unified errors. HTTP and SSE errors
  preserve status and Retry-After where supplied.

References: [TTS](https://platform.minimax.io/docs/api-reference/speech-t2a-http),
[voice categories](https://platform.minimax.io/docs/api-reference/voice-management-get),
[pricing](https://platform.minimax.io/docs/pricing/overview),
[API index including clone/design endpoints](https://platform.minimax.io/docs/llms.txt).

## Verification

- Fake-fetch tests cover request mapping, binary/base64/hex conversion, chunked
  and SSE streaming, voice normalization, clone multipart and consent checks,
  design persistence, subtitle credential isolation, error codes, cancellation,
  body timeouts, and early stream-reader cleanup.
- Command: `node ../../node_modules/vitest/vitest.mjs run test/fish-audio test/minimax --configLoader native`.
  47 tests passed. The ordinary config loader first failed with EPERM because
  it writes a bundle under the repository's non-writable `node_modules/.vite-temp`;
  native config loading runs the same tests without that write.
- Package typecheck passed with
  `node ../../node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`.
  Earlier runs reported only other agents' unfinished modules/CLI; those
  diagnostics were gone on the final run. No repository-wide build or test
  suite was run for this scoped assignment. No live billable API requests
  were made.
