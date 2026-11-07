import type { DesignVoiceRequest, DesignVoiceResult, ProviderContext, VoiceDescriptor } from "../../core/types.js";
import { decodeAudio, invalid, malformed, object, requestJson, requiredString } from "./http.js";
import { fromOutputFormat, toOutputFormat } from "./formats.js";
import { normalizeVoice } from "./voices.js";
import { defaultModel } from "./models.js";

/** Expand a terse voice prompt with the caller's demographic and language preferences. */
export function designPrompt(request: DesignVoiceRequest): string {
  const prompt = request.prompt.trim();
  if (prompt.length >= 100) return prompt;
  return [prompt, request.gender && request.gender !== "unknown" ? `${request.gender} voice` : undefined,
    request.age && request.age !== "unknown" ? `${request.age.replace(/_/g, " ")} speaker` : undefined,
    request.accent ? `${request.accent} accent` : undefined,
    request.language ? `speaking ${request.language}` : undefined,
    "Clear, natural delivery with consistent vocal character."].filter(Boolean).join(". ");
}

/** Design preview candidates; persist a chosen generated_voice_id with saveDesignedVoice. */
export async function designVoice(ctx: ProviderContext, request: DesignVoiceRequest): Promise<DesignVoiceResult> {
  if (request.candidates !== undefined && (!Number.isInteger(request.candidates) || request.candidates < 1)) throw invalid("candidates must be a positive integer");
  const options = { ...request.providerOptions };
  const format = typeof options.output_format === "string" ? fromOutputFormat(options.output_format) : toOutputFormat();
  delete options.output_format;
  const model = options.model_id ?? (defaultModel({ language: request.language }) === "eleven_v3" ? "eleven_ttv_v3" : "eleven_multilingual_ttv_v2");
  if (model !== "eleven_multilingual_ttv_v2" && model !== "eleven_ttv_v3") throw invalid("Unsupported ElevenLabs voice design model");
  const body = { ...options, voice_description: designPrompt(request), model_id: model,
    ...(request.text ? { text: request.text, auto_generate_text: false } : typeof options.text === "string" ? { auto_generate_text: false } : { auto_generate_text: true }),
    stream_previews: false };
  const data = await requestJson(ctx, "/v1/text-to-voice/design", { json: body, query: { output_format: format.outputFormat }, signal: request.signal });
  if (!Array.isArray(data.previews)) throw malformed("ElevenLabs voice design response is missing previews");
  return { candidates: data.previews.slice(0, request.candidates).map(value => {
    const preview = object(value);
    return { candidateId: requiredString(preview.generated_voice_id, "generated_voice_id"), description: body.voice_description,
      preview: { data: decodeAudio(preview.audio_base_64 ?? preview.audio_base64), format: format.format,
        mimeType: typeof preview.media_type === "string" ? preview.media_type : format.mimeType,
        durationMs: typeof preview.duration_secs === "number" ? preview.duration_secs * 1000 : undefined } };
  }) };
}

/** Save a generated voice preview as a voice in the current account. */
export async function saveDesignedVoice(ctx: ProviderContext, candidateId: string, name: string, description = "", signal?: AbortSignal): Promise<VoiceDescriptor> {
  const data = await requestJson(ctx, "/v1/text-to-voice", { json: { generated_voice_id: candidateId, voice_name: name, voice_description: description }, signal });
  return normalizeVoice({ name, description, category: "generated", ...data }, "designed");
}
