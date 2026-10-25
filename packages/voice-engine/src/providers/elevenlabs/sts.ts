import type { ProviderContext, SpeechToSpeechRequest, SynthesisResult } from "../../core/types.js";
import { VoiceEngineError } from "../../core/errors.js";
import { appendAudio, appendFields, requestAudio } from "./http.js";
import { fromOutputFormat, toOutputFormat } from "./formats.js";
import { voiceRef, voiceSettings } from "./tts.js";

/** Transform an audio performance into the selected voice with the speech-to-speech API. */
export async function speechToSpeech(ctx: ProviderContext, request: SpeechToSpeechRequest): Promise<SynthesisResult> {
  const start = Date.now();
  const options = { ...request.providerOptions };
  const model = String(options.model_id ?? request.model ?? "eleven_multilingual_sts_v2");
  if (!["eleven_multilingual_sts_v2", "eleven_english_sts_v2"].includes(model)) throw new VoiceEngineError(`Unsupported ElevenLabs speech-to-speech model: ${model}`, { code: "unsupported", provider: "elevenlabs" });
  const format = request.format ? toOutputFormat(request.format) : typeof options.output_format === "string" ? fromOutputFormat(options.output_format) : toOutputFormat();
  delete options.output_format;
  const voice = voiceRef(request.voice);
  const form = new FormData();
  appendFields(form, { remove_background_noise: request.preserveBackground === undefined ? undefined : !request.preserveBackground,
    seed: request.settings?.seed, ...options, model_id: model, voice_settings: voiceSettings(request.settings, model, options.voice_settings) });
  appendAudio(form, "audio", request.audio);
  const { data, requestId } = await requestAudio(ctx, `/v1/speech-to-speech/${encodeURIComponent(voice.voiceId)}`, { form,
    query: { output_format: format.outputFormat }, signal: request.signal, accept: format.mimeType });
  return { audio: { data, format: format.format, mimeType: format.mimeType }, voice, model, provider: "elevenlabs", cached: false,
    latencyMs: Date.now() - start, requestId, usage: { provider: "elevenlabs", model, operation: "speech_to_speech", unit: "byte",
      units: request.audio.data.length, estimatedCents: null, pricingSource: "elevenlabs input bytes; audio duration unavailable; plan-dependent credits", requestId } };
}
