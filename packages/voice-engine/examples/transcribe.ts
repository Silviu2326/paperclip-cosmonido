import { createSttEngine, allSttProviders } from "../src/stt/index.js";
import { readFile } from "node:fs/promises";

const engine = createSttEngine({ providers: allSttProviders });
const audio = new Uint8Array(await readFile(process.argv[2] ?? "speech.wav"));
const result = await engine.transcribe({ audio: { data: audio, mimeType: "audio/wav" }, language: "auto", wordTimestamps: true });
console.log(result.text, result.usage);
