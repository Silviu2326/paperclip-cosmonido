import { VoiceEngineError, codeFromStatus } from "../../../core/errors.js";
import type { RealtimeProviderContext, RealtimeProviderDefinition, RealtimeSession, RealtimeSessionConfig, RealtimeEvent } from "../../types.js";
import type { WebSocketLike } from "../../../core/types.js";
import { defaultWebSocketFactory } from "../../../net/websocket.js";

const MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";
const ENDPOINT = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";
const DOCS = "https://ai.google.dev/gemini-api/docs/live-api/get-started-websocket";
export const geminiLiveProvider: RealtimeProviderDefinition = { id: "gemini", name: "Gemini Live", docsUrl: DOCS, credentialEnv: { apiKey: ["GEMINI_API_KEY", "GOOGLE_API_KEY"] }, requiredCredentials: ["apiKey"], create: createGeminiLiveProvider };

/** Creates a Gemini Live WebSocket provider. */
export function createGeminiLiveProvider(context: RealtimeProviderContext) {
  return { id: "gemini" as const, name: "Gemini Live", models: [MODEL], async connect(config: RealtimeSessionConfig): Promise<RealtimeSession> {
    if (config.inputFormat.encoding !== "pcm16" || config.inputFormat.sampleRate !== 16000) throw new VoiceEngineError("Gemini Live input requires pcm16 at 16 kHz", { code: "unsupported", provider: "gemini" });
    if (config.outputFormat.encoding !== "pcm16" || config.outputFormat.sampleRate !== 24000) throw new VoiceEngineError("Gemini Live output requires pcm16 at 24 kHz", { code: "unsupported", provider: "gemini" });
    const url = `${context.baseUrl ?? ENDPOINT}?key=${encodeURIComponent(context.credentials.apiKey ?? "")}`;
    const socket = (context.webSocket ?? defaultWebSocketFactory)(url);
    return connectSocket(socket, config);
  } };
}

function connectSocket(socket: WebSocketLike, config: RealtimeSessionConfig): Promise<RealtimeSession> {
  return new Promise((resolve, reject) => {
    const queue: RealtimeEvent[] = []; let wake: (() => void) | undefined; let closed = false; let ready = false;
    const emit = (e: RealtimeEvent) => { queue.push(e); wake?.(); wake = undefined; };
    const send = (v: unknown) => { if (socket.readyState === 1) socket.send(JSON.stringify(v)); };
    const fail = (error: unknown) => { const mapped = error instanceof VoiceEngineError ? error : new VoiceEngineError("Gemini Live WebSocket failed", { code: "provider_unavailable", provider: "gemini", retryable: true, cause: error }); emit({ type: "error", error: mapped }); if (!ready) reject(mapped); };
    const abort = () => { socket.close(1000, "aborted"); fail(new VoiceEngineError("Realtime session aborted", { code: "aborted", provider: "gemini" })); };
    const timer = setTimeout(() => { fail(new VoiceEngineError("Gemini Live setup timed out", { code: "timeout", provider: "gemini", retryable: true })); socket.close(); }, 30000);
    const onOpen = () => {
      const setup = { model: `models/${config.model ?? MODEL}`, generationConfig: { responseModalities: ["AUDIO"], speechConfig: config.voice ? { voiceConfig: { prebuiltVoiceConfig: { voiceName: config.voice } } } : undefined, ...(config.temperature !== undefined ? { temperature: config.temperature } : {}) }, systemInstruction: { parts: [{ text: config.instructions }] }, ...(config.tools?.length ? { tools: [{ functionDeclarations: config.tools.map(t => ({ name: t.name, description: t.description, parameters: t.inputSchema })) }] } : {}), realtimeInputConfig: config.turnDetection?.mode === "manual" ? { automaticActivityDetection: { disabled: true } } : { automaticActivityDetection: { ...(config.turnDetection?.silenceMs !== undefined ? { silenceDurationMs: config.turnDetection.silenceMs } : {}), ...(config.turnDetection?.threshold !== undefined ? { prefixPaddingMs: config.turnDetection.threshold } : {}) } }, ...(config.inputTranscription ? { inputAudioTranscription: {} } : {}), outputAudioTranscription: {} };
      send({ setup });
    };
    const onMessage = (ev: any) => { let m: any; try { m = JSON.parse(typeof ev.data === "string" ? ev.data : new TextDecoder().decode(ev.data)); } catch (e) { emit({ type: "error", error: new VoiceEngineError("Invalid JSON from Gemini Live", { code: "invalid_request", provider: "gemini", cause: e }) }); return; }
      if (m.setupComplete) { ready = true; clearTimeout(timer); emit({ type: "open" }); resolve(session); }
      if (m.error) { const status = Number(m.error.code); emit({ type: "error", error: new VoiceEngineError(m.error.message ?? "Gemini Live error", { code: Number.isFinite(status) ? codeFromStatus(status) : "invalid_request", provider: "gemini", status: Number.isFinite(status) ? status : undefined, details: m.error }) }); }
      if (m.serverContent) { const sc = m.serverContent; if (sc.interrupted) emit({ type: "interrupted" }); if (sc.inputTranscription?.text) emit({ type: "user_transcript", text: sc.inputTranscription.text, final: true }); if (sc.outputTranscription?.text) emit({ type: "assistant_transcript", text: sc.outputTranscription.text, final: true }); for (const p of sc.modelTurn?.parts ?? []) if (p.inlineData?.data) emit({ type: "audio", data: decode(p.inlineData.data), format: config.outputFormat }); if (sc.turnComplete) emit({ type: "response_done", usage: m.usageMetadata ? { inputTokens: m.usageMetadata.promptTokenCount ?? 0, outputTokens: m.usageMetadata.responseTokenCount ?? 0, audioInputTokens: m.usageMetadata.promptTokensDetails?.find((x: any) => x.modality === "AUDIO")?.tokenCount, audioOutputTokens: m.usageMetadata.responseTokensDetails?.find((x: any) => x.modality === "AUDIO")?.tokenCount } : undefined }); }
      for (const call of m.toolCall?.functionCalls ?? []) { let args: any = call.args ?? {}; emit({ type: "tool_call", call: { id: call.id, name: call.name, arguments: args } }); }
      if (m.goAway) emit({ type: "error", error: new VoiceEngineError("Gemini Live server will disconnect soon", { code: "provider_unavailable", provider: "gemini", retryable: true, details: m.goAway }) });
    };
    const onClose = (ev: any) => { closed = true; clearTimeout(timer); emit({ type: "close", code: ev.code, reason: ev.reason }); if (!ready) reject(new VoiceEngineError("Gemini Live setup failed", { code: ev.code === 1008 ? "auth" : "provider_unavailable", provider: "gemini", status: ev.code === 1008 ? 401 : undefined })); };
    socket.addEventListener("open", onOpen); socket.addEventListener("message", onMessage); socket.addEventListener("error", fail); socket.addEventListener("close", onClose);
    config.signal?.addEventListener("abort", abort, { once: true }); if (config.signal?.aborted) abort();
    const session: RealtimeSession = { sendAudio: chunk => send({ realtimeInput: { audio: { data: encode(chunk), mimeType: "audio/pcm;rate=16000" } } }), sendText: (text, options) => { send({ realtimeInput: { text } }); if (options?.respond === false) send({ clientContent: { turns: [{ role: "user", parts: [{ text }] }], turnComplete: false } }); }, sendToolResult: (callId, content, isError) => send({ toolResponse: { functionResponses: [{ id: callId, response: isError ? { error: content } : { result: content } }] } }), interrupt: () => send({ realtimeInput: { activityStart: {} } }), commit: () => send({ realtimeInput: { audioStreamEnd: true } }), close: () => new Promise<void>(r => { if (closed) return r(); socket.addEventListener("close", () => r()); socket.close(1000, "client close"); }), events: { [Symbol.asyncIterator]: () => ({ next: async () => { while (!queue.length && !closed) await new Promise<void>(r => { wake = r; }); return queue.length ? { value: queue.shift()!, done: false } : { value: undefined as any, done: true }; } }) } };
  });
}
function encode(b: Uint8Array) { let s = ""; for (const x of b) s += String.fromCharCode(x); return btoa(s); }
function decode(s = "") { const v = atob(s); return Uint8Array.from(v, c => c.charCodeAt(0)); }
