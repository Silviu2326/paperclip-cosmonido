import { VoiceEngineError, codeFromStatus } from "../../../core/errors.js";
import type { WebSocketLike } from "../../../core/types.js";
import { defaultWebSocketFactory } from "../../../net/websocket.js";
import type { SttProvider, SttProviderContext, SttProviderDefinition, SttModelDescriptor, TranscriptionRequest, TranscriptionResult, SttStream, SttStreamConfig, SttStreamEvent, TranscriptWord } from "../../types.js";

const BASE = "https://api.assemblyai.com";
export const ASSEMBLYAI_STT_MODELS: SttModelDescriptor[] = [
  { provider: "assemblyai", id: "universal-3-pro", name: "Universal-3 Pro", tier: "flagship", languages: ["en", "es", "de", "fr", "pt", "it"], latency: "standard", supportsBatch: true, supportsStreaming: false, supportsWordTimestamps: true, supportsDiarization: true, supportsLanguageDetection: true, supportsKeywords: true, supportsTranslation: false, supportsEndOfTurn: false, usdPerHour: 0.21, notes: "AssemblyAI pricing/docs, checked 2026-10-22; source https://www.assemblyai.com/docs/getting-started/models (price per https://www.assemblyai.com/pricing.md)." },
  { provider: "assemblyai", id: "universal-2", name: "Universal-2", tier: "balanced", languages: [], latency: "standard", supportsBatch: true, supportsStreaming: false, supportsWordTimestamps: true, supportsDiarization: true, supportsLanguageDetection: true, supportsKeywords: true, supportsTranslation: false, supportsEndOfTurn: false, usdPerHour: 0.15, notes: "AssemblyAI pricing/docs, checked 2026-10-22; https://www.assemblyai.com/pricing.md." },
  { provider: "assemblyai", id: "universal-3-6-pro", name: "Universal-3 Pro Streaming", tier: "flagship", languages: ["en", "es", "de", "fr", "pt", "it"], latency: "realtime", supportsBatch: false, supportsStreaming: true, supportsWordTimestamps: true, supportsDiarization: true, supportsLanguageDetection: true, supportsKeywords: true, supportsTranslation: false, supportsEndOfTurn: true, usdPerHour: 0.45, notes: "Streaming model id and price from AssemblyAI current docs/pricing, checked 2026-10-22; https://www.assemblyai.com/docs/getting-started/models and https://www.assemblyai.com/pricing.md (name conflicts with pricing headings)." },
];

/** AssemblyAI provider definition. */
export const assemblyAiSttProvider: SttProviderDefinition = { id: "assemblyai", name: "AssemblyAI", docsUrl: "https://www.assemblyai.com/docs", credentialEnv: { apiKey: ["ASSEMBLYAI_API_KEY"] }, requiredCredentials: ["apiKey"], create: createAssemblyAiSttProvider };
/** Create an AssemblyAI batch and Universal Streaming provider. */
export function createAssemblyAiSttProvider(ctx: SttProviderContext): SttProvider {
  const key = ctx.credentials.apiKey;
  const base = (ctx.baseUrl ?? BASE).replace(/\/$/, "");
  const headers = { authorization: key ?? "" };
  const request = async (url: string, init: RequestInit = {}) => {
    let res: Response;
    try { res = await ctx.fetch(url, { ...init, headers: { ...headers, ...(init.headers as Record<string, string> | undefined) }, signal: init.signal ?? AbortSignal.timeout(ctx.timeoutMs ?? 60_000) }); }
    catch (e) { throw networkError(e, "assemblyai"); }
    if (!res.ok) throw await httpError(res, "assemblyai");
    return res;
  };
  const provider: SttProvider = {
    id: "assemblyai", name: "AssemblyAI", capabilities: { batch: true, streaming: true, wordTimestamps: true, diarization: true, languageDetection: true, keywords: true, translation: false, endOfTurn: true, inputFormats: ["wav", "mp3", "mp4", "m4a", "flac", "ogg", "webm"], streamEncodings: ["pcm16", "opus", "ogg"], languages: [], maxFileBytes: 2_200_000_000 },
    async listModels() { return ASSEMBLYAI_STT_MODELS; },
    defaultModel(o) { return o?.streaming ? "universal-3-6-pro" : "universal-3-pro"; },
    async transcribe(r) {
      const started = Date.now(); const audioUrl = "url" in r.audio ? r.audio.url : await upload(r.audio.data, r.audio.fileName ?? "audio", request, base, r.signal);
      const body: Record<string, unknown> = { audio_url: audioUrl, speech_models: [r.model ?? "universal-3-pro"] };
      if (r.language && r.language !== "auto") body.language_code = r.language;
      else body.language_detection = true;
      if (r.diarization?.enabled) body.speaker_labels = true;
      if (r.keywords?.length) body.keyterms_prompt = r.keywords.map(x => typeof x === "string" ? x : x.term);
      if (r.punctuation !== undefined) body.punctuate = r.punctuation;
      if (r.formatting !== undefined) body.format_text = r.formatting;
      if (r.providerOptions) Object.assign(body, r.providerOptions);
      const create = await (await request(`${base}/v2/transcript`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: r.signal })).json() as any;
      if (!create.id) throw new VoiceEngineError("AssemblyAI response omitted transcript id", { code: "provider_unavailable", provider: "assemblyai", retryable: true });
      let row: any = create; let delay = 250;
      while (row.status !== "completed" && row.status !== "error") {
        await pause(delay, r.signal); row = await (await request(`${base}/v2/transcript/${encodeURIComponent(create.id)}`, { signal: r.signal })).json(); delay = Math.min(5000, delay * 2);
      }
      if (row.status === "error") throw new VoiceEngineError(row.error ?? "AssemblyAI transcription failed", { code: "invalid_request", provider: "assemblyai", details: row });
      const words: TranscriptWord[] | undefined = row.words?.map((w: any) => ({ text: w.text, startMs: w.start, endMs: w.end, confidence: w.confidence, speaker: w.speaker }));
      return { text: row.text ?? "", language: row.language_code, languageConfidence: row.language_confidence, words, durationMs: row.audio_duration ? row.audio_duration * 1000 : undefined, provider: "assemblyai", model: row.speech_model_used ?? r.model ?? "universal-3-pro", usage: { provider: "assemblyai", model: row.speech_model_used ?? r.model, operation: "transcribe", unit: "second", units: row.audio_duration ?? 0, estimatedCents: null, pricingSource: "Plan dependent; https://www.assemblyai.com/pricing.md checked 2026-10-22", requestId: row.id }, requestId: row.id, latencyMs: Date.now() - started, raw: row };
    },
    async openStream(c) { return openAssemblyStream(ctx, c); },
  };
  return provider;
}
async function upload(data: Uint8Array, name: string, req: (url: string, init?: RequestInit) => Promise<Response>, base: string, signal?: AbortSignal) { return (await req(`${base}/v2/upload`, { method: "POST", headers: { "content-type": "application/octet-stream" }, body: data as BodyInit, signal })).json().then((v: any) => v.upload_url as string); }
async function openAssemblyStream(ctx: SttProviderContext, c: SttStreamConfig): Promise<SttStream> {
  if (!ctx.credentials.apiKey) throw new VoiceEngineError("AssemblyAI API key is required", { code: "auth", provider: "assemblyai" });
  const model = c.model ?? "universal-3-6-pro"; const q = new URLSearchParams({ sample_rate: String(c.sampleRate), speech_model: model, format_turns: String(c.formatting ?? true) });
  if (c.endOfTurn) q.set("end_of_turn_confidence_threshold", String(c.providerOptions?.endOfTurnConfidenceThreshold ?? 0.7));
  if (c.keywords?.length) q.set("keyterms_prompt", JSON.stringify(c.keywords.map(x => typeof x === "string" ? x : x.term)));
  const ws = (ctx.webSocket ?? defaultWebSocketFactory)(`wss://streaming.assemblyai.com/v3/ws?${q}`, { headers: { authorization: ctx.credentials.apiKey } });
  return socketStream(ws, c.signal, (msg, emit) => {
    let m: any; try { m = JSON.parse(msg); } catch { return; }
    if (m.type === "Begin") emit({ type: "open", sessionId: m.id });
    if (m.type === "Turn") {
      const words: TranscriptWord[] | undefined = m.words?.map((w: any) => ({ text: w.text, startMs: w.start, endMs: w.end, confidence: w.confidence, speaker: w.speaker }));
      if (m.transcript) emit({ type: m.end_of_turn ? "final" : "interim", text: m.transcript, words, startMs: m.start, endMs: m.end });
      if (m.end_of_turn) emit({ type: "end_of_turn", text: m.transcript, confidence: m.end_of_turn_confidence, reason: "semantic" });
    }
    if (m.type === "Termination") emit({ type: "close" });
    if (m.type === "Error") emit({ type: "error", error: new VoiceEngineError(m.error ?? "AssemblyAI stream error", { code: "provider_unavailable", provider: "assemblyai", retryable: true }) });
  }, () => JSON.stringify({ type: "Terminate" }));
}
function socketStream(ws: WebSocketLike, signal: AbortSignal | undefined, parse: (data: string, emit: (e: SttStreamEvent) => void) => void, finalizeMsg: () => string): SttStream {
  const q: SttStreamEvent[] = []; let wake: (() => void) | undefined; let ended = false; let opened = ws.readyState === 1; let closedResolve!: () => void; const closed = new Promise<void>(r => closedResolve = r);
  const emit = (e: SttStreamEvent) => { q.push(e); wake?.(); if (e.type === "close") { ended = true; closedResolve(); wake?.(); } };
  ws.addEventListener("open", () => { opened = true; emit({ type: "open" }); });
  ws.addEventListener("message", e => parse(typeof e.data === "string" ? e.data : String(e.data), emit));
  ws.addEventListener("error", () => emit({ type: "error", error: new VoiceEngineError("STT WebSocket failed", { code: "provider_unavailable", retryable: true }) }));
  ws.addEventListener("close", (e: any) => emit({ type: "close", code: e.code, reason: e.reason }));
  const abort = () => { emit({ type: "error", error: new VoiceEngineError("Transcription aborted", { code: "aborted", provider: "assemblyai" }) }); ws.close(1000, "aborted"); }; signal?.addEventListener("abort", abort, { once: true }); if (signal?.aborted) abort();
  return { send(b) { if (ws.readyState === 1) ws.send(b); }, finalize() { if (ws.readyState === 1) ws.send(finalizeMsg()); }, async close() { if (ws.readyState < 2) ws.close(1000, "client close"); if (ws.readyState === 3) { emit({ type: "close" }); } await closed; signal?.removeEventListener("abort", abort); }, events: { async *[Symbol.asyncIterator]() { while (!ended || q.length) { if (!q.length) await new Promise<void>(r => wake = r); const e = q.shift(); wake = undefined; if (e) yield e; } } } };
}
async function pause(ms: number, signal?: AbortSignal) { if (signal?.aborted) throw new VoiceEngineError("Transcription aborted", { code: "aborted", provider: "assemblyai" }); await new Promise<void>((resolve, reject) => { const id = setTimeout(resolve, ms); signal?.addEventListener("abort", () => { clearTimeout(id); reject(new VoiceEngineError("Transcription aborted", { code: "aborted", provider: "assemblyai" })); }, { once: true }); }); }
async function httpError(res: Response, provider: string) { let body: any; try { body = await res.json(); } catch { body = await res.text().catch(() => ""); } const code = codeFromStatus(res.status); const ra = res.headers.get("retry-after"); return new VoiceEngineError(body?.error ?? body?.message ?? `Provider request failed (${res.status})`, { code, provider, status: res.status, retryAfterMs: ra ? Number(ra) * 1000 : undefined, details: body }); }
function networkError(e: unknown, provider: string) { return new VoiceEngineError("Provider request failed", { code: e instanceof Error && e.name === "AbortError" ? "aborted" : "provider_unavailable", provider, cause: e, retryable: true }); }
