import { VoiceEngineError, codeFromStatus } from "../../../core/errors.js";
import type { WebSocketLike } from "../../../core/types.js";
import { defaultWebSocketFactory } from "../../../net/websocket.js";
import type { SttProvider, SttProviderContext, SttProviderDefinition, SttModelDescriptor, TranscriptionRequest, SttStream, SttStreamConfig, SttStreamEvent, TranscriptWord } from "../../types.js";

const BASE = "https://api.soniox.com";
export const SONIOX_STT_MODELS: SttModelDescriptor[] = [
  { provider: "soniox", id: "stt-async-v5", name: "Soniox Async v5", tier: "flagship", languages: [], latency: "batch", supportsBatch: true, supportsStreaming: false, supportsWordTimestamps: true, supportsDiarization: true, supportsLanguageDetection: true, supportsKeywords: true, supportsTranslation: true, supportsEndOfTurn: false, usdPerHour: 0.1, notes: "Soniox model/pricing pages checked 2026-10-22: https://soniox.com/docs/stt/models and https://soniox.com/pricing." },
  { provider: "soniox", id: "stt-rt-v5", name: "Soniox Realtime v5", tier: "flagship", languages: [], latency: "realtime", supportsBatch: false, supportsStreaming: true, supportsWordTimestamps: true, supportsDiarization: true, supportsLanguageDetection: true, supportsKeywords: true, supportsTranslation: true, supportsEndOfTurn: true, usdPerHour: 0.12, notes: "Soniox model/pricing pages checked 2026-10-22: https://soniox.com/docs/stt/models and https://soniox.com/pricing." },
];
/** Soniox provider definition. */
export const sonioxSttProvider: SttProviderDefinition = { id: "soniox", name: "Soniox", docsUrl: "https://soniox.com/docs", credentialEnv: { apiKey: ["SONIOX_API_KEY"] }, requiredCredentials: ["apiKey"], create: createSonioxSttProvider };
/** Create a Soniox async and real-time STT provider. */
export function createSonioxSttProvider(ctx: SttProviderContext): SttProvider {
  const key = ctx.credentials.apiKey; const base = (ctx.baseUrl ?? BASE).replace(/\/$/, "");
  const call = async (path: string, init: RequestInit = {}) => {
    let res: Response;
    try { res = await ctx.fetch(`${base}/v1${path}`, { ...init, headers: { authorization: `Bearer ${key ?? ""}`, ...(init.headers as Record<string, string> | undefined) }, signal: init.signal ?? AbortSignal.timeout(ctx.timeoutMs ?? 60_000) }); }
    catch (e) { throw new VoiceEngineError("Soniox request failed", { code: (e as Error)?.name === "AbortError" ? "aborted" : "provider_unavailable", provider: "soniox", cause: e, retryable: true }); }
    if (!res.ok) { let b: any; try { b = await res.json(); } catch { b = {}; } const c = codeFromStatus(res.status); throw new VoiceEngineError(b.message ?? "Soniox request failed", { code: c, provider: "soniox", status: res.status, retryAfterMs: parseRetry(res.headers.get("retry-after")), details: b }); }
    return res;
  };
  return { id: "soniox", name: "Soniox", capabilities: { batch: true, streaming: true, wordTimestamps: true, diarization: true, languageDetection: true, keywords: true, translation: true, endOfTurn: true, inputFormats: ["wav", "mp3", "flac", "ogg", "webm", "m4a"], streamEncodings: ["pcm16", "mulaw", "alaw", "opus", "flac", "mp3", "ogg"], languages: [] },
    async listModels() { return SONIOX_STT_MODELS; }, defaultModel(o) { return o?.streaming ? "stt-rt-v5" : "stt-async-v5"; },
    async transcribe(r: TranscriptionRequest) {
      let audioUrl: string | undefined; let fileId: string | undefined;
      if ("url" in r.audio) audioUrl = r.audio.url;
      else { const f = new FormData(); f.append("file", new Blob([r.audio.data.slice().buffer as ArrayBuffer]), r.audio.fileName ?? "audio"); const uploaded = await (await call("/files", { method: "POST", body: f, signal: r.signal })).json() as any; fileId = uploaded.id; }
      const body: Record<string, unknown> = { model: r.model ?? "stt-async-v5", ...(audioUrl ? { audio_url: audioUrl } : { file_id: fileId }), enable_speaker_diarization: !!r.diarization?.enabled, enable_language_identification: !r.language || r.language === "auto" };
      if (r.languageHints?.length) body.language_hints = r.languageHints;
      if (r.keywords?.length) body.context = { terms: r.keywords.map(k => typeof k === "string" ? k : k.term) };
      if (r.translateTo) body.translation = { type: "one_way", target_language: r.translateTo };
      Object.assign(body, r.providerOptions ?? {});
      const job = await (await call("/transcriptions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: r.signal })).json() as any;
      let state = job; let wait = 300;
      while (!["completed", "error", "failed"].includes(state.status)) { await delay(wait, r.signal); state = await (await call(`/transcriptions/${encodeURIComponent(job.id)}`, { signal: r.signal })).json(); wait = Math.min(5000, wait * 2); }
      if (state.status !== "completed") throw new VoiceEngineError(state.error_message ?? "Soniox transcription failed", { code: "invalid_request", provider: "soniox", details: state });
      const transcript = await (await call(`/transcriptions/${encodeURIComponent(job.id)}/transcript`, { signal: r.signal })).json() as any;
      const words: TranscriptWord[] | undefined = transcript.tokens?.map((t: any) => ({ text: t.text, startMs: t.start_ms, endMs: t.end_ms, confidence: t.confidence, speaker: t.speaker }));
      return { text: transcript.text ?? "", language: r.language === "auto" ? undefined : r.language, words, durationMs: state.audio_duration_ms, provider: "soniox", model: state.model ?? body.model, requestId: job.id, latencyMs: 0, usage: { provider: "soniox", model: state.model ?? body.model, operation: "transcribe", unit: "second", units: (state.audio_duration_ms ?? 0) / 1000, estimatedCents: null, pricingSource: "Plan/region dependent; https://soniox.com/pricing checked 2026-10-22", requestId: job.id }, raw: transcript };
    },
    async openStream(c) { return stream(ctx, c); },
  };
}
async function stream(ctx: SttProviderContext, c: SttStreamConfig): Promise<SttStream> {
  const key = ctx.credentials.apiKey; if (!key) throw new VoiceEngineError("Soniox API key is required", { code: "auth", provider: "soniox" });
  const ws = (ctx.webSocket ?? defaultWebSocketFactory)("wss://stt-rt.soniox.com/transcribe-websocket", { headers: { authorization: `Bearer ${key}` } });
  const q: SttStreamEvent[] = []; let wake: (() => void) | undefined; let ended = false; let closedResolve!: () => void; const closed = new Promise<void>(r => closedResolve = r); let ready = false;
  const emit = (e: SttStreamEvent) => { q.push(e); wake?.(); if (e.type === "close") { ended = true; closedResolve(); } };
  ws.addEventListener("open", () => { ready = true; const rawFormat = c.encoding === "pcm16" ? "pcm_s16le" : c.encoding; const conf: Record<string, unknown> = { model: c.model ?? "stt-rt-v5", audio_format: rawFormat, sample_rate: c.sampleRate, num_channels: c.channels ?? 1, enable_endpoint_detection: c.endOfTurn ?? true, enable_speaker_diarization: c.diarization ?? false, ...(c.languageHints?.length ? { language_hints: c.languageHints } : {}), ...(c.providerOptions?.context ? { context: c.providerOptions.context } : {}) }; if (c.language && c.language !== "auto") conf.language_hints = [c.language]; ws.send(JSON.stringify(conf)); emit({ type: "open" }); });
  ws.addEventListener("message", e => { if (typeof e.data !== "string") return; let m: any; try { m = JSON.parse(e.data); } catch { return; } if (m.error_code || m.error) { emit({ type: "error", error: new VoiceEngineError(m.error_message ?? m.error ?? "Soniox stream error", { code: "provider_unavailable", provider: "soniox", retryable: true }) }); return; } const toks = m.tokens ?? []; const words = toks.filter((t: any) => t.start_ms !== undefined).map((t: any) => ({ text: t.text, startMs: t.start_ms, endMs: t.end_ms, confidence: t.confidence, speaker: t.speaker })); const interim = toks.filter((t: any) => !t.is_final).map((t: any) => t.text).join(""); const final = toks.filter((t: any) => t.is_final).map((t: any) => t.text).join(""); if (interim) emit({ type: "interim", text: interim }); if (final) emit({ type: "final", text: final, words }); if (m.finished || m.type === "finished") emit({ type: "end_of_turn", text: final, reason: "provider" }); });
  ws.addEventListener("error", () => emit({ type: "error", error: new VoiceEngineError("Soniox WebSocket failed", { code: "provider_unavailable", provider: "soniox", retryable: true }) })); ws.addEventListener("close", (e: any) => emit({ type: "close", code: e.code, reason: e.reason }));
  const abort = () => { emit({ type: "error", error: new VoiceEngineError("Transcription aborted", { code: "aborted", provider: "soniox" }) }); ws.close(1000, "aborted"); }; c.signal?.addEventListener("abort", abort, { once: true }); if (c.signal?.aborted) abort();
  return { send(b) { if (ready && ws.readyState === 1) ws.send(b); }, finalize() { if (ws.readyState === 1) ws.send(JSON.stringify({ type: "finalize" })); }, keepAlive() { if (ws.readyState === 1) ws.send(JSON.stringify({ type: "keepalive" })); }, async close() { if (ws.readyState === 1) ws.send(""); if (ws.readyState >= 2) emit({ type: "close" }); await closed; c.signal?.removeEventListener("abort", abort); }, events: { async *[Symbol.asyncIterator]() { while (!ended || q.length) { if (!q.length) await new Promise<void>(r => wake = r); const x = q.shift(); wake = undefined; if (x) yield x; } } } };
}
function parseRetry(v: string | null) { return v ? Number(v) * 1000 : undefined; }
async function delay(ms: number, signal?: AbortSignal) { if (signal?.aborted) throw new VoiceEngineError("Transcription aborted", { code: "aborted", provider: "soniox" }); await new Promise<void>((resolve, reject) => { const id = setTimeout(resolve, ms); signal?.addEventListener("abort", () => { clearTimeout(id); reject(new VoiceEngineError("Transcription aborted", { code: "aborted", provider: "soniox" })); }, { once: true }); }); }
