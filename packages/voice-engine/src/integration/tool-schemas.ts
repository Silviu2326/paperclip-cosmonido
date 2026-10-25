export interface JsonSchema {
  type?: "object" | "array" | "string" | "number" | "integer" | "boolean";
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchema;
  enum?: readonly (string | boolean | number)[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  minItems?: number;
}
export interface VoiceToolDefinition { name: VoiceToolName; description: string; effect: "read" | "write"; inputSchema: JsonSchema }
export type VoiceToolName = "voice_list_voices" | "voice_speak" | "voice_speak_long" | "voice_clone" | "voice_design" | "voice_estimate" | "voice_transcribe" | "llm_chat";

const string: JsonSchema = { type: "string", minLength: 1 };
const boolean: JsonSchema = { type: "boolean" };
const integer: JsonSchema = { type: "integer", minimum: 1 };
const unit: JsonSchema = { type: "number", minimum: 0, maximum: 1 };
const gender: JsonSchema = { type: "string", enum: ["male", "female", "neutral", "unknown"] };
const age: JsonSchema = { type: "string", enum: ["child", "young", "middle_aged", "old", "unknown"] };
const object = (properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema => ({ type: "object", properties, required, additionalProperties: false });
const settings = object({ speed: { type: "number", minimum: 0.25, maximum: 4 }, stability: unit, similarity: unit, style: unit, pitch: { type: "number", minimum: -12, maximum: 12 }, volume: { type: "number", minimum: -20, maximum: 20 }, emotion: string, speakerBoost: boolean, seed: { type: "integer", minimum: 0 } });
const format = object({ container: { type: "string", enum: ["mp3", "wav", "pcm", "opus", "ogg", "flac", "aac", "mulaw", "alaw"] }, sampleRate: integer, bitrate: integer, channels: { type: "integer", minimum: 1, maximum: 2 }, bitDepth: { type: "integer", enum: [16, 24, 32] } }, ["container"]);
const synthesis = { text: string, voice: { ...string, description: "Engine voice id, provider:voiceId; use voice_list_voices to choose." }, model: string, language: string, format, settings, timestamps: boolean, ssml: boolean, fileName: string, inline: { type: "boolean", description: "Include base64 only if audio is smaller than 1,000,000 bytes; always save a URI." } } satisfies Record<string, JsonSchema>;

export const VOICE_TOOLS: VoiceToolDefinition[] = [
  { name: "voice_list_voices", effect: "read", description: "Search the unified voice catalog for the caller's scoped providers.", inputSchema: object({ provider: string, language: string, gender, age, tags: { type: "array", items: string }, origin: { type: "string", enum: ["premade", "cloned", "designed", "professional_clone", "community", "custom"] }, search: string, limit: integer }) },
  { name: "voice_speak", effect: "write", description: "Synthesize speech, save audio through the configured storage, and return its URI. May incur provider cost.", inputSchema: object(synthesis, ["text", "voice"]) },
  { name: "voice_speak_long", effect: "write", description: "Split and synthesize long text, store audio, and return its URI. May incur provider cost.", inputSchema: object({ ...synthesis, maxChunkChars: integer, concurrency: { ...integer, maximum: 32 } }, ["text", "voice"]) },
  { name: "voice_clone", effect: "write", description: "Clone a voice from caller-supplied audio samples. Requires informed voice-owner consent and may start asynchronous training.", inputSchema: object({ provider: string, name: string, description: string, language: string, mode: { type: "string", enum: ["instant", "professional"] }, denoise: boolean, consent: object({ attested: { type: "boolean", enum: [true] }, text: string }, ["attested"]), samples: { type: "array", minItems: 1, items: object({ dataBase64: string, mimeType: string, fileName: string }, ["dataBase64", "mimeType"]) } }, ["provider", "name", "samples", "consent"]) },
  { name: "voice_design", effect: "write", description: "Design voice candidates from a prompt and store previews. Does not persist a reusable provider voice.", inputSchema: object({ provider: string, prompt: string, text: string, language: string, gender, age, accent: string, candidates: { ...integer, maximum: 100 }, inline: synthesis.inline }, ["provider", "prompt"]) },
  { name: "voice_estimate", effect: "read", description: "Estimate synthesis cost without generating audio. Unknown plan pricing remains null.", inputSchema: object({ text: string, voice: synthesis.voice, model: string }, ["text", "voice"]) },
  { name: "voice_transcribe", effect: "write", description: "Transcribe supplied base64 audio with a scoped STT provider; may incur provider cost.", inputSchema: object({ provider: string, model: string, dataBase64: string, mimeType: string, language: string, wordTimestamps: boolean, diarization: boolean }, ["dataBase64", "mimeType"]) },
  { name: "llm_chat", effect: "write", description: "Complete a chat prompt with a scoped LLM provider; may incur provider cost.", inputSchema: object({ provider: string, model: string, system: string, prompt: string, maxTokens: integer, temperature: { type: "number", minimum: 0, maximum: 2 } }, ["prompt"]) },
];

/** Validate the supported JSON-schema subset at the invocation boundary. */
export function validateToolInput(schema: JsonSchema, value: unknown, path = "input"): void {
  const invalid = (detail: string): never => { throw new TypeError(`${path}: ${detail}`); };
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) invalid("expected an object");
    const record = value as Record<string, unknown>;
    for (const key of schema.required ?? []) if (!Object.hasOwn(record, key)) invalid(`missing ${key}`);
    for (const [key, item] of Object.entries(record)) {
      const child = Object.hasOwn(schema.properties ?? {}, key) ? schema.properties![key] : undefined;
      if (!child && schema.additionalProperties === false) invalid(`unknown property ${key}`);
      if (child) validateToolInput(child, item, `${path}.${key}`);
    }
  } else if (schema.type === "array") {
    if (!Array.isArray(value)) invalid("expected an array");
    const array = value as unknown[];
    if (array.length < (schema.minItems ?? 0)) invalid("too few items");
    array.forEach((item, i) => { if (schema.items) validateToolInput(schema.items, item, `${path}[${i}]`); });
  } else if (schema.type === "string") {
    if (typeof value !== "string" || value.trim().length < (schema.minLength ?? 0)) invalid("expected a nonempty string");
  } else if (schema.type === "number" || schema.type === "integer") {
    if (typeof value !== "number" || !Number.isFinite(value) || (schema.type === "integer" && !Number.isInteger(value))) invalid("expected a finite number");
    const number = value as number;
    if (number < (schema.minimum ?? -Infinity) || number > (schema.maximum ?? Infinity)) invalid("number out of range");
  } else if (schema.type === "boolean" && typeof value !== "boolean") invalid("expected a boolean");
  if (schema.enum && !schema.enum.includes(value as string | boolean)) invalid("value is not an allowed choice");
}
