/**
 * @paperclipai/voice-engine — shared contract.
 *
 * This file is the single source of truth for the engine's public types. Every
 * provider adapter, the engine facade, the CLI and the future Paperclip
 * integration layer build on these shapes. Keep it dependency-free.
 *
 * Design rules:
 *  - The engine is standalone: no imports from server/, ui/ or other packages.
 *  - Providers are plain objects implementing `VoiceProvider`; optional
 *    capabilities are optional methods, declared in `capabilities`.
 *  - Everything that may later be wired into Paperclip (credentials, storage,
 *    usage/cost records, events) goes through injectable interfaces.
 */

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

export type ProviderId =
  | "elevenlabs"
  | "fish-audio"
  | "openai"
  | "azure"
  | "google"
  | "minimax"
  | "cartesia"
  | "deepgram"
  | "playht"
  | "hume"
  | (string & {});

/** BCP-47 language tag, e.g. "es-ES", "en-US", "pt-BR", "ja". */
export type LanguageTag = string;

/** Engine-wide voice id: `${providerId}:${providerVoiceId}`. */
export type EngineVoiceId = `${string}:${string}`;

export interface VoiceRef {
  provider: ProviderId;
  voiceId: string;
}

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------

export type AudioContainer = "mp3" | "wav" | "pcm" | "opus" | "ogg" | "flac" | "aac" | "mulaw" | "alaw";

export interface AudioFormat {
  container: AudioContainer;
  /** Hz. Common: 8000, 16000, 22050, 24000, 44100, 48000. */
  sampleRate?: number;
  /** kbps, only for lossy containers. */
  bitrate?: number;
  channels?: 1 | 2;
  /** PCM bit depth, only for pcm/wav. */
  bitDepth?: 16 | 24 | 32;
}

export interface AudioInput {
  /** Raw audio bytes (wav/mp3/…); the provider decides what it accepts. */
  data: Uint8Array;
  mimeType: string;
  fileName?: string;
}

export interface AudioOutput {
  data: Uint8Array;
  mimeType: string;
  format: AudioFormat;
  durationMs?: number;
}

// ---------------------------------------------------------------------------
// Voices
// ---------------------------------------------------------------------------

export type VoiceGender = "male" | "female" | "neutral" | "unknown";
export type VoiceAge = "child" | "young" | "middle_aged" | "old" | "unknown";
export type VoiceOrigin = "premade" | "cloned" | "designed" | "professional_clone" | "community" | "custom";

export interface VoiceDescriptor {
  /** `${provider}:${providerVoiceId}` */
  id: EngineVoiceId;
  provider: ProviderId;
  providerVoiceId: string;
  name: string;
  description?: string;
  /** Languages the voice is known to speak well (BCP-47). Empty = multilingual/unknown. */
  languages: LanguageTag[];
  gender: VoiceGender;
  age: VoiceAge;
  accent?: string;
  /** Free-form tags: "narration", "conversational", "news", "ads", "characters", "asmr"… */
  tags: string[];
  origin: VoiceOrigin;
  previewUrl?: string;
  /** Models this voice can be used with (provider model ids). Empty = all. */
  models: string[];
  /** Provider-specific extras preserved verbatim. */
  raw?: Record<string, unknown>;
}

export interface VoiceQuery {
  provider?: ProviderId | ProviderId[];
  language?: LanguageTag;
  gender?: VoiceGender;
  age?: VoiceAge;
  tags?: string[];
  origin?: VoiceOrigin | VoiceOrigin[];
  /** Case-insensitive substring over name/description/tags. */
  search?: string;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

export type ModelTier = "flagship" | "balanced" | "fast" | "legacy";

export interface ModelDescriptor {
  provider: ProviderId;
  /** Provider model id, e.g. "eleven_v3", "speech-1.6", "gpt-4o-mini-tts". */
  id: string;
  name: string;
  tier: ModelTier;
  /** Supported languages (BCP-47 or 2-letter). Empty = unknown/many. */
  languages: LanguageTag[];
  /** Approximate end-to-end latency class. */
  latency: "realtime" | "low" | "standard" | "batch";
  supportsStreaming: boolean;
  supportsTimestamps: boolean;
  supportsSsml: boolean;
  supportsEmotionTags: boolean;
  maxInputChars?: number;
  /** USD per 1M characters when publicly known; undefined = plan dependent. */
  usdPerMillionChars?: number;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Synthesis
// ---------------------------------------------------------------------------

export interface VoiceSettings {
  /** 0.25–4.0, 1 = normal. */
  speed?: number;
  /** 0–1 (ElevenLabs stability, Fish temperature inverse…). */
  stability?: number;
  /** 0–1 similarity to the reference voice. */
  similarity?: number;
  /** 0–1 style exaggeration / expressiveness. */
  style?: number;
  /** Semitones, -12..12. */
  pitch?: number;
  /** dB gain, -20..20. */
  volume?: number;
  /** Named emotion hint, e.g. "happy", "sad", "angry", "whisper", "excited". */
  emotion?: string;
  /** Provider-side speaker boost / enhancement. */
  speakerBoost?: boolean;
  /** Deterministic seed when the provider supports it. */
  seed?: number;
}

export interface PronunciationRule {
  /** Text as written. */
  grapheme: string;
  /** IPA or provider alphabet string. */
  phoneme?: string;
  /** Replacement text (alias) when phonemes are unsupported. */
  alias?: string;
  alphabet?: "ipa" | "cmu" | "x-sampa";
}

export interface SynthesisRequest {
  text: string;
  voice: VoiceRef | EngineVoiceId;
  /** Provider model id; engine picks a default per provider/language if omitted. */
  model?: string;
  language?: LanguageTag;
  format?: AudioFormat;
  settings?: VoiceSettings;
  /** Text is SSML (provider must support it, otherwise it is stripped). */
  ssml?: boolean;
  pronunciation?: PronunciationRule[];
  /** Ask for word/character timestamps when supported. */
  timestamps?: boolean;
  /** Previous/next text for prosody continuity across chunks. */
  context?: { previousText?: string; nextText?: string };
  /** Caller-defined key used for caching and idempotent provider calls. */
  idempotencyKey?: string;
  signal?: AbortSignal;
  /** Escape hatch: merged into the provider request body. */
  providerOptions?: Record<string, unknown>;
}

export interface WordTimestamp {
  text: string;
  startMs: number;
  endMs: number;
}

export interface UsageRecord {
  provider: ProviderId;
  model?: string;
  operation: OperationKind;
  /** Billing unit used by the provider. */
  unit: "character" | "second" | "request" | "byte" | "credit";
  units: number;
  /** Estimated cost in USD cents, null when the plan makes pricing unknowable. */
  estimatedCents: number | null;
  pricingSource: string;
  requestId?: string;
}

export interface SynthesisResult {
  audio: AudioOutput;
  voice: VoiceRef;
  model: string;
  provider: ProviderId;
  language?: LanguageTag;
  timestamps?: WordTimestamp[];
  usage: UsageRecord;
  /** True when served from the engine cache. */
  cached: boolean;
  latencyMs: number;
  requestId?: string;
}

export interface SynthesisChunk {
  audio: Uint8Array;
  /** Timestamps for the words contained in this chunk, when supported. */
  timestamps?: WordTimestamp[];
  /** Normalized/aligned text this chunk corresponds to, when known. */
  text?: string;
}

// ---------------------------------------------------------------------------
// Cloning / design / speech-to-speech
// ---------------------------------------------------------------------------

export type CloneMode = "instant" | "professional";

export interface CloneVoiceRequest {
  name: string;
  description?: string;
  samples: AudioInput[];
  mode?: CloneMode;
  /** Primary language of the samples. */
  language?: LanguageTag;
  labels?: Record<string, string>;
  /** Remove background noise before cloning when supported. */
  denoise?: boolean;
  /** Caller attests consent of the voice owner (stored in labels/raw by providers that require it). */
  consent?: { attested: boolean; text?: string };
  signal?: AbortSignal;
  providerOptions?: Record<string, unknown>;
}

export interface CloneVoiceResult {
  voice: VoiceDescriptor;
  /** Professional clones train asynchronously; poll `getVoice`. */
  status: "ready" | "training" | "pending_verification";
  jobId?: string;
  usage?: UsageRecord;
}

export interface DesignVoiceRequest {
  /** Natural-language description: "warm Castilian Spanish female narrator, 40s, calm". */
  prompt: string;
  /** Sample text to preview with. */
  text?: string;
  language?: LanguageTag;
  gender?: VoiceGender;
  age?: VoiceAge;
  accent?: string;
  /** Number of candidate previews to return. */
  candidates?: number;
  signal?: AbortSignal;
  providerOptions?: Record<string, unknown>;
}

export interface DesignVoiceCandidate {
  /** Provider token needed to persist this candidate. */
  candidateId: string;
  preview: AudioOutput;
  description?: string;
}

export interface DesignVoiceResult {
  candidates: DesignVoiceCandidate[];
  usage?: UsageRecord;
}

export interface SpeechToSpeechRequest {
  audio: AudioInput;
  voice: VoiceRef | EngineVoiceId;
  model?: string;
  /** Keep the original's background sounds when supported. */
  preserveBackground?: boolean;
  settings?: VoiceSettings;
  format?: AudioFormat;
  signal?: AbortSignal;
  providerOptions?: Record<string, unknown>;
}

export interface UpdateVoiceRequest {
  name?: string;
  description?: string;
  labels?: Record<string, string>;
  /** Additional samples to improve a clone (adaptation). */
  addSamples?: AudioInput[];
  removeSampleIds?: string[];
  signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// Provider capabilities & interface
// ---------------------------------------------------------------------------

export type OperationKind =
  | "synthesize"
  | "synthesize_stream"
  | "clone"
  | "design"
  | "speech_to_speech"
  | "list_voices"
  | "list_models"
  | "update_voice"
  | "delete_voice"
  | "sound_effect"
  | "isolate";

export interface ProviderCapabilities {
  synthesize: boolean;
  streaming: boolean;
  timestamps: boolean;
  ssml: boolean;
  emotionTags: boolean;
  instantClone: boolean;
  professionalClone: boolean;
  voiceDesign: boolean;
  speechToSpeech: boolean;
  voiceLibrary: boolean;
  pronunciationDictionary: boolean;
  /** Output containers the provider can return natively. */
  formats: AudioContainer[];
  /** Languages the provider supports across its models (BCP-47 or 2-letter). */
  languages: LanguageTag[];
  maxInputChars: number;
}

export interface ProviderCredentials {
  apiKey?: string;
  /** Azure region, Google project, PlayHT user id, MiniMax group id… */
  [key: string]: string | undefined;
}

/** Resolves credentials for a provider. Future Paperclip integration: company-scoped connections. */
export interface CredentialResolver {
  resolve(provider: ProviderId, scope?: { companyId?: string }): Promise<ProviderCredentials | undefined>;
}

/** Minimal WebSocket surface used by streaming adapters; satisfied by the Node/browser global WebSocket. */
export interface WebSocketLike {
  readonly readyState: number;
  binaryType: string;
  send(data: string | ArrayBufferLike | ArrayBufferView): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: "open" | "message" | "close" | "error", listener: (event: any) => void): void;
  removeEventListener?(type: "open" | "message" | "close" | "error", listener: (event: any) => void): void;
}

/** Injectable WebSocket constructor so tests (and runtimes without a global) can supply their own. */
export type WebSocketFactory = (url: string, options?: { headers?: Record<string, string>; protocols?: string[] }) => WebSocketLike;

export interface ProviderContext {
  credentials: ProviderCredentials;
  fetch: typeof fetch;
  logger?: Logger;
  /** Default request timeout in ms. */
  timeoutMs?: number;
  baseUrl?: string;
  /** WebSocket factory for streaming adapters (STT, realtime). Defaults to `defaultWebSocketFactory`. */
  webSocket?: WebSocketFactory;
}

export interface VoiceProvider {
  readonly id: ProviderId;
  readonly name: string;
  readonly capabilities: ProviderCapabilities;

  listModels(): Promise<ModelDescriptor[]>;
  listVoices(query?: VoiceQuery): Promise<VoiceDescriptor[]>;
  getVoice?(voiceId: string): Promise<VoiceDescriptor | undefined>;
  /** Pick the best default model for a language / tier. */
  defaultModel(options?: { language?: LanguageTag; tier?: ModelTier }): string;

  synthesize(request: SynthesisRequest & { voice: VoiceRef }): Promise<SynthesisResult>;
  synthesizeStream?(request: SynthesisRequest & { voice: VoiceRef }): AsyncIterable<SynthesisChunk>;

  cloneVoice?(request: CloneVoiceRequest): Promise<CloneVoiceResult>;
  updateVoice?(voiceId: string, request: UpdateVoiceRequest): Promise<VoiceDescriptor>;
  deleteVoice?(voiceId: string, signal?: AbortSignal): Promise<void>;
  designVoice?(request: DesignVoiceRequest): Promise<DesignVoiceResult>;
  /** Persist a designed candidate as a usable voice. */
  saveDesignedVoice?(candidateId: string, name: string, description?: string): Promise<VoiceDescriptor>;
  speechToSpeech?(request: SpeechToSpeechRequest & { voice: VoiceRef }): Promise<SynthesisResult>;

  /** Cheap connectivity + auth check. */
  healthcheck?(signal?: AbortSignal): Promise<{ ok: boolean; detail?: string }>;
}

export type ProviderFactory = (context: ProviderContext) => VoiceProvider;

export interface ProviderDefinition {
  id: ProviderId;
  name: string;
  /** Documentation URL for API keys. */
  docsUrl: string;
  /** Credential field -> env var names consulted by the default resolver, in priority order. */
  credentialEnv: Record<string, string[]>;
  /** Credential fields that must be present for the provider to be usable. */
  requiredCredentials: string[];
  create: ProviderFactory;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export interface RoutingPolicy {
  /** Ordered provider preference; first that supports the request wins. */
  preferred?: ProviderId[];
  /** Fallback to the next provider on retryable failures. */
  fallback?: boolean;
  tier?: ModelTier;
  /** Per-language overrides: { "ja": ["fish-audio", "elevenlabs"] }. */
  byLanguage?: Record<LanguageTag, ProviderId[]>;
}

export interface CacheStore {
  get(key: string): Promise<CachedSynthesis | undefined>;
  set(key: string, value: CachedSynthesis, ttlMs?: number): Promise<void>;
  delete?(key: string): Promise<void>;
}

export interface CachedSynthesis {
  audio: AudioOutput;
  timestamps?: WordTimestamp[];
  model: string;
  provider: ProviderId;
  voice: VoiceRef;
  createdAt: number;
}

/** Where rendered audio can be persisted. Future Paperclip integration: artifact store. */
export interface AudioStorage {
  save(audio: AudioOutput, options: { fileName?: string; metadata?: Record<string, unknown> }): Promise<{ uri: string; path?: string }>;
}

export type EngineEvent =
  | { type: "synthesis.start"; provider: ProviderId; model: string; chars: number; requestId: string }
  | { type: "synthesis.complete"; provider: ProviderId; model: string; result: SynthesisResult; requestId: string }
  | { type: "synthesis.error"; provider: ProviderId; error: unknown; requestId: string; willFallback: boolean }
  | { type: "clone.complete"; provider: ProviderId; voice: VoiceDescriptor }
  | { type: "usage"; usage: UsageRecord; scope?: { companyId?: string; agentId?: string } }
  | { type: "cache.hit" | "cache.miss"; key: string };

export type EngineEventListener = (event: EngineEvent) => void;

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface VoiceEngineOptions {
  providers?: ProviderDefinition[];
  credentials?: CredentialResolver;
  fetch?: typeof fetch;
  cache?: CacheStore | false;
  cacheTtlMs?: number;
  storage?: AudioStorage;
  routing?: RoutingPolicy;
  logger?: Logger;
  timeoutMs?: number;
  /** Retry policy for transient provider errors. */
  retry?: { attempts: number; baseDelayMs: number; maxDelayMs: number };
  /** Scope forwarded to credentials and usage events (future company scoping). */
  scope?: { companyId?: string; agentId?: string };
}

export interface VoiceEngine {
  /** Lazily instantiates a provider with resolved credentials. */
  provider(id: ProviderId): Promise<VoiceProvider>;
  providers(): ProviderDefinition[];
  /** Providers for which credentials are currently available. */
  availableProviders(): Promise<ProviderId[]>;

  listModels(provider?: ProviderId): Promise<ModelDescriptor[]>;
  listVoices(query?: VoiceQuery): Promise<VoiceDescriptor[]>;
  getVoice(id: EngineVoiceId | VoiceRef): Promise<VoiceDescriptor | undefined>;
  /** Pick a voice automatically from the catalog for a language/gender/tags. */
  recommendVoice(query: VoiceQuery): Promise<VoiceDescriptor | undefined>;

  synthesize(request: SynthesisRequest): Promise<SynthesisResult>;
  synthesizeStream(request: SynthesisRequest): AsyncIterable<SynthesisChunk>;
  /** Splits long text into provider-sized chunks and concatenates the audio. */
  synthesizeLong(request: SynthesisRequest, options?: { maxChunkChars?: number; concurrency?: number }): Promise<SynthesisResult>;

  cloneVoice(provider: ProviderId, request: CloneVoiceRequest): Promise<CloneVoiceResult>;
  updateVoice(id: EngineVoiceId | VoiceRef, request: UpdateVoiceRequest): Promise<VoiceDescriptor>;
  deleteVoice(id: EngineVoiceId | VoiceRef): Promise<void>;
  designVoice(provider: ProviderId, request: DesignVoiceRequest): Promise<DesignVoiceResult>;
  saveDesignedVoice(provider: ProviderId, candidateId: string, name: string, description?: string): Promise<VoiceDescriptor>;
  speechToSpeech(request: SpeechToSpeechRequest): Promise<SynthesisResult>;

  estimateCost(request: Pick<SynthesisRequest, "text" | "voice" | "model">): Promise<UsageRecord>;
  on(listener: EngineEventListener): () => void;
}
