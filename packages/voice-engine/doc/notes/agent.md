# Agent area notes

Date checked: 2026-10-22.

## Twilio Media Streams

Official protocol documentation: https://www.twilio.com/docs/voice/media-streams/websocket-messages

- Confirmed inbound/outbound media payload uses headerless `audio/x-mulaw`, 8000 Hz, mono; media payload is base64.
- Confirmed outbound messages are `media`, `mark`, and `clear`; media is played in received order. A `clear` flushes buffered audio and causes acknowledgements for pending marks, including marks whose audio was discarded.
- `start` contains `streamSid`, `callSid`, and `customParameters`; inbound event names include connected/start/media/dtmf/mark/stop.
- Discrepancy: the research description says outbound playback should be paced in 20 ms (160-byte) slices. Twilio's official protocol permits media payloads of any size and doesn't require 20 ms pacing. The implementation keeps the requested 160-byte frames as an engineering choice.
- Assumption: Twilio is used with a bidirectional `<Connect><Stream>`; outbound audio and DTMF are not available on unidirectional `<Start><Stream>`.

## Contract/implementation limitations

- `VoiceActivityDetector.process` is synchronous, so `createVadFromProbability` requires a synchronous caller model despite accepting a promise-capable type for defensive API documentation; async VAD must be adapted outside this adapter.
- `AgentTransport.sendAudio` is synchronous and exposes no queue-depth or played-frame callbacks besides optional marks. Exact spoken-text truncation is therefore only possible when the caller provides meaningful marks; otherwise this pipeline has a best-effort approximation.
- TTS audio container formats other than raw PCM16/μ-law/A-law cannot be decoded by this dependency-free frame converter. The pipeline assumes TTS returns raw PCM-like payload bytes.
