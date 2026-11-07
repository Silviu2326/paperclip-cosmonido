import type { RealtimeProviderDefinition } from "./types.js";
import { openAiRealtimeProvider } from "./providers/openai/index.js";
import { geminiLiveProvider } from "./providers/gemini/index.js";

export * from "./types.js";
export { openAiRealtimeProvider, geminiLiveProvider };

export const allRealtimeProviders: RealtimeProviderDefinition[] = [openAiRealtimeProvider, geminiLiveProvider];
