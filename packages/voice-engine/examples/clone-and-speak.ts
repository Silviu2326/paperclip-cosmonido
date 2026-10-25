import { readFile } from "node:fs/promises";
import { basename } from "node:path";
const { createVoiceEngine, allProviders, createFileStorage, help } = await import(new URL("./_runtime.ts", import.meta.url).href) as typeof import("./_runtime.js");
help("ELEVENLABS_API_KEY is required. Run: node --experimental-strip-types examples/clone-and-speak.ts owner.wav --consent");
if (!process.argv.includes("--consent")) throw new Error("Pass --consent only with the voice owner's informed permission.");
const file = process.argv.slice(2).find(arg => !arg.startsWith("--"));
if (!file) throw new Error("Supply a WAV recording from the consenting voice owner.");

const engine = createVoiceEngine({ providers: allProviders });
const clone = await engine.cloneVoice("elevenlabs", {
  name: "Consented example voice", mode: "instant", consent: { attested: true },
  samples: [{ data: await readFile(file), mimeType: "audio/wav", fileName: basename(file) }],
});
console.log({ voice: clone.voice.id, status: clone.status });
if (clone.status === "ready") {
  const result = await engine.synthesize({ text: "This is my consented synthetic voice.", voice: clone.voice.id });
  console.log(await createFileStorage("./audio").save(result.audio, { fileName: `clone.${result.audio.format.container}` }));
}
// The provider voice persists. Delete it explicitly when it is no longer needed.
