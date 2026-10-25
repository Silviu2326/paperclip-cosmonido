# Provider reference

Snapshot: 2026-10-22. Tables describe **bundled adapter metadata**, including
compatibility models, rather than the vendor's entire current catalog. Rates are
the bundled estimation inputs in USD per million characters unless stated otherwise;
they are not invoice quotes. Query `models --json` for model notes and
`providers --json` for runtime capability flags. Model-specific support takes
precedence over the provider-wide union. Settings not mapped below have no native
equivalent in that adapter and should not be relied upon.

## ElevenLabs

| Models | Tier | Declared languages | Input limit | Pricing |
|---|---|---|---|---|
| `eleven_v3` | flagship | 85 tags | 5,000 chars | Plan/voice-dependent |
| `eleven_multilingual_v2` | balanced, default | 29 | 10,000 | Plan-dependent |
| `eleven_flash_v2_5`, `eleven_turbo_v2_5` | fast | 32 | 40,000 | Plan-dependent |
| `eleven_flash_v2`, `eleven_turbo_v2` | fast | English | 40,000 | Plan-dependent |
| `eleven_monolingual_v1` | legacy | English | 10,000 | Account-dependent |
| `eleven_multilingual_sts_v2`, `eleven_english_sts_v2` | balanced / legacy | 29 / English | Audio-based | Plan-dependent |

Mapping: `stability`, `style`, and `speed` go into `voice_settings`;
`similarity` becomes `similarity_boost`, `speakerBoost` becomes
`use_speaker_boost`, and `seed` is top-level. V3 stability is quantized to
0, 0.5, or 1; `emotion` becomes a v3 audio tag. Pitch and volume are not mapped.

`eleven_multilingual_v2` does not accept `language_code`; the adapter omits it.
Its compatibility call uses `xi-api-key`, `model_id: eleven_multilingual_v2`,
and `output_format=mp3_44100_128`. Timestamp endpoints provide alignment.
SSML is not advertised as a general capability. Professional clones can return
training/verification states rather than a ready voice. Streaming means audio
output streaming, not incrementally supplying text to a WebSocket.
See [Speech API](https://elevenlabs.io/docs/api-reference/text-to-speech/convert)
and [language-code restriction](https://elevenlabs.io/docs/de/api-reference/text-to-speech/v-1-text-to-speech-voice-id-stream-input).

## Fish Audio

| Models | Tier | Declared languages | Input limit | Pricing |
|---|---|---|---|---|
| `s1` | flagship, default | 13 | 15,000 chars in metadata | $15 / million UTF-8 bytes |
| `s1-mini` | fast | 13 | 15,000 | Unknown hosted rate/availability |
| `speech-1.6` | balanced | 13 | 15,000 | Unknown compatibility rate |
| `speech-1.5` | legacy | 13 | 15,000 | Unknown compatibility rate |

Mapping: `speed` and `volume` become `prosody.speed` and `prosody.volume`;
`stability` becomes `temperature = clamp(1 - stability, 0.1, 1)`.
S1 `emotion` prefixes a parenthesized instruction. Other normalized settings
are not mapped. Clone samples create provider reference voices.

Fish bills UTF-8 bytes, not JavaScript string length. Prefer `UsageRecord.unit`
and `units` over multiplying characters by the model's historically named
`usdPerMillionChars` field. Do not assume provider-native timestamps or design
features are exposed by this compatibility adapter: they are not advertised here.
S1 is deprecated with retirement on 2026-12-31; newer vendor models are outside
this bundled table. [Official pricing and migration notice](https://docs.fish.audio/developer-guide/models-pricing/pricing-and-rate-limits).

## OpenAI

| Model | Tier | Declared languages | Input limit | Bundled pricing |
|---|---|---|---|---|
| `gpt-4o-mini-tts` | flagship, default | 57 | 4,096 chars; provider also has token limits | $12/M-character budget heuristic only |
| `tts-1-hd` | balanced | 57 | 4,096 chars | $30/M characters |
| `tts-1` | fast | 57 | 4,096 chars | $15/M characters |

Mapping: `speed` is native (0.25–4). On `gpt-4o-mini-tts`, `emotion`,
`style`, and language become text instructions. The older models do not accept
instructions. Other normalized settings are not mapped. Static voices include
`coral`; cloning, design, and speech-to-speech are not exposed by this adapter.

Actual GPT-4o mini TTS pricing is token-based ($0.60/M text input tokens and
$12/M audio output tokens), so the bundled character heuristic is only an estimate.
[Official model pricing](https://developers.openai.com/api/docs/models/gpt-4o-mini-tts).

PCM/WAV use 24 kHz mono, 16-bit audio; arbitrary resampling is not available.
All three bundled Speech API models are deprecated and scheduled for shutdown
on 2027-01-06. The vendor's replacement requires Realtime rather than swapping
a model id in `/audio/speech`. [Speech API guide and notice](https://developers.openai.com/api/docs/guides/text-to-speech).

## MiniMax

| Models | Tier | Declared languages | Input limit | Bundled pricing |
|---|---|---|---|---|
| `speech-02-hd` | flagship, default | 37 | 10,000-char metadata ceiling | $100/M |
| `speech-02-turbo` | fast | 37 | 10,000 | $60/M |
| `speech-2.5-hd-preview`, `speech-2.5-turbo-preview` | flagship / fast | 37 | 10,000 | Unverified preview ids/rates |
| `speech-01-hd`, `speech-01-turbo` | legacy | 37 | 10,000 | Unknown |

Mapping: `speed` is clamped to 0.5–2; `pitch` is an integer from -12 to 12;
`volume` becomes linear `vol = clamp(10 ** (dB / 20), 0, 10)`. Named emotion
maps to MiniMax's supported enum with aliases; unsupported names become neutral.
These fields belong to `voice_setting`. Stability, similarity, style, and seed
are not mapped. Language becomes `language_boost`.

JSON and SSE carry **hex-encoded audio** which the adapter decodes. Timestamps
use subtitle data/links when available. Streaming excludes aggregated duplicate
audio and cannot use WAV here. Stay below the documented strict 10,000-character
boundary even though the descriptor uses 10,000 as its ceiling. Optional group
ids are account-specific. Current vendor docs list newer models than the bundled
preview ids. [Synchronous TTS reference](https://platform.minimax.io/docs/api-reference/speech-t2a-http).

## Cartesia

| Models | Tier | Declared languages | Input limit | Bundled pricing |
|---|---|---|---|---|
| `sonic-3` | flagship, default | 41 | Provider ceiling: 10,000 chars | Approximate $50/M |
| `sonic-2` | balanced | 16 | Provider ceiling | Approximate $50/M |
| `sonic-turbo` | fast | 16 | Provider ceiling | Approximate $50/M |
| `sonic-english`, `sonic-multilingual` | legacy | 1 / 16 | Provider ceiling | Approximate $50/M |

Mapping: Sonic 3 uses generation configuration with `speed` clamped to 0.6–1.5,
`volume` converted from dB to linear amplitude (0.5–2), and `emotion`.
Older models map speed to a -1..1 control. Other normalized settings are not mapped.
SSE can carry audio plus timestamps; formats differ across endpoints.
Instant cloning and STS are exposed, while professional training and voice design
are not part of the shared adapter. The pinned `sonic-3` catalog should not be
confused with the vendor's newer model releases.
[Bytes endpoint](https://docs.cartesia.ai/api-reference/tts/bytes),
[current model page](https://docs.cartesia.ai/build-with-cartesia/tts-models/latest).

## Azure AI Speech

| Family | Tier | Declared languages | Adapter input ceiling | Bundled pricing |
|---|---|---|---|---|
| `neural` | balanced | 40 | 10,000 chars | Approximate $15/M |
| `neural-hd` | flagship | 8 | 10,000 | Approximate $30/M |
| `multilingual` | balanced | 40 | 10,000 | Approximate $15/M |
| `custom-neural` | legacy family marker | 40 | 10,000 | Unknown |

These family ids classify voices; choose an actual regional voice id from the
catalog. Region defaults to `westeurope`, but should match the Speech resource.
Mapping: speed becomes SSML prosody `rate`, pitch becomes semitones, volume becomes
dB. Emotion maps to `mstts:express-as` (for example happy → cheerful), with style
mapped to `styledegree`. Unsupported styles depend on the selected voice.

The synchronous REST adapter returns audio and has **no word-boundary events**.
Azure's SDK event interface is a separate surface. Personal Voice enrollment
requires limited-access entitlement, language, company name, and separate consent
audio via programmatic provider options. Professional Custom Neural Voice training
is not implemented here. [REST reference](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech),
[SDK events](https://learn.microsoft.com/azure/ai-services/speech-service/how-to-speech-synthesis).

## Google Cloud Text-to-Speech

| Models / families | Tier | Declared languages | Adapter ceiling | Bundled pricing |
|---|---|---|---|---|
| `gemini-2.5-pro-tts` | flagship | 26 | 5,000 | Token-priced; estimate null |
| `gemini-2.5-flash-tts` | fast | 26 | 5,000 | Token-priced; estimate null |
| `chirp3-hd` | balanced | 49 | 5,000 | $30/M |
| `neural2` | balanced | 49 | 5,000 | $16/M |
| `studio` | flagship | 49 | 5,000 | $160/M |
| `wavenet`, `standard` | legacy | 49 | 5,000 | $16/M / $4/M |

The provider's request quota may count UTF-8 bytes; use conservative chunking for
multibyte scripts. Cloud voice families map speed/pitch/volume to
`audioConfig.speakingRate`, `pitch`, and `volumeGainDb`. Gemini instead expresses
these controls and emotion/style as prompts. Other normalized settings are not mapped.

Gemini and Chirp 3 HD do not advertise general SSML here. Supported classic
families can return SSML mark timepoints; Studio excludes marks. Streaming is
sequential sentence synthesis over REST and does not provide native bidirectional
gRPC latency. The API accepts a key or access token depending on the route; the
definition's empty `requiredCredentials` represents alternatives, not anonymous access.
Instant Custom Voice requires allowlisting, one reference sample, a consent script,
and separate consent recording through programmatic provider options.
Pricing excludes free tiers. [Google pricing](https://cloud.google.com/text-to-speech/pricing).

## Deepgram

| Family | Tier | Declared languages | Input limit | Bundled pricing |
|---|---|---|---|---|
| `aura-2` | flagship | English, Spanish | 2,000 chars | $30/M |
| `aura-1` | legacy | English | 2,000 | Unknown |

Voice ids are model-like identifiers such as `aura-2-thalia-en`; family ids alone
do not select a speaker. VoiceSettings are intentionally ignored. The adapter
supports chunked HTTP response audio, not the WebSocket protocol. SSML,
timestamps, cloning, design, and STS are not exposed. MP3/AAC and Opus use fixed
sample rates; unsupported encoding combinations fail explicitly. Use `--long`
with conservative chunks for longer input. [Official input limit and latency guidance](https://developers.deepgram.com/docs/text-to-speech-latency).

## PlayHT

| Models | Tier | Declared languages | Input limit | Pricing |
|---|---|---|---|---|
| `PlayDialog` | flagship | 37 | 2,000 chars | Plan-dependent |
| `PlayDialogMultilingual` | balanced compatibility id | 37 | 2,000 | Unknown |
| `Play3.0-mini` | fast | 37 | 20,000 | Plan-dependent |
| `Play3.0` | legacy compatibility id | 37 | 2,000 | Unknown |

Mapping: speed and seed are native; stability becomes `temperature = 2 * (1-s)`,
similarity becomes `voice_guidance = 1 + 5*s`, and style becomes
`style_guidance = 1 + 29*s`. Emotion is omitted for Dialog-family models.
Pitch and volume are not mapped. Voice ids can be long `s3://...` manifest URLs;
keep the entire provider voice id after the first `playht:` separator.

Both API key and user id are required. Streaming uses `/api/v2/tts/stream`.
Instant clones are supported; no shared timestamp/design/STS or professional clone
surface is advertised. Compatibility models may not be enabled for every account.
[Authentication and streaming quickstart](https://docs.play.ht/reference/api-getting-started).

## Hume

| Models | Tier | Declared languages | Input limit | Pricing |
|---|---|---|---|---|
| `octave-2` | flagship, default | 11 | 5,000 chars | Plan-dependent; null estimate |
| `octave` | legacy | English, Spanish | 5,000 | Plan-dependent |

Mapping: speed becomes utterance speed (0.25–3). Emotion and style contribute to
natural-language acting directions. Other normalized settings are not mapped.
Octave 2 supports word timestamps; legacy Octave rejects that request. Streaming
decodes NDJSON audio records and timestamp records. Audio encoding is MP3/WAV/PCM
at the provider-selected 48 kHz; arbitrary resampling is not exposed.

Design produces generation tokens/previews that can be saved as reusable voices.
Audio-sample cloning is not exposed by this adapter even though the vendor has
documented cloning products. Hume announces TTS/EVI access ending on
2026-11-13 at 00:01 EST and subsequent account-data deletion; plan any persistence
accordingly. [Official TTS overview and sunset notice](https://dev.hume.ai/voice/docs/text-to-speech-tts/overview).

## Other provider kinds

The tables above cover TTS adapters. STT, LLM, and realtime catalogs are defined in `src/stt/index.ts`, `src/llm/index.ts`, and `src/realtime/index.ts`; use their CLI list commands for installed metadata. See [STT](STT.md), [LLM](LLM.md), and [realtime](REALTIME.md).
