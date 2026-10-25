# Speech-to-text

The STT engine exposes static provider/model metadata, batch transcription, and optional streaming sessions through `src/stt/types.ts`. Use `voice-engine stt-providers` and `stt-models` to inspect the installed catalog without credentials. `transcribe` supports file or stdin input, optional word timestamps, diarization, vocabulary hints, translation, and JSON/text/SRT/WebVTT output. `stt-stream` sends paced chunks to a streaming provider and prints interim and final events.

Provider capabilities vary. Check model descriptors for streaming, timestamps, diarization, language detection, keywords, translation, and endpointing. Missing prices remain unpriced. Never infer that a provider supports an option because another provider does.

```ts
const result = await stt.transcribe({ audio: { data, mimeType: "audio/wav" }, language: "auto", wordTimestamps: true });
```

For endpoint and wire-format sources verified for this CLI, see [the v2 notes](notes/cli-v2.md).
