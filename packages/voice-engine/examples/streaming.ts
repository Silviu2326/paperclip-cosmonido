import { mkdir, open } from "node:fs/promises";
const { createVoiceEngine, allProviders, help } = await import(new URL("./_runtime.ts", import.meta.url).href) as typeof import("./_runtime.js");
help("OPENAI_API_KEY is required. Run: node --experimental-strip-types examples/streaming.ts");

const engine = createVoiceEngine({ providers: allProviders });
await mkdir("./audio", { recursive: true });
const file = await open("./audio/stream.mp3", "w");
try {
  for await (const chunk of engine.synthesizeStream({
    text: "This is AI-generated speech, arriving a chunk at a time.",
    voice: "openai:coral", format: { container: "mp3" },
  })) {
    let offset = 0;
    while (offset < chunk.audio.byteLength) {
      const { bytesWritten } = await file.write(chunk.audio, offset, chunk.audio.byteLength - offset);
      if (!bytesWritten) throw new Error("Output write made no progress.");
      offset += bytesWritten;
    }
    console.error(`Received ${chunk.audio.byteLength} bytes`);
  }
} finally { await file.close(); }
console.log("audio/stream.mp3");
