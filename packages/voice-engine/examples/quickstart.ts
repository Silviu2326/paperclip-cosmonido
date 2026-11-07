const { createVoiceEngine, allProviders, createFileStorage, help } = await import(new URL("./_runtime.ts", import.meta.url).href) as typeof import("./_runtime.js");
help("OPENAI_API_KEY is required. Run: node --experimental-strip-types examples/quickstart.ts");

const engine = createVoiceEngine({ providers: allProviders });
const result = await engine.synthesize({
  text: "Hola. Esta es una voz generada con inteligencia artificial.",
  voice: "openai:coral", language: "es-ES", model: "gpt-4o-mini-tts",
  format: { container: "mp3" }, settings: { speed: 1, emotion: "warm" },
});
const saved = await createFileStorage("./audio").save(result.audio, { fileName: "quickstart.mp3" });
console.log(saved.uri);
console.error(result.usage);
