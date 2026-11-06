# Cartesia, Deepgram Aura, PlayHT and Hume provider notes

Date: 2026-10-22. Scope: the four provider directories and their matching tests.
No core contracts, barrels, dependency manifests or other agents' files were changed.

## Shared behavior and verification boundary

- All HTTP calls use `ProviderContext.fetch`, credentials and optional `baseUrl`.
  Local transport helpers keep `timeoutMs` active through response-body consumption,
  honor caller cancellation, and cancel readers when streaming consumers stop early.
- HTTP failures become `VoiceEngineError`, retaining status and native details.
  Numeric and HTTP-date `Retry-After` values become milliseconds. Network and malformed
  JSON failures are retryable provider errors; caller cancellation is not retryable.
- All tests use fake fetch; no paid synthesis, account mutation or live qualification
  was performed. Compatibility endpoints below may depend on the account/API version.
- `providerOptions` is the native request-body escape hatch. Do not override native
  text/model/voice/format fields when relying on normalized result metadata and cost
  estimates: those describe the corresponding engine request fields.
- Unsupported `VoiceSettings` are omitted. SSML is not advertised; the engine owns
  stripping SSML. Inline pronunciation rules are not translated by these adapters.
- Stream chunks cannot carry usage or format metadata in the existing contract.
  Buffered synthesis returns usage; provider-specific streaming format restrictions
  are documented below. No resampling, transcoding or SDK dependency is introduced.

## Cartesia

- Uses `https://api.cartesia.ai`, `X-API-Key`, and the requested compatibility pin
  `Cartesia-Version: 2025-04-16`. A newer version date was not independently verified.
  The requested catalog is Sonic 3/2/Turbo and the two legacy Sonic IDs. Current docs
  also show newer Sonic IDs; this catalog deliberately retains the assigned IDs.
- `/tts/bytes` returns buffered audio. `/tts/sse` parses chunk, word-timestamp, error
  and done records, including fragmented UTF-8 and CRLF framing. Cartesia timestamp
  seconds are converted to milliseconds.
- SSE uses raw PCM/mulaw/alaw. Direct streaming defaults to PCM16 at 24 kHz;
  explicitly requested WAV/MP3 without timestamps uses the chunked `/tts/bytes`
  response. Buffered synthesis defaults to WAV. Buffered timestamp WAV requests
  consume raw SSE and construct one WAV header after the complete audio arrives.
  MP3 plus timestamps, and direct WAV streaming plus timestamps, return `unsupported`.
- PCM16 and float32 map to `pcm_s16le` and `pcm_f32le`; telephony containers map to
  raw companded encodings. MP3 defaults to 128 kbps, transmitted in bits/second.
  Sonic 3 speed is clamped to 0.6–1.5; volume dB becomes a 0.5–2 multiplier.
  Older Sonic models receive top-level speed clamped from `speed - 1` into -1–1.
  Native generation options override mapped Sonic 3 controls. Emotion maps there;
  stability, similarity, style, pitch, seed and speakerBoost have no generic mapping.
- `/voices` follows `has_more`/`next_page` using `starting_after`, with an ID fallback.
  Remote pagination links contribute only a cursor, never another credential host.
  `is_public` maps to premade/cloned; a private custom voice can therefore be classified
  as cloned because that is the requested mapping and the response has no reliable subtype.
- Instant cloning requires exactly one sample and `consent.attested`; form fields
  include clip/name/description/language/mode/enhance/base_voice_id. Attestation is
  retained in returned raw metadata, not an invented Cartesia form field.
  PATCH changes name/description; DELETE removes the voice. Sample adaptation and
  professional cloning are unsupported.
- Extras exported from the provider index: `localizeVoice`, `mixVoices`,
  `infillAudio`, `createPronunciationDict`. Localization uses voice_id/language/dialect;
  mixing uses `{ voices: [{ id, weight }], name? }`; dictionary items use the native
  schema. Mixing and `/voice-changer/bytes` are compatibility/account-gated assumptions
  from the brief, not confirmed in the current public reference. Infill is multipart
  with left_audio/right_audio, transcript, voice_id and output_format bracket fields.
- Approximately $50/1M characters is a dated estimate from the brief, applied to the
  requested catalog, not an account quote. Voice conversion uses unknown per-request cost.

Sources: [TTS bytes](https://docs.cartesia.ai/api-reference/tts/bytes),
[SSE](https://docs.cartesia.ai/api-reference/tts/sse),
[cloning](https://docs.cartesia.ai/api-reference/voices/clone),
[infill](https://docs.cartesia.ai/api-reference/infill/bytes),
[pricing](https://cartesia.ai/pricing).

## Deepgram Aura

- Uses `/v1/speak` with `Authorization: Token …`. `listModels` returns pseudo-families
  `aura-2` and `aura-1`; synthesis sends the selected voice ID as the actual model.
  Explicit native model IDs are supported; family/voice mismatches are rejected.
- The static catalog includes all 50 requested Aura 2 voices and 12 legacy voices.
  Gender, age, accent and use tags are best-effort metadata, normalized from the voice
  table where available. Thalia keeps the brief's young classification. Current docs
  classify Thalia as adult and include additional languages/voices; `/models` enrichment
  can add native entries. New models are not fabricated if discovery is unavailable.
- Optional discovery falls back for unavailable/rate-limited endpoints, but authentication
  failures remain visible. `/models` is expected to expose a `tts` array or keyed collection.
- Speak accepts at most 2000 characters. All generic settings, including speed, are
  unsupported by Aura and omitted. No cloning, design, SSML, emotion or timestamps.
- HTTP chunked streaming uses Speak's REST formats, not the narrower WebSocket formats.
  PCM/WAV use linear16; raw mulaw/alaw specify container=none; opus/ogg use Ogg Opus.
  MP3/AAC have fixed 22050 Hz and Opus 48000 Hz. Fixed sample rates are not sent as
  configurable query parameters. Bitrates are converted from kbps to bps; invalid
  native format/rate/bitrate combinations fail before fetch.
- Aura 2 usage estimates use the brief's dated $30/1M character reference. Legacy
  usage cost is null. Pricing and voice availability can differ by plan.

Sources: [voices](https://developers.deepgram.com/docs/tts-models),
[output format matrix](https://developers.deepgram.com/docs/tts-media-output-settings),
[pricing](https://deepgram.com/pricing).

## PlayHT

- Both API key and userId are required; key aliases are PLAYHT_API_KEY then
  PLAY_HT_API_KEY. Authentication uses Bearer and X-USER-ID headers.
- Buffered and streamed synthesis both use `/api/v2/tts/stream`, with an Accept
  header matching the selected audio type. The default engine is Play3.0-mini;
  flagship selection returns PlayDialog. Mini allows 20000 characters; other
  catalog engines are conservatively limited to 2000.
- `PlayDialogMultilingual`, legacy `Play3.0` and raw PCM (`output_format: raw`) are
  compatibility assumptions requested by the brief; the current public streaming
  reference does not enumerate them. Provider errors are surfaced if unavailable.
- Speed maps directly (0.1–5). Stability maps inversely to temperature (0–2),
  similarity to voice_guidance (1–6), and style to style_guidance (1–30).
  These are adapter heuristics, not equivalence guarantees. Seed maps directly.
  Emotion strings pass through on non-dialog engines; legacy gender-prefixed emotion
  names must be supplied by callers. Language tags become English names, e.g. es →
  spanish, zh → mandarin. Pitch, volume and speakerBoost are omitted.
- `turnPrefix`, `turnPrefix2`, `voice2` aliases map to turn_prefix, turn_prefix_2,
  voice_2. `synthesizeDialog(ctx, turns, options?)` accepts `{ text, voiceId }` turns
  from one or two voices. It uses PlayDialog and stable speaker prefixes.
- `synthesizeJob(ctx, request, { pollIntervalMs?, timeoutMs? }?)` submits `/tts`, polls
  `/tts/{id}`, and downloads `output.url`. The default total deadline is context
  timeout or 120 seconds. Download requests never include API credentials.
- Voice listing merges premade and account clones; origin filters can avoid an
  unnecessary catalog endpoint. Cloning requires consent and one file or a native
  sample_file_url. Deletion sends `{ voice_id }` to DELETE `/cloned-voices`.
- Plan-dependent prices remain undefined and usage estimates are null.

Sources: [streaming fields](https://docs.play.ht/reference/api-generate-tts-audio-stream),
[API quickstart](https://docs.play.ht/reference/api-getting-started),
[pricing](https://play.ht/pricing).

## Hume Octave

- Uses `/v0/tts`, `/v0/tts/stream/json` and `X-Hume-Api-Key`. Octave 2 sends version=2;
  legacy Octave sends version=1. Maximum mapped utterance length is 5000 characters.
- Saved/preset voices use native provider values HUME_AI/CUSTOM_VOICE. Voice listing
  pages both providers using voices_page/total_pages. The factory remembers provider
  values after listing or saving; callers supplying an unknown custom ID should set
  `providerOptions.voiceProvider = "CUSTOM_VOICE"`. `voiceName` selects by name.
- Emotion and style become utterance.description acting directions; speed uses the
  brief's requested 0.25–3 clamp. The current reference lists 0.5–2 and describes
  version-dependent acting-instruction support. Extreme speeds or Octave 2 directions
  may therefore be rejected/ignored by the service; no silent model fallback occurs.
- Native context, instant_mode, split_utterances, num_generations and timestamp type
  options are available via providerOptions. Generic previousText becomes context
  utterances; nextText, pitch, volume, stability, similarity, seed and speakerBoost are omitted.
- Output is MP3/WAV/PCM, nominally 48 kHz, with actual sample rate taken from response
  encoding when present. The public schema has no selectable sample rate/bitrate;
  incompatible requested controls return unsupported.
- NDJSON parsing supports audio records plus standalone timestamp records. Native
  `time.begin/end` values are already milliseconds. Compatibility word/start/end
  records are interpreted as seconds. Phonemes are ignored because the shared
  contract exposes words only. Streaming sets strip_headers=true for concatenation.
- Design calls `/tts` without a forced version or voice, using description and 1–5
  generations. This avoids the voice-required constraint on explicitly selected
  Octave 2. Candidates carry generation_id; saving posts generation_id/name to
  `/tts/voices`. Optional saved description is local metadata because that create
  endpoint only documents generation_id/name. Deletion resolves ID to custom voice
  name before issuing DELETE `/tts/voices?name=…`.
- Audio cloning is intentionally not exposed. Pricing notes retain the brief's
  approximate Creator-plan $0.10/1k characters reference, while actual cost estimates
  remain null because pricing depends on the account plan.

Sources: [JSON synthesis](https://dev.hume.ai/voice/reference/text-to-speech-tts/synthesize-json),
[NDJSON streaming](https://dev.hume.ai/voice/reference/text-to-speech-tts/synthesize-json-streaming),
[timestamp units](https://dev.hume.ai/voice/docs/text-to-speech-tts/timestamps),
[voice pagination](https://dev.hume.ai/voice/reference/voices/list),
[model capability differences](https://dev.hume.ai/voice/docs/text-to-speech-tts/overview),
[pricing](https://www.hume.ai/pricing).

## Verification

- Final result: 123 tests across 8 files passed. Package typecheck and the separate
  strict check covering these provider sources and tests both passed.
- Package typecheck: `node ../../node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`.
- Assigned tests: `node ../../node_modules/vitest/vitest.mjs run test/cartesia test/deepgram test/playht test/hume`.
- Separate strict source/test typecheck uses TypeScript 7's `--ignoreConfig`, NodeNext,
  ES2023, `--types node`, `--strict` and `--skipLibCheck` over the four test directories.
- Test coverage includes native bodies/queries, format matrices, split streams,
  timestamps, pagination, multipart cloning/consent, errors/Retry-After, aborts,
  response-body timeouts, job polling and unauthenticated artifact downloads.
- No repository-wide build, browser suite or live provider calls were run for this
  scoped, dependency-free package work.
