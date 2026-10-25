# Realtime speech-to-speech

Realtime definitions expose a single session that accepts audio/text and yields audio, transcript, interruption, tool-call and completion events. The provider owns turn orchestration, so compare its barge-in, input/output encoding, and tool behavior with the injected STT→LLM→TTS pipeline before selecting it. `realtime-info` prints provider IDs and model lists available in the installed build.

```ts
const session = await provider.connect({ instructions: "Be concise", inputFormat: { encoding: "pcm16", sampleRate: 24000 }, outputFormat: { encoding: "pcm16", sampleRate: 24000 } });
session.sendAudio(frame);
```

Model IDs, formats, and prices are intentionally not copied from secondary research; inspect provider metadata and current official docs before deployment. The CLI's realtime listing requires no credentials.
