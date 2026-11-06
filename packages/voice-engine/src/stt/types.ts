/**
 * Speech-to-text contract. Mirrors the TTS contract in ../core/types.ts:
 * providers are plain objects, optional capabilities are optional methods,
 * credentials/usage/events are injectable. Dependency-free.
 */
import type {
  AudioInput,
  CredentialResolver,
  LanguageTag,
  Logger,
  ModelTier,
  ProviderContext,
  WebSocketFactory,
} from "../core/types.js";

export type SttProviderId =
  | "deepgram"
  | "elevenlabs"
  | "openai"
  | "groq"
  | "assemblyai"
  | "soniox"
  | "speechmatics"
  | "gladia"
  | "mistral"
  | "google"
  | "azure"
  | "fish-audio"
  | "rev"
  | (string & {});

// ---------------------------------------------------------------------------
// Models & capabilities
// ---------------------------------------------------------------------------

export interface SttModelDescriptor {
  provider: SttProviderId;
  /** Provider model id, e.g. "nova-3", "scribe_v2", "gpt-transcribe". */
  id: string;
  name: string;
  tier: ModelTier;
  /** BCP-47 or 2-letter. Empty = many/unknown. */
  languages: LanguageTag[];
  latency: "realtime" | "low" | "standard" | "batch";
  supportsBatch: boolean;
  supportsStreaming: boolean;
  supportsWordTimestamps: boolean;
  supportsDiarization: boolean;
  supportsLanguageDetection: boolean;
  supportsKeywords: boolean;
  supportsTranslation: boolean;
  /** Provider-side end-of-turn / semantic endpointing in streaming mode. */
  supportsEndOfTurn: boolean;
  maxAudioSeconds?: number;
  maxFileBytes?: number;
  /** USD per audio hour when publicly known. */
  usdPerHour?: number;
  /** Where the price came from and its date. */
  notes?: string;
}

export interface SttCapabilities {
  batch: boolean;
  streaming: boolean;
  wordTimestamps: boolean;
  diarization: boolean;
  languageDetection: boolean;
  keywords: boolean;
  translation: boolean;
  endOfTurn: boolean;
  /** Input containers accepted for batch uploads. */
  inputFormats: string[];
  /** Streaming encodings accepted. */
  streamEncodings: SttEncoding[];
  languages: LanguageTag[];
  maxFileBytes?: number;
}

export type SttEncoding = "pcm16" | "mulaw" | "alaw" | "opus" | "flac" | "mp3" | "ogg";

// ---------------------------------------------------------------------------
// Batch transcription
// ---------------------------------------------------------------------------

export interface TranscriptionRequest {
  /** Audio bytes, or a URL the provider can fetch (providers that do not support URLs download it first). */
  audio: AudioInput | { url: string };
  model?: string;
  /** BCP-47/2-letter; omit or "auto" for detection. */
  language?: LanguageTag | "auto";
  /** Candidate languages for detection / code-switching. */
  languageHints?: LanguageTag[];
  wordTimestamps?: boolean;
  diarization?: { enabled: boolean; minSpeakers?: number; maxSpeakers?: number };
  punctuation?: boolean;
  /** Numbers, dates, currencies formatting ("smart format"). */
  formatting?: boolean;
  /** Custom vocabulary / boosted terms. */
  keywords?: Array<string | { term: string; boost?: number }>;
  profanityFilter?: boolean;
  /** Translate transcript to this language when the provider supports it. */
  translateTo?: LanguageTag;
  /** Free-form context prompt (Whisper-style) when supported. */
  prompt?: string;
  idempotencyKey?: string;
  signal?: AbortSignal;
  providerOptions?: Record<string, unknown>;
}

export interface TranscriptWord {
  text: string;
  startMs: number;
  endMs: number;
  confidence?: number;
  speaker?: string;
}

export interface TranscriptSegment {
  text: string;
  startMs: number;
  endMs: number;
  speaker?: string;
  language?: LanguageTag;
  confidence?: number;
  words?: TranscriptWord[];
}

export interface SttUsageRecord {
  provider: SttProviderId;
  model?: string;
  operation: "transcribe" | "stream";
  unit: "second" | "request" | "token";
  units: number;
  /** USD cents, null when the plan makes pricing unknowable. */
  estimatedCents: number | null;
  pricingSource: string;
  requestId?: string;
}

export interface TranscriptionResult {
  text: string;
  language?: LanguageTag;
  languageConfidence?: number;
  words?: TranscriptWord[];
  segments?: TranscriptSegment[];
  /** Audio duration when reported or derivable. */
  durationMs?: number;
  provider: SttProviderId;
  model: string;
  usage: SttUsageRecord;
  requestId?: string;
  latencyMs: number;
  /** Provider response preserved for debugging (no secrets). */
  raw?: unknown;
}

// ---------------------------------------------------------------------------
// Streaming transcription
// ---------------------------------------------------------------------------

export interface SttStreamConfig {
  model?: string;
  language?: LanguageTag | "auto";
  languageHints?: LanguageTag[];
  /** Encoding of the PCM/compressed audio chunks passed to `send`. */
  encoding: SttEncoding;
  /** Hz (8000 for telephony mulaw, 16000 typical). */
  sampleRate: number;
  channels?: 1 | 2;
  interimResults?: boolean;
  /** Silence (ms) after which the provider finalizes an utterance. */
  endpointingMs?: number;
  wordTimestamps?: boolean;
  punctuation?: boolean;
  formatting?: boolean;
  diarization?: boolean;
  keywords?: Array<string | { term: string; boost?: number }>;
  /** Ask the provider for semantic end-of-turn events when supported. */
  endOfTurn?: boolean;
  signal?: AbortSignal;
  providerOptions?: Record<string, unknown>;
}

export type SttStreamEvent =
  | { type: "open"; sessionId?: string }
  /** Partial hypothesis; may be revised. */
  | { type: "interim"; text: string; words?: TranscriptWord[]; startMs?: number; endMs?: number; stability?: number }
  /** Committed text for an utterance/segment; will not change. */
  | { type: "final"; text: string; words?: TranscriptWord[]; speaker?: string; language?: LanguageTag; confidence?: number; startMs?: number; endMs?: number }
  /** Provider VAD detected the start of speech. */
  | { type: "speech_started"; atMs?: number }
  /** Provider decided the speaker's turn is over (endpointing or semantic). */
  | { type: "end_of_turn"; text?: string; confidence?: number; reason: "silence" | "semantic" | "provider" }
  | { type: "metadata"; data: Record<string, unknown> }
  | { type: "error"; error: unknown }
  | { type: "close"; code?: number; reason?: string };

export interface SttStream {
  /** Push an audio chunk (raw encoded bytes per `SttStreamConfig.encoding`). Non-blocking. */
  send(chunk: Uint8Array): void;
  /** Ask the provider to flush pending audio into a final result. */
  finalize(): void;
  /** Keep the connection alive during silence when the provider requires it. */
  keepAlive?(): void;
  /** Gracefully close; resolves when the provider socket is closed. */
  close(): Promise<void>;
  /** Single-consumer event stream; ends after `close`. */
  readonly events: AsyncIterable<SttStreamEvent>;
}

// ---------------------------------------------------------------------------
// Provider & engine
// ---------------------------------------------------------------------------

export interface SttProviderContext extends ProviderContext {
  webSocket?: WebSocketFactory;
}

export interface SttProvider {
  readonly id: SttProviderId;
  readonly name: string;
  readonly capabilities: SttCapabilities;

  listModels(): Promise<SttModelDescriptor[]>;
  defaultModel(options?: { language?: LanguageTag; tier?: ModelTier; streaming?: boolean }): string;

  transcribe(request: TranscriptionRequest): Promise<TranscriptionResult>;
  openStream?(config: SttStreamConfig): Promise<SttStream>;
  healthcheck?(signal?: AbortSignal): Promise<{ ok: boolean; detail?: string }>;
}

export interface SttProviderDefinition {
  id: SttProviderId;
  name: string;
  docsUrl: string;
  /** Credential field -> env var names, in priority order. */
  credentialEnv: Record<string, string[]>;
  requiredCredentials: string[];
  create(context: SttProviderContext): SttProvider;
}

export interface SttRoutingPolicy {
  preferred?: SttProviderId[];
  fallback?: boolean;
  tier?: ModelTier;
  byLanguage?: Record<LanguageTag, SttProviderId[]>;
}

export type SttEngineEvent =
  | { type: "stt.start"; provider: SttProviderId; model: string; requestId: string }
  | { type: "stt.complete"; provider: SttProviderId; model: string; result: TranscriptionResult; requestId: string }
  | { type: "stt.error"; provider: SttProviderId; error: unknown; requestId: string; willFallback: boolean }
  | { type: "stt.usage"; usage: SttUsageRecord; scope?: { companyId?: string; agentId?: string } };

export interface SttEngineOptions {
  providers?: SttProviderDefinition[];
  credentials?: CredentialResolver;
  fetch?: typeof fetch;
  webSocket?: WebSocketFactory;
  routing?: SttRoutingPolicy;
  logger?: Logger;
  timeoutMs?: number;
  retry?: { attempts: number; baseDelayMs: number; maxDelayMs: number };
  scope?: { companyId?: string; agentId?: string };
}

export interface SttEngine {
  provider(id: SttProviderId): Promise<SttProvider>;
  providers(): SttProviderDefinition[];
  availableProviders(): Promise<SttProviderId[]>;
  listModels(provider?: SttProviderId): Promise<SttModelDescriptor[]>;
  /** Routes by language/policy and falls back on retryable failures when enabled. */
  transcribe(request: TranscriptionRequest & { provider?: SttProviderId }): Promise<TranscriptionResult>;
  openStream(config: SttStreamConfig & { provider?: SttProviderId }): Promise<SttStream>;
  estimateCost(options: { provider: SttProviderId; model?: string; durationSeconds: number }): Promise<SttUsageRecord>;
  on(listener: (event: SttEngineEvent) => void): () => void;
}
