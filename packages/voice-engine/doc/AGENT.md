# Voice agent pipeline

## Architecture

`Transport audio -> VAD -> STT stream -> end-of-turn detector -> LLM stream -> sentence chunker -> TTS -> playback transport`

The pipeline owns turn state and cancellation. Transport, VAD and semantic end-of-turn logic are injected. A simple implementation can omit VAD and use provider endpointing plus a silence timer.

## State machine

`idle -> listening -> user_speaking -> thinking -> speaking -> listening`. Barge-in moves `speaking -> interrupted -> user_speaking`; stopping or transport closure moves any live state to `ended`. Every turn has a generation identity so late STT, LLM, or TTS events from an aborted turn must be ignored. On interruption, abort generation, clear queued playback, and retain only assistant text confirmed as played by transport marks.

## Latency budget

| Stage | Initial target |
|---|---:|
| End-of-turn decision | 200–300 ms |
| Final STT after endpoint | 100–150 ms |
| LLM first token | 250–350 ms |
| First sentence chunk | 50–150 ms |
| TTS first byte | 150–200 ms |
| Transport buffer | 50–100 ms |

These are engineering budgets, not service guarantees; instrument each stage and tune from measured calls. A first audible reply near 0.8–1.2 s is a useful initial target.

## Barge-in and telephony

Use a short confirmation window to avoid treating clicks or backchannels as interruptions. A confirmed interruption cancels the turn and calls `clearPlayback()`. Twilio bidirectional Media Streams exchange base64 mu-law 8 kHz mono audio without WAV headers; `clear` drops queued audio and `mark` confirms playback. Convert/resample at the transport boundary when provider formats differ. See [Twilio protocol docs](https://www.twilio.com/docs/voice/media-streams/websocket-messages).

## VAD and semantic end-of-turn adapters

Implement `VoiceActivityDetector` around Silero or another model: normalize frames to PCM16, return speech probability and reset at session boundaries. Keep model/runtime dependencies outside this zero-dependency package and inject an adapter. Implement `EndOfTurnDetector.analyze` around a semantic turn model or service; give it transcript, trailing silence, language, and optional history. A hybrid strategy uses VAD to know when silence begins, then lets semantic EOT distinguish pauses from completed thoughts, with a maximum timeout as a safety bound.

See [offline example](../examples/voice-agent-offline.ts) and [Twilio wiring example](../examples/voice-agent-twilio.ts).
