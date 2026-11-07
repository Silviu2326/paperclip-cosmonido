# STT A provider verification notes

Verified 2026-10-22 against vendor documentation.

## Deepgram

- [Live Audio API reference](https://developers.deepgram.com/reference/speech-to-text/listen-streaming) confirms `/v1/listen`, `Authorization: Token`, binary audio, `Finalize`, `KeepAlive`, `CloseStream`, and `Results`, `Metadata`, `UtteranceEnd`, `SpeechStarted` events.
- [Flux quickstart](https://developers.deepgram.com/docs/flux/quickstart) confirms Flux uses `/v2/listen` and `flux-general-en` / `flux-general-multi`; research's endpoint/model claim is correct.
- [Flux configuration](https://developers.deepgram.com/docs/flux/configuration) confirms `EndOfTurn`, `EagerEndOfTurn`, and `TurnResumed` configuration. It says eager events require `eager_eot_threshold`; local adapter currently maps turn-ended events and reports TurnResumed as metadata because contract has no resumed event.
- [Keyterm docs](https://developers.deepgram.com/docs/keyterm) establish keyterms; streaming reference has keyterms as a Configure message. Batch `translate` is treated as a query option based on requested scope but wasn't separately verified; needs confirmation before depending on it.
- Research stated translate as potentially supported; it was not verified. Adapter currently forwards `translateTo` to `translate` as a best-effort query parameter.
- Pricing is deliberately not encoded because [official pricing](https://deepgram.com/pricing) labels streaming list rates promotional and plan-dependent.
- Additional official model verification on [October 7, 2026](https://developers.deepgram.com/changelog/2026/10/7) confirms `nova-3-medical` for batch and streaming English. The descriptor includes it; research did not mention this recent update.

## ElevenLabs

- [Convert endpoint](https://elevenlabs.io/docs/api-reference/speech-to-text/convert) confirms `POST /v1/speech-to-text`, `xi-api-key`, `model_id`, word timestamps, speaker and `language_probability`. Research's batch endpoint/auth/model are confirmed.
- [Realtime reference](https://elevenlabs.io/docs/api-reference/speech-to-text/v-1-speech-to-text-realtime) and [commit strategy guide](https://elevenlabs.io/docs/eleven-api/guides/how-to/speech-to-text/realtime/transcripts-and-commit-strategies) confirm the realtime URL, `scribe_v2_realtime`, `manual`/`vad`/`turn_prediction`, `input_audio_chunk`, `partial_transcript`, and committed transcript events. Streaming support is confirmed; manual commit used unless semantic turn events requested.
- Research called the model `scribe_v2` and realtime path unverified; official docs confirm these IDs/URL. `keyterms` is sent as a JSON string in multipart; exact form serialization should be validated against the live API before relying on it.
- Official pricing can include add-ons and plan specifics; model descriptors omit pricing rather than treat a particular plan as universal.

## OpenAI

- [Speech-to-text guide](https://developers.openai.com/api/docs/guides/speech-to-text) confirms `/v1/audio/transcriptions`, `gpt-transcribe`, `languages` (plural), `prompt`, `keywords`, 25 MB files, `whisper-1` verbose timestamps and deprecation of older models on 2027-02-26.
- [Realtime transcription guide](https://developers.openai.com/api/docs/guides/realtime-transcription) confirms `session.update`, `input_audio_buffer.append`, `input_audio_buffer.commit`, 24 kHz PCM format, and `conversation.item.input_audio_transcription.delta` / `.completed` event names. Research's `transcript.text.delta` names describe file-streaming SSE and are not live-session event names.
- Official realtime transcription docs confirm the websocket session workflow but do not specify the complete handshake URL in the fetched guide. Adapter uses the standard Realtime websocket URL with `intent=transcription` and model query plus legacy beta header; verify this handshake against current session docs before deploying. Telephony μ-law subprotocol/rate support is provisionally mapped to `audio/pcmu` at 8 kHz.
- Model descriptor prices remain undocumented here rather than assuming a fixed account price.

## Groq

- [Speech-to-text docs](https://console.groq.com/docs/speech-to-text) confirm the endpoint family, `whisper-large-v3` / `whisper-large-v3-turbo`, batch-only behavior, JSON/verbose_json, word and segment timestamp options, model prices, and account-tier 25/100 MB upload limits. They also document URL input and the 10-second billing minimum.
- Research said `timestamp_granularities` requires verbose_json, correct per current docs. The code adds both word and segment for verbose responses.
- Groq's URL path is relayed in multipart `url` (not downloaded), as the vendor supports this for large audio.
