/**
 * Speech-to-speech realtime APIs (OpenAI Realtime, Gemini Live…): one WebSocket
 * session that takes audio in and returns audio out, with tool calling.
 * Unlike the STT->LLM->TTS pipeline in ../agent, the provider owns the whole loop.
 */
import type { LanguageTag, ProviderContext, WebSocketFactory } from "../core/types.js";
import type { LlmTool, LlmToolCall } from "../llm/types.js";

export type RealtimeProviderId = "openai" | "gemini" | (string & {});

export interface RealtimeAudioFormat {
  encoding: "pcm16" | "mulaw" | "alaw";
  sampleRate: number;
}

export interface RealtimeSessionConfig {
  model?: string;
  instructions: string;
  /** Provider voice name (e.g. OpenAI "marin", Gemini "Puck"). */
  voice?: string;
  language?: LanguageTag;
  inputFormat: RealtimeAudioFormat;
  outputFormat: RealtimeAudioFormat;
  tools?: LlmTool[];
  temperature?: number;
  /** Server-side VAD / turn detection. */
  turnDetection?: { mode: "server_vad" | "semantic_vad" | "manual"; silenceMs?: number; threshold?: number; interruptResponse?: boolean };
  /** Emit input transcription events when supported. */
  inputTranscription?: boolean;
  signal?: AbortSignal;
  providerOptions?: Record<string, unknown>;
}

export type RealtimeEvent =
  | { type: "open"; sessionId?: string }
  | { type: "audio"; data: Uint8Array; format: RealtimeAudioFormat; responseId?: string }
  | { type: "user_transcript"; text: string; final: boolean }
  | { type: "assistant_transcript"; text: string; final: boolean; responseId?: string }
  | { type: "speech_started" }
  | { type: "speech_stopped" }
  /** The model was interrupted; `playedMs` is how much audio had been played when known. */
  | { type: "interrupted"; responseId?: string; playedMs?: number }
  | { type: "tool_call"; call: LlmToolCall }
  | { type: "response_done"; responseId?: string; usage?: { inputTokens: number; outputTokens: number; audioInputTokens?: number; audioOutputTokens?: number } }
  | { type: "error"; error: unknown }
  | { type: "close"; code?: number; reason?: string };

export interface RealtimeSession {
  sendAudio(chunk: Uint8Array): void;
  sendText(text: string, options?: { respond?: boolean }): void;
  /** Answer a tool call emitted by the model. */
  sendToolResult(callId: string, content: string, isError?: boolean): void;
  /** Cancel the in-flight response; `playedMs` lets the provider truncate history to what was heard. */
  interrupt(options?: { playedMs?: number }): void;
  /** Commit buffered input and request a response (manual turn detection). */
  commit(): void;
  close(): Promise<void>;
  readonly events: AsyncIterable<RealtimeEvent>;
}

export interface RealtimeProvider {
  readonly id: RealtimeProviderId;
  readonly name: string;
  readonly models: string[];
  connect(config: RealtimeSessionConfig): Promise<RealtimeSession>;
}

export interface RealtimeProviderContext extends ProviderContext {
  webSocket?: WebSocketFactory;
}

export interface RealtimeProviderDefinition {
  id: RealtimeProviderId;
  name: string;
  docsUrl: string;
  credentialEnv: Record<string, string[]>;
  requiredCredentials: string[];
  create(context: RealtimeProviderContext): RealtimeProvider;
}
