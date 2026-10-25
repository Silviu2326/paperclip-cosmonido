import { VoiceEngineError, codeFromStatus } from "../../../core/errors.js";
import type { RealtimeProviderContext, RealtimeProviderDefinition, RealtimeSession, RealtimeSessionConfig, RealtimeEvent } from "../../types.js";
import type { WebSocketLike } from "../../../core/types.js";
import { defaultWebSocketFactory } from "../../../net/websocket.js";

const MODEL = "gpt-realtime-2.1";
const DOCS = "https://platform.openai.com/docs/guides/realtime";
export const openAiRealtimeProvider: RealtimeProviderDefinition = { id: "openai", name: "OpenAI Realtime", docsUrl: DOCS, credentialEnv: { apiKey: ["OPENAI_API_KEY"] }, requiredCredentials: ["apiKey"], create: createOpenAiRealtimeProvider };

/** Creates an OpenAI Realtime WebSocket provider. */
export function createOpenAiRealtimeProvider(context: RealtimeProviderContext) {
  return { id: "openai" as const, name: "OpenAI Realtime", models: [MODEL], async connect(config: RealtimeSessionConfig): Promise<RealtimeSession> {
    validate(config, "openai");
    const base = context.baseUrl ?? "wss://api.openai.com/v1/realtime";
    const url = `${base}${base.includes("?") ? "&" : "?"}model=${encodeURIComponent(config.model ?? MODEL)}`;
    const socket = (context.webSocket ?? defaultWebSocketFactory)(url, { headers: { Authorization: `Bearer ${context.credentials.apiKey}` } });
    return connectSocket(socket, config, "openai");
  } };
}

function validate(c: RealtimeSessionConfig, provider: string) {
  if (c.inputFormat.encoding !== "pcm16" && c.inputFormat.sampleRate !== 8000) throw new VoiceEngineError("OpenAI input supports pcm16 at 24 kHz or G.711 at 8 kHz", { code: "unsupported", provider });
  if (c.inputFormat.encoding === "pcm16" && c.inputFormat.sampleRate !== 24000) throw new VoiceEngineError("OpenAI PCM input must be 24 kHz", { code: "unsupported", provider });
  if (c.outputFormat.encoding !== "pcm16" && c.outputFormat.sampleRate !== 8000) throw new VoiceEngineError("OpenAI output supports pcm16 at 24 kHz or G.711 at 8 kHz", { code: "unsupported", provider });
  if (c.outputFormat.encoding === "pcm16" && c.outputFormat.sampleRate !== 24000) throw new VoiceEngineError("OpenAI PCM output must be 24 kHz", { code: "unsupported", provider });
}

function connectSocket(socket: WebSocketLike, config: RealtimeSessionConfig, provider: string): Promise<RealtimeSession> {
  return new Promise((resolve, reject) => {
    const queue: RealtimeEvent[] = []; let wake: (() => void) | undefined; let closed = false; let ready = false;
    const emit = (e: RealtimeEvent) => { queue.push(e); wake?.(); wake = undefined; };
    const send = (v: unknown) => { if (socket.readyState === 1) socket.send(JSON.stringify(v)); };
    const fail = (error: unknown) => { const mapped = error instanceof VoiceEngineError ? error : new VoiceEngineError("OpenAI Realtime WebSocket failed", { code: "provider_unavailable", provider, retryable: true, cause: error }); emit({ type: "error", error: mapped }); if (!ready) reject(mapped); };
    const abort = () => { socket.close(1000, "aborted"); fail(new VoiceEngineError("Realtime session aborted", { code: "aborted", provider })); };
    const timer = setTimeout(() => { fail(new VoiceEngineError("Realtime handshake timed out", { code: "timeout", provider, retryable: true })); socket.close(); }, 30000);
    const onOpen = () => {
      const input = config.inputFormat.encoding === "pcm16" ? "pcm16" : config.inputFormat.encoding === "mulaw" ? "g711_ulaw" : "g711_alaw";
      const output = config.outputFormat.encoding === "pcm16" ? "pcm16" : config.outputFormat.encoding === "mulaw" ? "g711_ulaw" : "g711_alaw";
      const td = config.turnDetection?.mode === "manual" ? null : { type: config.turnDetection?.mode ?? "server_vad", ...(config.turnDetection?.silenceMs ? { silence_duration_ms: config.turnDetection.silenceMs } : {}), ...(config.turnDetection?.threshold ? { threshold: config.turnDetection.threshold } : {}), ...(config.turnDetection?.interruptResponse !== undefined ? { interrupt_response: config.turnDetection.interruptResponse } : {}) };
      send({ type: "session.update", session: { type: "realtime", instructions: config.instructions, ...(config.voice ? { voice: config.voice } : {}), audio: { input: { format: { type: input, rate: config.inputFormat.sampleRate }, transcription: config.inputTranscription ? { model: "gpt-4o-mini-transcribe" } : undefined, turn_detection: td }, output: { format: { type: output, rate: config.outputFormat.sampleRate } }, ...(config.tools?.length ? { tools: config.tools.map(t => ({ type: "function", name: t.name, description: t.description, parameters: t.inputSchema, strict: t.strict })) } : {}), ...(config.temperature !== undefined ? { temperature: config.temperature } : {}) } } });
      ready = true; clearTimeout(timer); emit({ type: "open" }); resolve(session);
    };
    const onMessage = (ev: any) => { let m: any; try { m = JSON.parse(typeof ev.data === "string" ? ev.data : new TextDecoder().decode(ev.data)); } catch (e) { emit({ type: "error", error: new VoiceEngineError("Invalid JSON from OpenAI Realtime", { code: "invalid_request", provider, cause: e }) }); return; }
      if (m.type === "error") { const status = m.error?.code === "invalid_api_key" ? 401 : undefined; emit({ type: "error", error: new VoiceEngineError(m.error?.message ?? "OpenAI Realtime error", { code: status ? codeFromStatus(status) : "invalid_request", provider, status, details: m.error }) }); return; }
      const responseId = m.response_id ?? m.item_id;
      if (m.type === "response.audio.delta" || m.type === "response.output_audio.delta") emit({ type: "audio", data: decode(m.delta), format: config.outputFormat, responseId });
      if (m.type === "response.audio_transcript.delta" || m.type === "response.output_audio_transcript.delta") emit({ type: "assistant_transcript", text: m.delta ?? "", final: false, responseId });
      if (m.type === "response.audio_transcript.done" || m.type === "response.output_audio_transcript.done") emit({ type: "assistant_transcript", text: m.transcript ?? "", final: true, responseId });
      if (m.type === "conversation.item.input_audio_transcription.completed" || m.type === "input_audio_transcription.completed") emit({ type: "user_transcript", text: m.transcript ?? "", final: true });
      if (m.type === "input_audio_buffer.speech_started") emit({ type: "speech_started" }); if (m.type === "input_audio_buffer.speech_stopped") emit({ type: "speech_stopped" });
      if (m.type === "response.function_call_arguments.done") { let args: any = {}; try { args = JSON.parse(m.arguments || "{}"); } catch {} emit({ type: "tool_call", call: { id: m.call_id, name: m.name, arguments: args } }); }
      if (m.type === "response.done") { const u = m.response?.usage; emit({ type: "response_done", responseId: m.response?.id, ...(u ? { usage: { inputTokens: u.total_tokens ?? 0, outputTokens: 0, audioInputTokens: u.input_token_details?.audio_tokens, audioOutputTokens: u.output_token_details?.audio_tokens } } : {}) }); }
    };
    const onClose = (ev: any) => { closed = true; clearTimeout(timer); emit({ type: "close", code: ev.code, reason: ev.reason }); if (!ready) reject(new VoiceEngineError("OpenAI Realtime handshake failed", { code: ev.code === 1008 ? "auth" : "provider_unavailable", provider, status: ev.code === 1008 ? 401 : undefined })); };
    socket.addEventListener("open", onOpen); socket.addEventListener("message", onMessage); socket.addEventListener("error", fail); socket.addEventListener("close", onClose);
    config.signal?.addEventListener("abort", abort, { once: true }); if (config.signal?.aborted) abort();
    const session: RealtimeSession = { sendAudio: chunk => send({ type: "input_audio_buffer.append", audio: encode(chunk) }), sendText: (text, options) => { send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text }] } }); if (options?.respond !== false) send({ type: "response.create" }); }, sendToolResult: (callId, content, isError) => { send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: callId, output: isError ? JSON.stringify({ error: content }) : content } }); send({ type: "response.create" }); }, interrupt: options => { send({ type: "response.cancel" }); if (options?.playedMs !== undefined) send({ type: "conversation.item.truncate", item_id: "", content_index: 0, audio_end_ms: options.playedMs }); }, commit: () => { send({ type: "input_audio_buffer.commit" }); send({ type: "response.create" }); }, close: () => new Promise<void>(r => { if (closed) return r(); socket.addEventListener("close", () => r()); socket.close(1000, "client close"); }), events: { [Symbol.asyncIterator]: () => ({ next: async () => { while (!queue.length && !closed) await new Promise<void>(r => { wake = r; }); return queue.length ? { value: queue.shift()!, done: false } : { value: undefined as any, done: true }; } }) } };
  });
}
function encode(b: Uint8Array) { let s = ""; for (const x of b) s += String.fromCharCode(x); return btoa(s); }
function decode(s = "") { const v = atob(s); return Uint8Array.from(v, c => c.charCodeAt(0)); }
