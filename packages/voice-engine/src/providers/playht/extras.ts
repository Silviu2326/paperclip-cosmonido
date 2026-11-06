import type { ProviderContext, SynthesisRequest, SynthesisResult } from "../../core/types.js";
import { VoiceEngineError } from "../../core/errors.js";
import { invalid, object, request } from "./http.js";
import { synthesize, synthesisBody, synthesisResult } from "./tts.js";
import type { PlayHtInput } from "./tts.js";

function cancellation(signal: AbortSignal): VoiceEngineError {
  return new VoiceEngineError("PlayHT job interrupted", { provider: "playht", code: signal.reason?.name === "TimeoutError" ? "timeout" : "aborted", cause: signal.reason });
}

async function pause(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw cancellation(signal);
  await new Promise<void>((resolve, reject) => {
    const stop = () => { clearTimeout(timer); reject(cancellation(signal)); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", stop); resolve(); }, ms);
    signal.addEventListener("abort", stop, { once: true });
  });
}

/** Submit a TTS job, poll to completion, then download audio without API credentials. */
export async function synthesizeJob(ctx: ProviderContext, input: PlayHtInput, options: { pollIntervalMs?: number; timeoutMs?: number } = {}): Promise<SynthesisResult> {
  const start = Date.now(), controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("Job timed out", "TimeoutError")), options.timeoutMs ?? ctx.timeoutMs ?? 120000);
  const signal = input.signal ? AbortSignal.any([input.signal, controller.signal]) : controller.signal;
  try {
    let job = object(await request(ctx, "/tts", { method: "POST", signal, headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(synthesisBody(input)) }, res => res.json()));
    const id = String(job.id ?? job.job_id ?? "");
    while (!object(job.output).url) {
      if (["failed", "error", "cancelled"].includes(String(job.status).toLowerCase())) throw new VoiceEngineError(String(job.error ?? "PlayHT job failed"), { provider: "playht", code: "provider_unavailable", details: job });
      if (!id) throw new VoiceEngineError("PlayHT job response has no ID", { provider: "playht", code: "provider_unavailable" });
      await pause(Math.max(1, options.pollIntervalMs ?? 1000), signal);
      job = object(await request(ctx, `/tts/${encodeURIComponent(id)}`, { signal, headers: { Accept: "application/json" } }, res => res.json()));
    }
    const url = String(object(job.output).url);
    if (!/^https?:\/\//.test(url)) throw new VoiceEngineError("PlayHT returned an invalid audio URL", { provider: "playht", code: "provider_unavailable" });
    const data = await request(ctx, url, { signal }, async res => new Uint8Array(await res.arrayBuffer()), false);
    return synthesisResult(input, data, start, id || undefined);
  } finally { clearTimeout(timer); }
}

export interface DialogTurn { text: string; voiceId: string }

/** Render alternating turns using up to two PlayDialog voices. */
export async function synthesizeDialog(ctx: ProviderContext, turns: DialogTurn[], options: Omit<SynthesisRequest, "text" | "voice" | "model"> = {}): Promise<SynthesisResult> {
  const voices = [...new Set(turns.map(turn => turn.voiceId))];
  if (!turns.length || voices.length > 2) invalid("PlayDialog requires turns from one or two voices");
  const first = String(options.providerOptions?.turnPrefix ?? "Speaker 1:");
  const second = String(options.providerOptions?.turnPrefix2 ?? "Speaker 2:");
  return synthesize(ctx, { ...options, model: "PlayDialog", voice: { provider: "playht", voiceId: voices[0] },
    text: turns.map(turn => `${turn.voiceId === voices[0] ? first : second} ${turn.text}`).join("\n"),
    providerOptions: { ...options.providerOptions, turnPrefix: first, turnPrefix2: second, voice2: voices[1] } });
}
