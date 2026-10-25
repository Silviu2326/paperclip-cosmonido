const { createVoiceEngine, allProviders, createFileStorage, help } = await import(new URL("./_runtime.ts", import.meta.url).href) as typeof import("./_runtime.js");
help('ELEVENLABS_API_KEY is required. Run: node --experimental-strip-types examples/design-voice.ts ["Voice description"]');

const engine = createVoiceEngine({ providers: allProviders });
const result = await engine.designVoice("elevenlabs", {
  prompt: process.argv[2] ?? "A warm, calm Castilian Spanish female narrator in her forties.",
  language: "es-ES", candidates: 3,
  text: "Bienvenidos a esta historia. Hoy vamos a descubrir un lugar tranquilo, lleno de luz, donde cada palabra encuentra su propio ritmo y nos invita a escuchar con atención.",
});
const storage = createFileStorage("./audio/design");
for (const [index, candidate] of result.candidates.entries()) {
  console.log({ candidateId: candidate.candidateId, ...await storage.save(candidate.preview, { fileName: `candidate-${index + 1}.${candidate.preview.format.container}` }) });
}
// Use engine.saveDesignedVoice(provider, candidateId, name) to keep a chosen voice.
