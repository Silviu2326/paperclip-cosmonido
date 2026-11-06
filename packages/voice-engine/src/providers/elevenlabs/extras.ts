import type { AudioFormat, AudioInput, AudioOutput, PronunciationRule, ProviderContext } from "../../core/types.js";
import { VoiceEngineError } from "../../core/errors.js";
import { appendAudio, appendFields, invalid, malformed, requestAudio, requestJson, requiredString } from "./http.js";
import { toOutputFormat } from "./formats.js";
import { languageCode } from "./models.js";

export interface SoundEffectRequest {
  text: string;
  durationSeconds?: number;
  promptInfluence?: number;
  loop?: boolean;
  format?: AudioFormat;
  signal?: AbortSignal;
}

/** Generate a sound effect, including seamless loops with the current sound v2 model. */
export async function generateSoundEffect(ctx: ProviderContext, request: SoundEffectRequest): Promise<AudioOutput> {
  if (!request.text.trim()) throw invalid("Sound effect text must not be empty");
  if (request.durationSeconds !== undefined && (!Number.isFinite(request.durationSeconds) || request.durationSeconds < 0.5 || request.durationSeconds > 30)) throw invalid("Sound effect duration must be 0.5-30 seconds");
  if (request.promptInfluence !== undefined && (!Number.isFinite(request.promptInfluence) || request.promptInfluence < 0 || request.promptInfluence > 1)) throw invalid("Prompt influence must be between 0 and 1");
  const format = toOutputFormat(request.format);
  const { data } = await requestAudio(ctx, "/v1/sound-generation", { json: { text: request.text, duration_seconds: request.durationSeconds,
    prompt_influence: request.promptInfluence, loop: request.loop, model_id: "eleven_text_to_sound_v2" }, query: { output_format: format.outputFormat }, signal: request.signal });
  return { data, format: format.format, mimeType: format.mimeType };
}

function returnedAudio(data: Uint8Array, contentType?: string): AudioOutput {
  const magic = new TextDecoder("ascii").decode(data.subarray(0, 12));
  const mime = contentType?.toLowerCase();
  if ((magic.startsWith("RIFF") && magic.slice(8) === "WAVE") || mime === "audio/wav" || mime === "audio/x-wav") {
    const format: AudioFormat = { container: "wav" };
    if (data.length >= 36 && magic.startsWith("RIFF")) {
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      for (let offset = 12; offset + 8 <= data.length;) {
        const size = view.getUint32(offset + 4, true);
        if (new TextDecoder("ascii").decode(data.subarray(offset, offset + 4)) === "fmt " && size >= 16 && offset + 24 <= data.length) {
          const channels = view.getUint16(offset + 10, true);
          const depth = view.getUint16(offset + 22, true);
          format.sampleRate = view.getUint32(offset + 12, true);
          if (channels === 1 || channels === 2) format.channels = channels;
          if (depth === 16 || depth === 24 || depth === 32) format.bitDepth = depth;
          break;
        }
        offset += 8 + size + (size % 2);
      }
    }
    return { data, format, mimeType: "audio/wav" };
  }
  if (magic.startsWith("ID3") || (data[0] === 0xff && (data[1] & 0xe0) === 0xe0) || mime === "audio/mpeg" || mime === "audio/mp3") return { data, format: { container: "mp3" }, mimeType: "audio/mpeg" };
  if (magic.startsWith("fLaC") || mime === "audio/flac") return { data, format: { container: "flac" }, mimeType: "audio/flac" };
  if (magic.startsWith("OggS") || mime === "audio/ogg") return { data, format: { container: "ogg" }, mimeType: "audio/ogg" };
  throw malformed(`Cannot identify ElevenLabs audio response format (${contentType ?? "no content type"})`);
}

/** Remove background noise, identifying the returned format from the bytes or response headers. */
export async function isolateAudio(ctx: ProviderContext, audio: AudioInput, signal?: AbortSignal): Promise<AudioOutput> {
  const form = new FormData();
  appendAudio(form, "audio", audio);
  const result = await requestAudio(ctx, "/v1/audio-isolation", { form, signal });
  return returnedAudio(result.data, result.contentType);
}

const xml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export interface PronunciationDictionary {
  id: string;
  versionId: string;
  name: string;
  locator: { pronunciation_dictionary_id: string; version_id: string };
  raw: Record<string, unknown>;
}

/** Upload escaped PLS XML and return the locator accepted by TTS providerOptions. */
export async function createPronunciationDictionary(ctx: ProviderContext, name: string, rules: PronunciationRule[], options: { language?: string; description?: string; signal?: AbortSignal } = {}): Promise<PronunciationDictionary> {
  if (!name.trim() || !rules.length) throw invalid("A pronunciation dictionary requires a name and at least one rule");
  const lexemes = rules.map(rule => {
    if (!rule.grapheme || (!rule.phoneme && !rule.alias) || (rule.phoneme && rule.alias)) throw invalid("Each pronunciation rule requires a grapheme and exactly one phoneme or alias");
    if (rule.phoneme && rule.alphabet === "x-sampa") throw new VoiceEngineError("ElevenLabs pronunciation dictionaries support IPA and CMU, not X-SAMPA", { code: "unsupported", provider: "elevenlabs" });
    const replacement = rule.alias ? `<alias>${xml(rule.alias)}</alias>` : `<phoneme alphabet="${rule.alphabet ?? "ipa"}">${xml(rule.phoneme!)}</phoneme>`;
    return `<lexeme><grapheme>${xml(rule.grapheme)}</grapheme>${replacement}</lexeme>`;
  }).join("\n");
  const pls = `<?xml version="1.0" encoding="UTF-8"?>\n<lexicon version="1.0" xmlns="http://www.w3.org/2005/01/pronunciation-lexicon" alphabet="ipa" xml:lang="${xml(options.language ?? "en-US")}">\n${lexemes}\n</lexicon>`;
  const form = new FormData();
  form.append("file", new Blob([pls], { type: "application/pls+xml" }), "dictionary.pls");
  appendFields(form, { name, description: options.description });
  const raw = await requestJson(ctx, "/v1/pronunciation-dictionaries/add-from-file", { form, signal: options.signal });
  const id = requiredString(raw.id, "id");
  const versionId = requiredString(raw.version_id, "version_id");
  return { id, versionId, name: typeof raw.name === "string" ? raw.name : name, locator: { pronunciation_dictionary_id: id, version_id: versionId }, raw };
}

export interface DubbingRequest {
  audio?: AudioInput;
  sourceUrl?: string;
  targetLanguage: string;
  sourceLanguage?: string;
  name?: string;
  numSpeakers?: number;
  watermark?: boolean;
  startTime?: number;
  endTime?: number;
  dropBackgroundAudio?: boolean;
  disableVoiceCloning?: boolean;
  signal?: AbortSignal;
  providerOptions?: Record<string, unknown>;
}

/** Start a dubbing job from an uploaded audio/video file or a source URL. */
export async function startDubbing(ctx: ProviderContext, request: DubbingRequest): Promise<Record<string, unknown> & { dubbing_id: string }> {
  if ((!request.audio && !request.sourceUrl) || (request.audio && request.sourceUrl)) throw invalid("Dubbing requires exactly one audio file or source URL");
  if (!request.targetLanguage.trim()) throw invalid("Dubbing requires a target language");
  const form = new FormData();
  appendFields(form, { ...request.providerOptions, source_url: request.sourceUrl, target_lang: languageCode(request.targetLanguage),
    source_lang: request.sourceLanguage ? languageCode(request.sourceLanguage) : "auto", name: request.name,
    num_speakers: request.numSpeakers, watermark: request.watermark, start_time: request.startTime, end_time: request.endTime,
    drop_background_audio: request.dropBackgroundAudio, disable_voice_cloning: request.disableVoiceCloning });
  if (request.audio) appendAudio(form, "file", request.audio);
  const data = await requestJson(ctx, "/v1/dubbing", { form, signal: request.signal });
  return { ...data, dubbing_id: requiredString(data.dubbing_id, "dubbing_id") };
}

/** Poll a dubbing job, retaining its status, target languages and provider error details. */
export async function getDubbing(ctx: ProviderContext, id: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
  return requestJson(ctx, `/v1/dubbing/${encodeURIComponent(id)}`, { signal });
}

/** Download dubbed media; video sources may return video, so this intentionally has no AudioFormat. */
export async function downloadDubbedAudio(ctx: ProviderContext, id: string, language: string, signal?: AbortSignal): Promise<{ data: Uint8Array; mimeType: string; requestId?: string }> {
  const result = await requestAudio(ctx, `/v1/dubbing/${encodeURIComponent(id)}/audio/${encodeURIComponent(languageCode(language))}`, { signal, accept: "*/*" });
  return { data: result.data, mimeType: result.contentType ?? "application/octet-stream", requestId: result.requestId };
}

export interface ElevenLabsSubscription {
  character_count: number;
  character_limit: number;
  tier: string;
  raw: Record<string, unknown>;
}

/** Read subscription quota without generating audio or consuming synthesis credits. */
export async function getSubscription(ctx: ProviderContext, signal?: AbortSignal): Promise<ElevenLabsSubscription> {
  const raw = await requestJson(ctx, "/v1/user/subscription", { signal });
  if (typeof raw.character_count !== "number" || typeof raw.character_limit !== "number") throw malformed("ElevenLabs subscription response is missing character quota");
  return { character_count: raw.character_count, character_limit: raw.character_limit, tier: requiredString(raw.tier, "tier"), raw };
}
