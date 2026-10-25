# CLI v2 verification notes

Research date: 2026-10-22. Official docs checked before implementing CLI-facing workflows:

- Deepgram live STT is `wss://api.deepgram.com/v1/listen`; the official protocol documents `Finalize`, `CloseStream`, `KeepAlive`, `Results`, `UtteranceEnd`, and `SpeechStarted`: https://developers.deepgram.com/reference/speech-to-text/listen-streaming
- OpenAI transcription is `POST https://api.openai.com/v1/audio/transcriptions`: https://platform.openai.com/docs/api-reference/audio/createTranscription
- OpenAI's current realtime model page and server-event reference list `gpt-realtime-2.1` and `gpt-realtime-2.1-mini`; the model page describes speech-to-speech and function calling: https://developers.openai.com/api/docs/models/gpt-realtime-2.1 and https://developers.openai.com/api/reference/resources/realtime/server-events
- Twilio bidirectional Media Streams use base64 `audio/x-mulaw` 8 kHz mono payloads without file headers; `clear` interrupts queued playback and `mark` reports playback completion: https://www.twilio.com/docs/voice/media-streams/websocket-messages

Discrepancy against research: the STT report describes the older `gpt-4o-transcribe` family and its 2027-02-26 retirement, while the official transcription reference fetched in this check still lists those IDs and the report separately identifies `gpt-transcribe` / `gpt-live-transcribe`. The provider implementation must follow the current speech-to-text guide/model reference; the CLI does not hard-code STT model IDs. Realtime research's `gpt-realtime-2.1` IDs are confirmed by the current official model/event reference. The CLI `realtime-info` returns provider metadata instead of hard-coding a list.

Remaining assumptions: `stt-stream --realtime` interprets a WAV file as a 44-byte-header PCM payload and paces 50 ms frames; this supports ordinary PCM WAV only, not arbitrary WAV chunks. `agent-sim` treats input as raw PCM16 16 kHz for its in-memory transport. `llm-bench`'s token throughput is an approximate whitespace-token rate because provider stream events expose deltas rather than token counts. Model pricing remains provider metadata and is not inferred here.
