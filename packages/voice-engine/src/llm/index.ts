import type { LlmProviderDefinition } from "./types.js";
import { openAiCompatibleProviders } from "./providers/openai-compatible/index.js";
import { anthropicLlmProvider } from "./providers/anthropic/index.js";
import { geminiLlmProvider } from "./providers/gemini/index.js";

export * from "./types.js";
export * from "./engine.js";
export * from "./providers/openai-compatible/index.js";
export { anthropicLlmProvider, geminiLlmProvider };

/**
 * Every bundled LLM provider: native Anthropic and Gemini adapters plus the shared
 * OpenAI-compatible adapter instantiated per provider preset (openai, groq, cerebras…).
 */
export const allLlmProviders: LlmProviderDefinition[] = [
  anthropicLlmProvider,
  ...openAiCompatibleProviders.filter((p) => p.id === "openai"),
  geminiLlmProvider,
  ...openAiCompatibleProviders.filter((p) => p.id !== "openai"),
];
