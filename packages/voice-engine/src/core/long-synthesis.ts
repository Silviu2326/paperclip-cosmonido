import { concatAudio, estimateDurationMs } from "./audio.js";
import { VoiceEngineError } from "./errors.js";
import { toVoiceRef } from "./catalog.js";
import { chunkText, stripSsml } from "./text.js";
import type { SynthesisRequest, SynthesisResult, VoiceEngine, WordTimestamp } from "./types.js";

/** Internal ordered, bounded-concurrency long synthesis coordinator. */
export async function synthesizeLongText(engine: VoiceEngine, request: SynthesisRequest, options: { maxChunkChars?: number; concurrency?: number } = {}): Promise<SynthesisResult> {
  const started = Date.now();
  const provider = await engine.provider(toVoiceRef(request.voice).provider);
  const maxChars = Math.min(options.maxChunkChars ?? provider.capabilities.maxInputChars, provider.capabilities.maxInputChars);
  const concurrency = options.concurrency ?? 3;
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new VoiceEngineError("concurrency must be a positive integer", { code: "invalid_request" });
  const text = request.ssml && !provider.capabilities.ssml ? stripSsml(request.text) : request.text;
  const chunks = chunkText(text, maxChars, { preferParagraphs: true });
  if (!chunks.length) throw new VoiceEngineError("Synthesis text must not be empty", { code: "invalid_request" });
  if (request.ssml && provider.capabilities.ssml && chunks.length > 1) {
    throw new VoiceEngineError("Long SSML must be supplied as independently valid SSML requests", { code: "unsupported", provider: provider.id });
  }
  const controller = new AbortController();
  const signal = request.signal ? AbortSignal.any([request.signal, controller.signal]) : controller.signal;
  const results: SynthesisResult[] = new Array(chunks.length);
  let next = 0;
  const worker = async () => {
    while (!signal.aborted && next < chunks.length) {
      const index = next++;
      try {
        results[index] = await engine.synthesize({
          ...request, text: chunks[index], ssml: request.ssml && provider.capabilities.ssml, signal,
          // A single long utterance must not switch speakers between concurrent chunks.
          providerOptions: { ...request.providerOptions, allowFallbackVoice: false },
          idempotencyKey: request.idempotencyKey === undefined ? undefined : `${request.idempotencyKey}:chunk:${index}:${chunks.length}`,
          context: { previousText: index ? chunks[index - 1] : request.context?.previousText,
            nextText: index + 1 < chunks.length ? chunks[index + 1] : request.context?.nextText },
        });
      } catch (error) { controller.abort(error); throw error; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, chunks.length) }, worker));
  if (signal.aborted) throw new VoiceEngineError("Long synthesis aborted", { code: "aborted", cause: signal.reason });
  const first = results[0];
  const audio = concatAudio(results.map((result) => result.audio));
  let offset = 0, aligned = true;
  const timestamps: WordTimestamp[] = [];
  for (let index = 0; index < results.length; index++) {
    const result = results[index];
    if (!result.timestamps) { aligned = false; break; }
    timestamps.push(...result.timestamps.map((stamp) => ({ ...stamp, startMs: stamp.startMs + offset, endMs: stamp.endMs + offset })));
    const duration = result.audio.durationMs ?? estimateDurationMs(result.audio.format, result.audio.data.byteLength);
    if (duration === undefined && index < results.length - 1) { aligned = false; break; }
    offset += duration ?? 0;
  }
  const knownCosts = results.every((result) => result.usage.estimatedCents !== null);
  return { ...first, audio, timestamps: aligned ? timestamps : undefined,
    usage: { ...first.usage, units: results.reduce((sum, result) => sum + result.usage.units, 0),
      estimatedCents: knownCosts ? results.reduce((sum, result) => sum + result.usage.estimatedCents!, 0) : null,
      pricingSource: [...new Set(results.map((result) => result.usage.pricingSource))].join("; "), requestId: undefined },
    cached: results.every((result) => result.cached), latencyMs: Date.now() - started, requestId: undefined };
}
