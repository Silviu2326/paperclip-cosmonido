/**
 * LLM contract: one provider-neutral chat interface covering OpenAI-compatible,
 * Anthropic-native and Gemini-native wire formats. Built for low-latency voice
 * agents (streaming deltas, tool calls, TTFT metrics, usage). Dependency-free.
 */
import type { CredentialResolver, Logger, ModelTier, ProviderContext } from "../core/types.js";

export type LlmProviderId =
  | "anthropic"
  | "openai"
  | "gemini"
  | "cerebras"
  | "groq"
  | "sambanova"
  | "fireworks"
  | "together"
  | "deepinfra"
  | "baseten"
  | "hyperbolic"
  | "nebius"
  | "nvidia-nim"
  | "mistral"
  | "xai"
  | "deepseek"
  | "qwen"
  | "kimi"
  | "glm"
  | "minimax"
  | "cohere"
  | "openrouter"
  | "vercel-ai-gateway"
  | "cloudflare-ai-gateway"
  | "litellm"
  | "ollama"
  | "lmstudio"
  | "vllm"
  | (string & {});

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export type LlmContentPart =
  | { type: "text"; text: string }
  | { type: "image"; mimeType: string; data?: Uint8Array; url?: string }
  | { type: "audio"; mimeType: string; data: Uint8Array }
  | { type: "tool_call"; id: string; name: string; arguments: Record<string, unknown> }
  | { type: "tool_result"; toolCallId: string; content: string; isError?: boolean };

export interface LlmMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | LlmContentPart[];
  /** Optional participant name. */
  name?: string;
  /** Hint to place a prompt-cache breakpoint after this message (Anthropic/Gemini; ignored elsewhere). */
  cache?: boolean;
}

export interface LlmTool {
  name: string;
  description: string;
  /** JSON Schema (draft 2020-12 subset: object with properties/required). */
  inputSchema: Record<string, unknown>;
  strict?: boolean;
}

export type LlmToolChoice = "auto" | "none" | "required" | { name: string };

export type LlmResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; name: string; schema: Record<string, unknown>; strict?: boolean };

export interface LlmRequest {
  messages: LlmMessage[];
  /** Provider model id; engine picks a default per provider/tier if omitted. */
  model?: string;
  tier?: ModelTier;
  /** Convenience system prompt prepended as a system message. */
  system?: string;
  tools?: LlmTool[];
  toolChoice?: LlmToolChoice;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  stop?: string[];
  seed?: number;
  responseFormat?: LlmResponseFormat;
  /** Reasoning/thinking effort; "off" requests the fastest non-reasoning path where supported. */
  reasoning?: { effort: "off" | "low" | "medium" | "high"; budgetTokens?: number };
  /** Caller metadata for logging (never sent to the provider unless the provider supports `user`/metadata). */
  metadata?: Record<string, string>;
  signal?: AbortSignal;
  /** Escape hatch merged into the provider request body. */
  providerOptions?: Record<string, unknown>;
}

export interface LlmToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type LlmFinishReason = "stop" | "length" | "tool_calls" | "content_filter" | "error" | "other";

export interface LlmUsage {
  provider: LlmProviderId;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  /** USD cents, null when the model price is unknown. */
  estimatedCents: number | null;
  pricingSource: string;
  requestId?: string;
}

export interface LlmResult {
  /** Assistant message, ready to append to the conversation (text and/or tool_call parts). */
  message: LlmMessage;
  text: string;
  toolCalls: LlmToolCall[];
  finishReason: LlmFinishReason;
  usage: LlmUsage;
  provider: LlmProviderId;
  model: string;
  /** Total wall time. */
  latencyMs: number;
  /** Time to first token/delta when streamed (undefined for non-streaming). */
  ttftMs?: number;
  requestId?: string;
  raw?: unknown;
}

export type LlmStreamEvent =
  | { type: "start"; model: string; requestId?: string }
  | { type: "text_delta"; text: string }
  | { type: "reasoning_delta"; text: string }
  | { type: "tool_call_start"; index: number; id: string; name: string }
  | { type: "tool_call_delta"; index: number; argumentsDelta: string }
  | { type: "tool_call_end"; index: number; call: LlmToolCall }
  | { type: "usage"; usage: LlmUsage }
  /** Always the last event on success; carries the fully assembled result. */
  | { type: "done"; result: LlmResult };

// ---------------------------------------------------------------------------
// Models & providers
// ---------------------------------------------------------------------------

export interface LlmModelDescriptor {
  provider: LlmProviderId;
  id: string;
  name: string;
  tier: ModelTier;
  contextWindow?: number;
  maxOutputTokens?: number;
  supportsTools: boolean;
  supportsStreaming: boolean;
  supportsJsonSchema: boolean;
  supportsVision: boolean;
  supportsAudioInput: boolean;
  supportsPromptCaching: boolean;
  supportsReasoning: boolean;
  latencyClass: "ultra_fast" | "fast" | "standard" | "slow";
  usdPerMillionInput?: number;
  usdPerMillionOutput?: number;
  usdPerMillionCachedInput?: number;
  /** Source and date of pricing/limits. */
  notes?: string;
}

export interface LlmCapabilities {
  streaming: boolean;
  tools: boolean;
  jsonSchema: boolean;
  vision: boolean;
  audioInput: boolean;
  promptCaching: boolean;
  reasoning: boolean;
  /** Wire format family, informational. */
  wireFormat: "openai-chat" | "openai-responses" | "anthropic-messages" | "gemini-native";
}

export interface LlmProvider {
  readonly id: LlmProviderId;
  readonly name: string;
  readonly capabilities: LlmCapabilities;

  listModels(): Promise<LlmModelDescriptor[]>;
  /** Default model per tier; "fast" is the voice-agent default. */
  defaultModel(options?: { tier?: ModelTier }): string;

  complete(request: LlmRequest): Promise<LlmResult>;
  /** Yields deltas and ends with `done`. Honors `request.signal` for mid-stream cancellation. */
  stream(request: LlmRequest): AsyncIterable<LlmStreamEvent>;
  healthcheck?(signal?: AbortSignal): Promise<{ ok: boolean; detail?: string }>;
}

export interface LlmProviderDefinition {
  id: LlmProviderId;
  name: string;
  docsUrl: string;
  /** Credential field -> env var names, in priority order (apiKey, baseUrl, project…). */
  credentialEnv: Record<string, string[]>;
  /** Local servers (ollama, lmstudio, vllm) require none. */
  requiredCredentials: string[];
  create(context: ProviderContext): LlmProvider;
}

export interface LlmRoutingPolicy {
  /** Ordered preference; first available wins. */
  preferred?: LlmProviderId[];
  /** Fall back to the next provider on retryable failure or `firstTokenTimeoutMs`. */
  fallback?: boolean;
  /** Abort and fall back when no first delta arrives within this time (voice latency guard). */
  firstTokenTimeoutMs?: number;
  tier?: ModelTier;
}

export type LlmEngineEvent =
  | { type: "llm.start"; provider: LlmProviderId; model: string; requestId: string }
  | { type: "llm.first_token"; provider: LlmProviderId; model: string; ttftMs: number; requestId: string }
  | { type: "llm.complete"; provider: LlmProviderId; model: string; result: LlmResult; requestId: string }
  | { type: "llm.error"; provider: LlmProviderId; error: unknown; requestId: string; willFallback: boolean }
  | { type: "llm.usage"; usage: LlmUsage; scope?: { companyId?: string; agentId?: string } };

export interface LlmEngineOptions {
  providers?: LlmProviderDefinition[];
  credentials?: CredentialResolver;
  fetch?: typeof fetch;
  routing?: LlmRoutingPolicy;
  logger?: Logger;
  timeoutMs?: number;
  retry?: { attempts: number; baseDelayMs: number; maxDelayMs: number };
  scope?: { companyId?: string; agentId?: string };
}

export interface LlmEngine {
  provider(id: LlmProviderId): Promise<LlmProvider>;
  providers(): LlmProviderDefinition[];
  availableProviders(): Promise<LlmProviderId[]>;
  listModels(provider?: LlmProviderId): Promise<LlmModelDescriptor[]>;
  complete(request: LlmRequest & { provider?: LlmProviderId }): Promise<LlmResult>;
  stream(request: LlmRequest & { provider?: LlmProviderId }): AsyncIterable<LlmStreamEvent>;
  /** Run the tool loop: call model, execute tool calls via `handler`, repeat until no tool calls or `maxSteps`. */
  run(
    request: LlmRequest & { provider?: LlmProviderId },
    handler: (call: LlmToolCall) => Promise<string | { content: string; isError?: boolean }>,
    options?: { maxSteps?: number },
  ): Promise<LlmResult & { steps: LlmResult[] }>;
  estimateCost(options: { provider: LlmProviderId; model?: string; inputTokens: number; outputTokens: number }): Promise<LlmUsage>;
  on(listener: (event: LlmEngineEvent) => void): () => void;
}
