/**
 * Voice-agent pipeline contract: audio transport -> VAD -> STT -> LLM -> sentence
 * chunker -> TTS -> transport, with barge-in. Everything heavy (VAD model,
 * semantic end-of-turn detector, transport) is injected through interfaces so the
 * package keeps zero runtime dependencies.
 */
import type { AudioFormat, EngineVoiceId, VoiceEngine, VoiceRef, VoiceSettings } from "../core/types.js";
import type { LlmEngine, LlmMessage, LlmProviderId, LlmTool, LlmToolCall } from "../llm/types.js";
import type { SttEngine, SttProviderId, SttStreamConfig } from "../stt/types.js";

export type AgentAudioEncoding = "pcm16" | "mulaw" | "alaw";

export interface AgentAudioFrame {
  data: Uint8Array;
  encoding: AgentAudioEncoding;
  sampleRate: number;
  channels: 1;
  /** Monotonic capture timestamp (ms) when known. */
  timestampMs?: number;
}

// ---------------------------------------------------------------------------
// Injectable building blocks
// ---------------------------------------------------------------------------

export interface VoiceActivityDetector {
  /** Feed one PCM16 frame (any size >= 10 ms); returns speech probability 0..1. */
  process(frame: AgentAudioFrame): { probability: number; isSpeech: boolean };
  reset(): void;
}

export interface EndOfTurnDetector {
  /** Decide whether the user finished speaking given the transcript so far and trailing silence. */
  analyze(input: { transcript: string; silenceMs: number; language?: string; history?: LlmMessage[] }): Promise<{ endOfTurn: boolean; confidence: number }>;
}

/** Bidirectional audio channel: telephony (Twilio Media Streams), browser WebSocket, tests… */
export interface AgentTransport {
  /** Format of `inbound` frames. */
  readonly inputFormat: { encoding: AgentAudioEncoding; sampleRate: number };
  /** Format the transport expects in `sendAudio`. */
  readonly outputFormat: { encoding: AgentAudioEncoding; sampleRate: number };
  /** Caller audio; ends when the call/session ends. */
  readonly inbound: AsyncIterable<AgentAudioFrame>;
  sendAudio(frame: AgentAudioFrame): void;
  /** Drop any audio already queued for playback (barge-in). */
  clearPlayback(): void;
  /** Ask the transport to call back when everything sent before this mark has been played. */
  mark?(name: string): void;
  onMark?(listener: (name: string) => void): () => void;
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export type AgentToolHandler = (call: LlmToolCall) => Promise<string | { content: string; isError?: boolean }>;

export interface VoiceAgentConfig {
  /** Greeting spoken when the session starts. */
  greeting?: string;
  stt: {
    provider?: SttProviderId;
    model?: string;
    language?: string;
    keywords?: SttStreamConfig["keywords"];
    /** Use provider-side endpointing/semantic end-of-turn when available (default true). */
    useProviderEndpointing?: boolean;
    endpointingMs?: number;
  };
  llm: {
    provider?: LlmProviderId;
    model?: string;
    system: string;
    tools?: LlmTool[];
    toolHandler?: AgentToolHandler;
    temperature?: number;
    maxTokens?: number;
    /** Keep the last N messages (plus system) in the prompt. */
    maxHistoryMessages?: number;
    reasoning?: "off" | "low";
    /** Abort and retry on the next provider when no token arrives within this budget. */
    firstTokenTimeoutMs?: number;
  };
  tts: {
    voice: VoiceRef | EngineVoiceId;
    model?: string;
    language?: string;
    settings?: VoiceSettings;
    /** Output format requested from TTS; the pipeline transcodes to the transport format when needed. */
    format?: AudioFormat;
  };
  turn: {
    /** Silence after final transcript before the turn is considered over when no other signal exists. */
    silenceEndpointMs: number;
    /** Allow the user to interrupt the agent. */
    bargeIn: boolean;
    /** Minimum continuous user speech to count as an interruption. */
    bargeInMinSpeechMs: number;
    /** Flush the first TTS chunk after this long even if no sentence boundary arrived. */
    firstChunkFlushMs: number;
    /** Minimum words in a clause before flushing at a comma. */
    minClauseWords: number;
  };
  vad?: VoiceActivityDetector;
  endOfTurn?: EndOfTurnDetector;
}

export interface VoiceAgentDependencies {
  stt: SttEngine;
  llm: LlmEngine;
  tts: VoiceEngine;
  transport: AgentTransport;
  now?: () => number;
}

// ---------------------------------------------------------------------------
// Events & control
// ---------------------------------------------------------------------------

export type AgentState = "idle" | "listening" | "user_speaking" | "thinking" | "speaking" | "interrupted" | "ended";

export interface TurnMetrics {
  turnId: number;
  /** Last user audio -> end-of-turn decision. */
  endOfTurnMs?: number;
  /** End-of-turn -> final transcript available. */
  sttFinalMs?: number;
  llmTtftMs?: number;
  ttsFirstByteMs?: number;
  /** End-of-turn -> first audio frame sent to the transport. */
  firstAudioMs?: number;
  interrupted: boolean;
  llmProvider?: LlmProviderId;
  ttsProvider?: string;
  sttProvider?: SttProviderId;
}

export type AgentEvent =
  | { type: "state"; state: AgentState; turnId: number }
  | { type: "user_interim"; text: string; turnId: number }
  | { type: "user_final"; text: string; turnId: number }
  | { type: "assistant_text"; text: string; turnId: number; final: boolean }
  | { type: "tool_call"; call: LlmToolCall; turnId: number }
  | { type: "tool_result"; callId: string; content: string; isError: boolean; turnId: number }
  | { type: "interrupted"; turnId: number; spokenText: string }
  | { type: "metrics"; metrics: TurnMetrics }
  | { type: "error"; error: unknown; turnId: number; recoverable: boolean }
  | { type: "ended"; reason: "transport_closed" | "stopped" | "error" };

export interface VoiceAgent {
  readonly state: AgentState;
  /** Conversation so far (system excluded); assistant messages are truncated to what was actually spoken on barge-in. */
  readonly history: readonly LlmMessage[];
  /** Start consuming transport audio; resolves when the session ends. */
  run(): Promise<void>;
  /** Single-consumer event stream. */
  readonly events: AsyncIterable<AgentEvent>;
  /** Speak arbitrary text now (cancels current speech). */
  say(text: string): Promise<void>;
  /** Inject a user turn as if it had been transcribed. */
  injectUser(text: string): Promise<void>;
  interrupt(): void;
  stop(reason?: string): Promise<void>;
}

export type CreateVoiceAgent = (dependencies: VoiceAgentDependencies, config: VoiceAgentConfig) => VoiceAgent;
