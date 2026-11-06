import { readFile } from "node:fs/promises";
import type { EngineVoiceId } from "../src/core/types.js";
const { createVoiceEngine, allProviders, createFileStorage, createFileCache, help } = await import(new URL("./_runtime.ts", import.meta.url).href) as typeof import("./_runtime.js");
help("Run: node --experimental-strip-types examples/long-form-narration.ts book.txt [openai:coral]");
const file = process.argv[2];
if (!file) throw new Error("Supply a UTF-8 text file; use --help.");

const engine = createVoiceEngine({ providers: allProviders, cache: createFileCache("./.voice-cache") });
const unsubscribe = engine.on(event => { if (event.type === "usage") console.error(event.usage); });
try {
  const result = await engine.synthesizeLong({
    text: await readFile(file, "utf8"), voice: (process.argv[3] ?? "openai:coral") as EngineVoiceId,
    format: { container: "wav", sampleRate: 24000 },
  }, { maxChunkChars: 1500, concurrency: 2 });
  console.log(await createFileStorage("./audio").save(result.audio, { fileName: "narration.wav" }));
} finally { unsubscribe(); }
