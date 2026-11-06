# Realtime provider notes (2026-10-22)

## Official verification

- OpenAI Realtime docs: https://platform.openai.com/docs/guides/realtime and API references https://platform.openai.com/docs/api-reference/realtime-client-events/session and https://platform.openai.com/docs/api-reference/realtime-server-events. Current pricing/model page identifies `gpt-realtime-2.1` (and `gpt-realtime-2.1-mini`); the separate GPT-Live sessions API is a different product. The WebSocket client events retain `session.update` and the realtime event family; no `OpenAI-Beta` requirement was found in current GA docs, so no beta header is sent. Some current docs still document legacy `response.audio.delta`/transcript event names, while the request describes both legacy and `response.output_audio.delta` names; parser accepts both.
- Gemini Live WebSocket docs: https://ai.google.dev/api/live?hl=en and https://ai.google.dev/gemini-api/docs/live-api/get-started-websocket. The exact `v1beta.GenerativeService.BidiGenerateContent` path is confirmed. Auth docs say API key in URL query. Raw PCM16 input is 16 kHz; model audio output is 24 kHz. The protocol's realtime text field is `realtimeInput.text`; setup is the sole initial message and clients wait for `setupComplete`.

## Discrepancies and assumptions

- The research report had OpenAI's active model unresolved; official pricing currently names `gpt-realtime-2.1`, used as the default. Model availability may be account-dependent.
- The prompt's Gemini claim that `realtimeInputConfig` and audio transcription are ordinary setup fields is consistent with the current API reference, but the text-input recommendation mentions both `clientContent` and `realtimeInput.text`; implementation uses the documented realtime input text path. Gemini's public Live API is marked preview in the reference.
- The shared session contract has no response item id parameter for truncation. OpenAI truncate therefore cannot identify the active assistant item; this adapter currently sends an empty item id when playedMs is supplied. This is a contract limitation and should be addressed in a future contract revision.
- Realtime audio format validation follows native sample rates; OpenAI allows PCM16 24 kHz and G.711 8 kHz. Gemini is implemented PCM16-only at 16 kHz in / 24 kHz out.
