import type { ProviderDefinition } from "../core/types.js";
import { elevenLabsProvider } from "./elevenlabs/index.js";
import { fishAudioProvider } from "./fish-audio/index.js";
import { minimaxProvider } from "./minimax/index.js";
import { openAiProvider } from "./openai/index.js";
import { azureProvider } from "./azure/index.js";
import { googleProvider } from "./google/index.js";
import { cartesiaProvider } from "./cartesia/index.js";
import { deepgramProvider } from "./deepgram/index.js";
import { playHtProvider } from "./playht/index.js";
import { humeProvider } from "./hume/index.js";

export {
  elevenLabsProvider,
  fishAudioProvider,
  minimaxProvider,
  openAiProvider,
  azureProvider,
  googleProvider,
  cartesiaProvider,
  deepgramProvider,
  playHtProvider,
  humeProvider,
};

/** Every bundled provider, in default routing preference order. */
export const allProviders: ProviderDefinition[] = [
  elevenLabsProvider,
  fishAudioProvider,
  openAiProvider,
  minimaxProvider,
  cartesiaProvider,
  azureProvider,
  googleProvider,
  deepgramProvider,
  playHtProvider,
  humeProvider,
];
