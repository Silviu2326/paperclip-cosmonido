import type { SttProviderDefinition } from "./types.js";
import { deepgramSttProvider } from "./providers/deepgram/index.js";
import { elevenLabsSttProvider } from "./providers/elevenlabs/index.js";
import { openAiSttProvider } from "./providers/openai/index.js";
import { groqSttProvider } from "./providers/groq/index.js";
import { assemblyAiSttProvider } from "./providers/assemblyai/index.js";
import { sonioxSttProvider } from "./providers/soniox/index.js";
import { speechmaticsSttProvider } from "./providers/speechmatics/index.js";
import { gladiaSttProvider } from "./providers/gladia/index.js";
import { mistralSttProvider } from "./providers/mistral/index.js";
import { googleSttProvider } from "./providers/google/index.js";
import { azureSttProvider } from "./providers/azure/index.js";
import { fishAudioSttProvider } from "./providers/fish-audio/index.js";
import { revSttProvider } from "./providers/rev/index.js";

export * from "./types.js";
export * from "./engine.js";
export {
  deepgramSttProvider,
  elevenLabsSttProvider,
  openAiSttProvider,
  groqSttProvider,
  assemblyAiSttProvider,
  sonioxSttProvider,
  speechmaticsSttProvider,
  gladiaSttProvider,
  mistralSttProvider,
  googleSttProvider,
  azureSttProvider,
  fishAudioSttProvider,
  revSttProvider,
};

/** Every bundled STT provider, in default routing preference order. */
export const allSttProviders: SttProviderDefinition[] = [
  deepgramSttProvider,
  elevenLabsSttProvider,
  openAiSttProvider,
  assemblyAiSttProvider,
  sonioxSttProvider,
  groqSttProvider,
  speechmaticsSttProvider,
  gladiaSttProvider,
  mistralSttProvider,
  googleSttProvider,
  azureSttProvider,
  fishAudioSttProvider,
  revSttProvider,
];
