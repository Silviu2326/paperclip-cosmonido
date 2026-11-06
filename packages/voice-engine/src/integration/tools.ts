import { randomUUID } from "node:crypto";
import { VoiceEngineError } from "../core/errors.js";
import type { AudioOutput, AudioStorage, CloneVoiceRequest, DesignVoiceRequest, EngineVoiceId, SynthesisRequest, SynthesisResult, VoiceDescriptor, VoiceEngine, VoiceQuery } from "../core/types.js";
import type { SttEngine } from "../stt/types.js";
import type { LlmEngine } from "../llm/types.js";
import { VOICE_TOOLS, validateToolInput, type VoiceToolName } from "./tool-schemas.js";

export { VOICE_TOOLS } from "./tool-schemas.js";
export type { JsonSchema, VoiceToolDefinition, VoiceToolName } from "./tool-schemas.js";
export const voiceToolDefinitions = VOICE_TOOLS;
export const INLINE_AUDIO_LIMIT = 1_000_000;
export type VoiceToolHandlers = Record<VoiceToolName, (input: Record<string, unknown>) => Promise<unknown>>;

function voiceId(value: string): EngineVoiceId {
  if (!/^[^:\s]+:.+$/s.test(value)) throw new VoiceEngineError("voice must be provider:voiceId.", { code: "invalid_request" });
  return value as EngineVoiceId;
}

function safeVoice(voice: VoiceDescriptor): Omit<VoiceDescriptor, "raw"> {
  const { raw: _raw, ...publicVoice } = voice;
  if (publicVoice.previewUrl?.trim().toLowerCase().startsWith("data:")) delete publicVoice.previewUrl;
  return publicVoice;
}

function plainFileName(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim() || /[\\/\u0000-\u001f:]/.test(value) || value === "." || value === "..") {
    throw new VoiceEngineError("fileName must be a plain filename, not a path.", { code: "invalid_request" });
  }
  return value;
}

/** Bind JSON-safe agent tools to an already scoped engine and storage instance. */
export function createVoiceToolHandlers(engine: VoiceEngine, options: { storage: AudioStorage; stt?: SttEngine; llm?: LlmEngine }): VoiceToolHandlers {
  async function save(audio: AudioOutput, input: Record<string, unknown>, metadata: Record<string, unknown>) {
    const fileName = plainFileName(input.fileName) ?? `voice-${randomUUID()}.${audio.format.container}`;
    const saved = await options.storage.save(audio, { fileName, metadata });
    if (saved.uri.trim().toLowerCase().startsWith("data:")) throw new VoiceEngineError("Audio storage must return a reference URI, not a data URL.", { code: "invalid_request" });
    return { uri: saved.uri, mimeType: audio.mimeType, format: audio.format, durationMs: audio.durationMs, byteLength: audio.data.byteLength,
      ...(input.inline === true && audio.data.byteLength < INLINE_AUDIO_LIMIT ? { base64: Buffer.from(audio.data).toString("base64") } : {}) };
  }
  async function synthesis(result: SynthesisResult, input: Record<string, unknown>) {
    return { ...await save(result.audio, input, { provider: result.provider, model: result.model, requestId: result.requestId }),
      voice: result.voice, provider: result.provider, model: result.model, language: result.language,
      timestamps: result.timestamps, usage: result.usage, cached: result.cached, latencyMs: result.latencyMs, requestId: result.requestId };
  }
  function request(input: Record<string, unknown>): SynthesisRequest {
    plainFileName(input.fileName);
    const { fileName: _file, inline: _inline, concurrency: _concurrency, maxChunkChars: _chunk, ...rest } = input;
    const result = { ...rest, voice: voiceId(input.voice as string) } as unknown as SynthesisRequest;
    if (result.format?.bitDepth !== undefined && ![16, 24, 32].includes(result.format.bitDepth)) throw new VoiceEngineError("bitDepth must be 16, 24 or 32.", { code: "invalid_request" });
    return result;
  }
  const handlers: VoiceToolHandlers = {
    async voice_list_voices(input) { return (await engine.listVoices(input as VoiceQuery)).map(safeVoice); },
    async voice_speak(input) { return synthesis(await engine.synthesize(request(input)), input); },
    async voice_speak_long(input) { return synthesis(await engine.synthesizeLong(request(input), { maxChunkChars: input.maxChunkChars as number | undefined, concurrency: input.concurrency as number | undefined }), input); },
    async voice_estimate(input) { return engine.estimateCost({ text: input.text as string, voice: voiceId(input.voice as string), model: input.model as string | undefined }); },
    async voice_clone(input) {
      const { provider, samples, ...rest } = input;
      const audio = (samples as { dataBase64: string; mimeType: string; fileName?: string }[]).map(sample => {
        // Strict decoding avoids silently passing corrupted samples to a paid API.
        if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(sample.dataBase64)) throw new VoiceEngineError("Sample dataBase64 must be canonical padded base64.", { code: "invalid_request" });
        const data = Buffer.from(sample.dataBase64, "base64");
        if (!data.length || data.toString("base64") !== sample.dataBase64) throw new VoiceEngineError("Sample dataBase64 is empty or invalid.", { code: "invalid_request" });
        return { data, mimeType: sample.mimeType, fileName: plainFileName(sample.fileName) };
      });
      const result = await engine.cloneVoice(provider as string, { ...rest, samples: audio } as unknown as CloneVoiceRequest);
      return { ...result, voice: safeVoice(result.voice) };
    },
    async voice_design(input) {
      const { provider, inline: _inline, ...rest } = input;
      const result = await engine.designVoice(provider as string, rest as unknown as DesignVoiceRequest);
      return { usage: result.usage, candidates: await Promise.all(result.candidates.map(async candidate => ({
        candidateId: candidate.candidateId, description: candidate.description,
        ...await save(candidate.preview, input, { provider, candidateId: candidate.candidateId }),
      }))) };
    },
    async voice_transcribe(input) {
      if (!options.stt) throw new VoiceEngineError("STT tool is not configured.", { code: "unsupported" });
      const encoded = input.dataBase64 as string;
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new VoiceEngineError("dataBase64 must be canonical padded base64.", { code: "invalid_request" });
      const data = Buffer.from(encoded, "base64");
      if (!data.length || data.toString("base64") !== encoded) throw new VoiceEngineError("Audio is empty or invalid.", { code: "invalid_request" });
      return options.stt.transcribe({ provider: input.provider as string | undefined, model: input.model as string | undefined, audio: { data, mimeType: input.mimeType as string }, language: input.language as string | undefined, wordTimestamps: input.wordTimestamps as boolean | undefined, diarization: input.diarization ? { enabled: true } : undefined });
    },
    async llm_chat(input) {
      if (!options.llm) throw new VoiceEngineError("LLM tool is not configured.", { code: "unsupported" });
      const result = await options.llm.complete({ provider: input.provider as string | undefined, model: input.model as string | undefined, system: input.system as string | undefined, messages: [{ role: "user", content: input.prompt as string }], maxTokens: input.maxTokens as number | undefined, temperature: input.temperature as number | undefined });
      return { text: result.text, provider: result.provider, model: result.model, usage: result.usage };
    },
  };
  return Object.fromEntries(VOICE_TOOLS.map(definition => [definition.name, async (input: Record<string, unknown>) => {
    try { validateToolInput(definition.inputSchema, input); }
    catch (error) { throw new VoiceEngineError(error instanceof Error ? error.message : String(error), { code: "invalid_request" }); }
    // JSON serialization removes undefined fields without ever exposing raw audio.
    return JSON.parse(JSON.stringify(await handlers[definition.name](input))) as unknown;
  }])) as VoiceToolHandlers;
}
