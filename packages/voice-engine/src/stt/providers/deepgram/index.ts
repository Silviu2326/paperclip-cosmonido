import { VoiceEngineError, codeFromStatus } from "../../../core/errors.js";
import { defaultWebSocketFactory, WS_READY_STATE } from "../../../net/websocket.js";
import type { SttModelDescriptor, SttProvider, SttProviderContext, SttProviderDefinition, SttStream, SttStreamConfig, SttStreamEvent, TranscriptWord, TranscriptionRequest, TranscriptionResult } from "../../types.js";

const notes = "Model IDs and capabilities: https://developers.deepgram.com/docs/models-languages-overview, accessed 2026-10-22. Pricing intentionally omitted: official page marks streaming rates promotional.";
export const DEEPGRAM_STT_MODELS: SttModelDescriptor[] = [
  { provider: "deepgram", id: "nova-3", name: "Nova-3", tier: "flagship", languages: [], latency: "low", supportsBatch: true, supportsStreaming: true, supportsWordTimestamps: true, supportsDiarization: true, supportsLanguageDetection: true, supportsKeywords: true, supportsTranslation: false, supportsEndOfTurn: false, notes },
  { provider: "deepgram", id: "nova-3-general", name: "Nova-3 General", tier: "flagship", languages: [], latency: "low", supportsBatch: true, supportsStreaming: true, supportsWordTimestamps: true, supportsDiarization: true, supportsLanguageDetection: true, supportsKeywords: true, supportsTranslation: false, supportsEndOfTurn: false, notes },
  { provider: "deepgram", id: "nova-3-medical", name: "Nova-3 Medical", tier: "flagship", languages: ["en"], latency: "low", supportsBatch: true, supportsStreaming: true, supportsWordTimestamps: true, supportsDiarization: true, supportsLanguageDetection: false, supportsKeywords: true, supportsTranslation: false, supportsEndOfTurn: false, notes: "Medical model, English locales; https://developers.deepgram.com/changelog/2026/10/7 accessed 2026-10-22." },
  { provider: "deepgram", id: "flux-general-en", name: "Flux General English", tier: "flagship", languages: ["en"], latency: "realtime", supportsBatch: false, supportsStreaming: true, supportsWordTimestamps: true, supportsDiarization: false, supportsLanguageDetection: false, supportsKeywords: true, supportsTranslation: false, supportsEndOfTurn: true, notes: "https://developers.deepgram.com/docs/flux/quickstart, accessed 2026-10-22." },
  { provider: "deepgram", id: "flux-general-multi", name: "Flux General Multi", tier: "flagship", languages: [], latency: "realtime", supportsBatch: false, supportsStreaming: true, supportsWordTimestamps: true, supportsDiarization: false, supportsLanguageDetection: false, supportsKeywords: true, supportsTranslation: false, supportsEndOfTurn: true, notes: "https://developers.deepgram.com/docs/flux/quickstart, accessed 2026-10-22." },
  { provider: "deepgram", id: "nova-2", name: "Nova-2 (legacy)", tier: "legacy", languages: [], latency: "standard", supportsBatch: true, supportsStreaming: true, supportsWordTimestamps: true, supportsDiarization: true, supportsLanguageDetection: true, supportsKeywords: false, supportsTranslation: false, supportsEndOfTurn: false, notes },
];

type Obj = Record<string, any>;
function wordsOf(items: Obj[] = []): TranscriptWord[] { return items.map(w => ({ text: String(w.punctuated_word ?? w.word ?? ""), startMs: Number(w.start ?? 0) * 1000, endMs: Number(w.end ?? 0) * 1000, ...(typeof w.confidence === "number" ? { confidence: w.confidence } : {}), ...(w.speaker !== undefined ? { speaker: String(w.speaker) } : {}) })); }
function errorFor(status: number, body: string, retryAfter?: string | null): VoiceEngineError {
  const code = codeFromStatus(status); const secs = retryAfter ? Number(retryAfter) : NaN;
  return new VoiceEngineError(body || `Deepgram request failed (${status})`, { provider: "deepgram", status, code, retryAfterMs: Number.isFinite(secs) ? secs * 1000 : undefined, details: body });
}
function socketStream(ctx: SttProviderContext, config: SttStreamConfig): Promise<SttStream> {
  const model = config.model ?? (config.endOfTurn ? "flux-general-en" : "nova-3");
  const flux = model.startsWith("flux-"); const query = new URLSearchParams({ model });
  if (config.encoding === "pcm16") { query.set("encoding", "linear16"); query.set("sample_rate", String(config.sampleRate)); }
  else if (config.encoding === "mulaw" || config.encoding === "alaw") { query.set("encoding", config.encoding); query.set("sample_rate", String(config.sampleRate)); }
  else query.set("sample_rate", String(config.sampleRate));
  if (config.channels) query.set("channels", String(config.channels));
  if (config.interimResults !== false) query.set("interim_results", "true");
  if (config.endpointingMs !== undefined) query.set(flux ? "eot_timeout_ms" : "endpointing", String(config.endpointingMs));
  if (config.wordTimestamps !== false) query.set("diarize", config.diarization ? "true" : "false");
  if (config.punctuation !== false) query.set("punctuate", "true");
  if (config.formatting !== false) query.set("smart_format", "true");
  if (config.diarization) query.set("diarize", "true");
  if (config.keywords?.length) for (const k of config.keywords) query.append(flux || model.includes("nova-3") ? "keyterm" : "keywords", typeof k === "string" ? k : k.term);
  if (flux && config.endOfTurn) query.set("eager_eot_threshold", "0.5");
  if (config.language && config.language !== "auto") query.set(flux ? "language_hint" : "language", config.language);
  const ws = (ctx.webSocket ?? defaultWebSocketFactory)(`wss://api.deepgram.com/${flux ? "v2" : "v1"}/listen?${query}`, { headers: { Authorization: `Token ${ctx.credentials.apiKey ?? ""}` } });
  return new Promise((resolve, reject) => {
    const queue: SttStreamEvent[] = []; let wake: (() => void) | undefined; let closed = false; let closeResolve: (() => void) | undefined;
    const emit = (e: SttStreamEvent) => { queue.push(e); wake?.(); wake = undefined; };
    const onAbort = () => { emit({ type: "error", error: new VoiceEngineError("Deepgram stream aborted", { code: "aborted", provider: "deepgram" }) }); ws.close(1000, "aborted"); };
    config.signal?.addEventListener("abort", onAbort, { once: true });
    ws.addEventListener("open", () => { emit({ type: "open" }); resolve(stream); });
    ws.addEventListener("error", (e: any) => { const err = new VoiceEngineError("Deepgram WebSocket error", { provider: "deepgram", code: "provider_unavailable", retryable: true, details: e }); if (!closed) emit({ type: "error", error: err }); if (!opened) reject(err); });
    let opened = false;
    const stream: SttStream = {
      send(chunk) { if (ws.readyState === WS_READY_STATE.OPEN) ws.send(chunk); },
      finalize() { if (ws.readyState === WS_READY_STATE.OPEN) ws.send(JSON.stringify({ type: "Finalize" })); },
      keepAlive() { if (ws.readyState === WS_READY_STATE.OPEN) ws.send(JSON.stringify({ type: "KeepAlive" })); },
      async close() { if (closed) return; if (ws.readyState === WS_READY_STATE.OPEN) ws.send(JSON.stringify({ type: "CloseStream" })); closeResolve = undefined; if (ws.readyState === WS_READY_STATE.CLOSED) { finish(); return; } await new Promise<void>(r => { closeResolve = r; setTimeout(() => { ws.close(1000, "client close"); r(); }, 1000); }); },
      events: { async *[Symbol.asyncIterator]() { while (!closed || queue.length) { if (!queue.length) await new Promise<void>(r => { wake = r; }); while (queue.length) yield queue.shift()!; } } },
    };
    ws.addEventListener("open", () => { opened = true; });
    ws.addEventListener("message", (event: any) => { try { const d = JSON.parse(typeof event.data === "string" ? event.data : String(event.data)) as Obj; if (d.type === "Results") { const alt = d.channel?.alternatives?.[0] ?? {}; const ww = wordsOf(alt.words); const base = Number(d.start ?? 0) * 1000; if (alt.transcript) emit({ type: d.is_final ? "final" : "interim", text: alt.transcript, words: ww.length ? ww : undefined, startMs: base, endMs: base + Number(d.duration ?? 0) * 1000, confidence: alt.confidence }); if (d.speech_final) emit({ type: "end_of_turn", text: alt.transcript, reason: "silence" }); } else if (d.type === "UtteranceEnd") emit({ type: "end_of_turn", reason: "silence" }); else if (d.type === "SpeechStarted") emit({ type: "speech_started", atMs: Number(d.timestamp ?? 0) * 1000 }); else if (["Metadata", "SessionBegins"].includes(d.type)) emit({ type: "metadata", data: d }); else if (d.type === "EndOfTurn" || d.type === "EagerEndOfTurn") emit({ type: "end_of_turn", text: d.transcript, confidence: d.confidence, reason: "semantic" }); else if (d.type === "TurnResumed") emit({ type: "metadata", data: d }); else if (d.type === "Error") emit({ type: "error", error: new VoiceEngineError(d.description ?? "Deepgram stream error", { provider: "deepgram", code: "invalid_request", details: d }) }); } catch (e) { emit({ type: "error", error: e }); } });
    const finish = () => { if (closed) return; closed = true; config.signal?.removeEventListener("abort", onAbort); emit({ type: "close" }); closeResolve?.(); wake?.(); };
    ws.addEventListener("close", (e: any) => { finish(); });
  });
}

/** Creates the Deepgram speech-to-text adapter. */
export function createDeepgramSttProvider(ctx: SttProviderContext): SttProvider {
  const fetcher = ctx.fetch;
  return {
    id: "deepgram", name: "Deepgram", capabilities: { batch: true, streaming: true, wordTimestamps: true, diarization: true, languageDetection: true, keywords: true, translation: false, endOfTurn: true, inputFormats: ["wav", "mp3", "flac", "ogg", "webm", "m4a"], streamEncodings: ["pcm16", "mulaw", "alaw", "opus", "ogg", "flac", "mp3"], languages: [] },
    async listModels() { return DEEPGRAM_STT_MODELS; }, defaultModel({ streaming, language } = {}) { return streaming ? language?.startsWith("en") ? "flux-general-en" : "nova-3" : "nova-3"; },
    async transcribe(req: TranscriptionRequest): Promise<TranscriptionResult> {
      const model = req.model ?? "nova-3"; const url = new URL(`${ctx.baseUrl ?? "https://api.deepgram.com"}/v1/listen`); const p = url.searchParams; p.set("model", model);
      if (req.language && req.language !== "auto") p.set("language", req.language); else if (req.languageHints?.length) p.set("language", req.languageHints.join(",")); else p.set("detect_language", "true");
      for (const [key, val] of [["smart_format", req.formatting], ["punctuate", req.punctuation], ["diarize", req.diarization?.enabled], ["utterances", req.wordTimestamps], ["filler_words", req.providerOptions?.fillerWords], ["profanity_filter", req.profanityFilter]] as Array<[string, unknown]>) if (val !== undefined) p.set(key, String(val));
      if (req.keywords) for (const k of req.keywords) p.append(model.startsWith("nova-3") ? "keyterm" : "keywords", typeof k === "string" ? k : k.term);
      if (req.translateTo) p.set("translate", req.translateTo); Object.entries(req.providerOptions ?? {}).forEach(([k,v]) => { if (v !== undefined) p.set(k, String(v)); });
      const audio = req.audio; const headers: Record<string,string> = { Authorization: `Token ${ctx.credentials.apiKey ?? ""}` };
      let body: BodyInit; if ("url" in audio) { p.set("url", audio.url); body = ""; } else { headers["Content-Type"] = audio.mimeType; body = audio.data as unknown as BodyInit; }
      const started = Date.now(); let response: Response; try { response = await fetcher(url, { method: "POST", headers, body, signal: req.signal }); } catch (e) { if (req.signal?.aborted) throw new VoiceEngineError("Deepgram request aborted", { code:"aborted", provider:"deepgram", cause:e }); throw new VoiceEngineError("Deepgram request failed", { code:"provider_unavailable", provider:"deepgram", retryable:true, cause:e }); }
      if (!response.ok) throw errorFor(response.status, await response.text(), response.headers.get("retry-after")); const d = await response.json() as Obj; const ch = d.results?.channels?.[0]; const alt = ch?.alternatives?.[0] ?? {}; const words = wordsOf(alt.words); const segments = (d.results?.utterances ?? []).map((u: Obj) => ({ text: String(u.transcript ?? ""), startMs: Number(u.start ?? 0)*1000, endMs: Number(u.end ?? 0)*1000, ...(u.speaker !== undefined ? { speaker:String(u.speaker) } : {}) })); const duration = seconds(d.metadata?.duration);
      return { text: String(alt.transcript ?? ""), language: alt.languages?.[0] ?? req.languageHints?.[0] ?? (req.language === "auto" ? undefined : req.language), words: words.length ? words : undefined, segments: segments.length ? segments : undefined, durationMs: duration === undefined ? undefined : duration*1000, provider:"deepgram", model, requestId:d.metadata?.request_id, latencyMs:Date.now()-started, raw:d, usage:{ provider:"deepgram", model, operation:"transcribe", unit: duration === undefined ? "request" : "second", units:duration ?? 1, estimatedCents:null, pricingSource:"Plan-dependent; Deepgram pricing https://deepgram.com/pricing accessed 2026-10-22" } };
    }, openStream(config) { return socketStream(ctx, config); },
  };
}
export const deepgramSttProvider: SttProviderDefinition = { id:"deepgram", name:"Deepgram", docsUrl:"https://developers.deepgram.com/docs", credentialEnv:{apiKey:["DEEPGRAM_API_KEY"]}, requiredCredentials:["apiKey"], create:createDeepgramSttProvider };

/** Parse a duration in seconds from an untyped provider field. */
function seconds(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}
