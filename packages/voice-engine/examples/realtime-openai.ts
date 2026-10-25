import { allRealtimeProviders } from "../src/realtime/index.js";

const definition = allRealtimeProviders.find(provider => provider.id === "openai");
if (!definition) throw new Error("OpenAI realtime provider is not included in this build.");
const session = await definition.create({ credentials: { apiKey: process.env.OPENAI_API_KEY }, fetch }).connect({ instructions: "Answer briefly.", model: process.env.OPENAI_REALTIME_MODEL, inputFormat: { encoding: "pcm16", sampleRate: 24000 }, outputFormat: { encoding: "pcm16", sampleRate: 24000 }, inputTranscription: true });
for await (const event of session.events) if (event.type === "assistant_transcript") process.stdout.write(event.text);
