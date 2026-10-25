import type { AudioFormat, ProviderContext, SynthesisRequest, SynthesisResult, VoiceRef, WordTimestamp } from "../../core/types.js";
import { VoiceEngineError } from "../../core/errors.js";
import { endpoint, headers } from "./api.js";
import { bounded, jsonHttp } from "./http.js";
import { GOOGLE_MODELS, voiceFamily } from "./models.js";
import { buildSsml } from "./ssml.js";

type Request = SynthesisRequest & { voice: VoiceRef };
type Timepoint = { markName?: string; timeSeconds?: number };
const encodings: Record<string, [string, string]> = { mp3: ["MP3", "audio/mpeg"], wav: ["LINEAR16", "audio/wav"], pcm: ["PCM", "audio/pcm"], ogg: ["OGG_OPUS", "audio/ogg; codecs=opus"], opus: ["OGG_OPUS", "audio/ogg; codecs=opus"], mulaw: ["MULAW", "audio/wav"], alaw: ["ALAW", "audio/wav"] };
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

function outputFormat(format: AudioFormat = { container: "mp3" }) {
  if (!encodings[format.container] || format.channels === 2 || format.bitrate !== undefined
    || (format.bitDepth !== undefined && (!["pcm", "wav"].includes(format.container) || format.bitDepth !== 16))
    || (format.sampleRate !== undefined && (!Number.isInteger(format.sampleRate) || format.sampleRate < 8000 || format.sampleRate > 48000))) {
    throw new VoiceEngineError("Unsupported Google audio format", { provider: "google", code: "unsupported" });
  }
  return { format: { ...format, channels: 1 as const, ...(["wav", "pcm"].includes(format.container) ? { bitDepth: 16 as const } : {}) }, encoding: encodings[format.container][0], mimeType: encodings[format.container][1] };
}

function prepare(request: Request) {
  const options = request.providerOptions ?? {};
  const clone = request.voice.voiceId.startsWith("clone:");
  const model = request.model ?? (clone ? "chirp3-hd" : voiceFamily(request.voice.voiceId) ?? "gemini-2.5-pro-tts");
  const info = GOOGLE_MODELS.find(m => m.id === model);
  const gemini = model.startsWith("gemini-");
  if (request.timestamps && info?.supportsTimestamps === false) throw new VoiceEngineError("This Google voice family does not support SSML mark timepoints", { provider: "google", code: "unsupported" });
  const useSsml = request.ssml || request.timestamps || !!request.pronunciation?.length || !!options.sayAs || !!options.prosody;
  if (useSsml && info?.supportsSsml === false) throw new VoiceEngineError("This Google voice family does not support SSML", { provider: "google", code: "unsupported" });
  if (request.timestamps && !request.ssml && request.pronunciation?.some(rule => /\s/u.test(rule.grapheme))) {
    throw new VoiceEngineError("Per-word marks cannot align a multi-word pronunciation rule; provide marked SSML instead", { provider: "google", code: "unsupported" });
  }
  const output = outputFormat(request.format ?? (clone ? { container: "wav" } : undefined));
  const ssml = useSsml ? buildSsml(request) : undefined;
  const extraInput = object(options.input);
  const markup = options.markup ?? extraInput.markup;
  const input: Record<string, unknown> = ssml ? { ssml: ssml.ssml } : gemini && typeof markup === "string" ? { markup } : { text: request.text };
  if (gemini) {
    const prompt = [request.settings?.emotion ? `Speak with a ${request.settings.emotion} tone.` : undefined,
      request.settings?.style === undefined ? undefined : `Expressiveness: ${bounded(request.settings.style, 0, 1)} on a 0 to 1 scale.`,
      typeof options.prompt === "string" ? options.prompt : typeof extraInput.prompt === "string" ? extraInput.prompt : undefined,
    ].filter(Boolean).join(" ");
    if (prompt) input.prompt = prompt;
  }
  const voice: Record<string, unknown> = { ...object(options.voice), languageCode: request.language ?? request.voice.voiceId.match(/^[a-z]{2,3}-[A-Z]{2}/)?.[0] ?? "en-US" };
  if (clone) { delete voice.name; delete voice.modelName; voice.voiceClone = { voiceCloningKey: request.voice.voiceId.slice(6) }; }
  else { voice.name = request.voice.voiceId; delete voice.voiceClone; if (gemini) voice.modelName = model; else delete voice.modelName; }
  if (typeof options.ssmlGender === "string") voice.ssmlGender = options.ssmlGender;
  const audioConfig: Record<string, unknown> = { ...object(options.audioConfig), audioEncoding: output.encoding };
  if (request.settings?.speed !== undefined) audioConfig.speakingRate = bounded(request.settings.speed, 0.25, 4);
  if (request.settings?.pitch !== undefined) audioConfig.pitch = bounded(request.settings.pitch, -20, 20);
  if (request.settings?.volume !== undefined) audioConfig.volumeGainDb = bounded(request.settings.volume, -96, 16);
  if (output.format.sampleRate !== undefined) audioConfig.sampleRateHertz = output.format.sampleRate;
  else if (typeof audioConfig.sampleRateHertz === "number") {
    output.format = outputFormat({ ...output.format, sampleRate: audioConfig.sampleRateHertz }).format;
  }
  // Gemini uses prompt-level prosody; do not send unsupported pitch/rate/gain knobs.
  if (gemini) {
    const controls = [request.settings?.speed === undefined ? "" : `Speak at ${bounded(request.settings.speed, 0.25, 4)} times normal speed.`,
      request.settings?.pitch === undefined ? "" : `Pitch adjustment: ${bounded(request.settings.pitch, -20, 20)} semitones.`,
      request.settings?.volume === undefined ? "" : `Volume adjustment: ${bounded(request.settings.volume, -96, 16)} dB.`].filter(Boolean).join(" ");
    if (controls) input.prompt = [input.prompt, controls].filter(Boolean).join(" ");
    delete audioConfig.speakingRate; delete audioConfig.pitch; delete audioConfig.volumeGainDb;
  }
  if (Array.isArray(options.effectsProfileId)) audioConfig.effectsProfileId = options.effectsProfileId;
  const body: Record<string, unknown> = { ...options, input, voice, audioConfig };
  for (const key of ["prompt", "markup", "sayAs", "prosody", "effectsProfileId", "ssmlGender"]) delete body[key];
  if (request.timestamps) body.enableTimePointing = ["SSML_MARK"];
  else delete body.enableTimePointing;
  return { ...output, model, info, body, marks: ssml?.marks ?? new Map<string, string>(), beta: !!request.timestamps || clone };
}

/** Read RIFF duration for the last mark without estimating speech speed. */
function wavDuration(data: Uint8Array): number | undefined {
  if (data.length < 44 || Buffer.from(data.subarray(0, 4)).toString() !== "RIFF") return undefined;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let bytesPerSecond: number | undefined;
  for (let i = 12; i + 8 <= data.length;) {
    const kind = Buffer.from(data.subarray(i, i + 4)).toString();
    const size = view.getUint32(i + 4, true);
    if (i + 8 + size > data.length) break;
    if (kind === "fmt " && size >= 16) bytesPerSecond = view.getUint32(i + 16, true);
    if (kind === "data" && bytesPerSecond) return size / bytesPerSecond * 1000;
    i += 8 + size + size % 2;
  }
  return undefined;
}

/** Align only timepoints actually returned by the service; missing marks are never fabricated. */
export function parseTimepoints(points: Timepoint[], marks: Map<string, string>, durationMs?: number): WordTimestamp[] {
  const timed = points.filter((p): p is { markName: string; timeSeconds: number } => typeof p.markName === "string" && typeof p.timeSeconds === "number" && Number.isFinite(p.timeSeconds) && p.timeSeconds >= 0)
    .sort((a, b) => a.timeSeconds - b.timeSeconds);
  return timed.flatMap((point, index) => {
    const text = marks.get(point.markName);
    if (text === undefined) return [];
    const startMs = point.timeSeconds * 1000;
    return [{ text, startMs, endMs: Math.max(startMs, timed[index + 1]?.timeSeconds !== undefined ? timed[index + 1].timeSeconds * 1000 : durationMs ?? startMs) }];
  });
}

/** Decode Cloud TTS base64 audio and optional beta SSML mark timepoints. */
export async function synthesize(ctx: ProviderContext, request: Request): Promise<SynthesisResult> {
  const started = Date.now();
  const auth = headers(ctx);
  const prepared = prepare(request);
  const data = await jsonHttp<{ audioContent?: string; timepoints?: Timepoint[] }>(ctx, endpoint(ctx, "/text:synthesize", prepared.beta), {
    method: "POST", headers: auth, body: JSON.stringify(prepared.body), signal: request.signal,
  });
  if (!data || typeof data.audioContent !== "string" || !data.audioContent.length || !/^[A-Za-z0-9+/]*={0,2}$/.test(data.audioContent) || data.audioContent.length % 4 === 1) {
    throw new VoiceEngineError("Google returned missing or invalid base64 audio", { provider: "google", code: "provider_unavailable" });
  }
  const audio = new Uint8Array(Buffer.from(data.audioContent, "base64"));
  if (!audio.length || Buffer.from(audio).toString("base64").replace(/=+$/, "") !== data.audioContent.replace(/=+$/, "")) {
    throw new VoiceEngineError("Google returned invalid base64 audio", { provider: "google", code: "provider_unavailable" });
  }
  if (data.timepoints !== undefined && !Array.isArray(data.timepoints)) throw new VoiceEngineError("Google returned invalid timepoints", { provider: "google", code: "provider_unavailable" });
  const durationMs = wavDuration(audio);
  return { provider: "google", model: prepared.model, voice: request.voice, language: request.language,
    audio: { data: audio, format: prepared.format, mimeType: prepared.mimeType, durationMs },
    timestamps: request.timestamps ? parseTimepoints(data.timepoints ?? [], prepared.marks, durationMs) : undefined,
    cached: false, latencyMs: Date.now() - started,
    usage: { provider: "google", model: prepared.model, operation: "synthesize", unit: "character", units: request.text.length,
      estimatedCents: prepared.info?.usdPerMillionChars === undefined ? null : request.text.length * prepared.info.usdPerMillionChars / 10000,
      pricingSource: prepared.info?.notes ?? "Unknown model pricing" } };
}

/** Emulate streaming through sequential sentence requests; each chunk is a complete audio file. */
export async function* synthesizeStream(ctx: ProviderContext, request: Request) {
  const markup = request.providerOptions?.markup ?? object(request.providerOptions?.input).markup;
  const segments = request.ssml || markup !== undefined ? [request.text]
    : [...new Intl.Segmenter(undefined, { granularity: "sentence" }).segment(request.text)].map(s => s.segment);
  for (const text of segments) {
    if (!text.trim()) continue;
    const result = await synthesize(ctx, { ...request, text });
    yield { audio: result.audio.data, text, timestamps: result.timestamps };
  }
}
