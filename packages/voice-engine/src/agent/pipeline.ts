import type { AgentEvent, AgentState, TurnMetrics, VoiceAgent, VoiceAgentConfig, VoiceAgentDependencies } from "./types.js";
import type { LlmMessage } from "../llm/types.js";
import { convertFrame, frameDurationMs } from "./codecs.js";
import { SentenceChunker } from "./chunker.js";

/** Create a streaming STT → LLM → TTS conversational agent. */
export function createVoiceAgent(deps: VoiceAgentDependencies, config: VoiceAgentConfig): VoiceAgent {
  const now = deps.now ?? (() => Date.now()); let state: AgentState = "idle", turnId = 0, stopped = false, running = false;
  let history: LlmMessage[] = []; let turnAbort: AbortController | undefined; let playbackText = ""; let playbackMs = 0; let speechMs = 0; let stream: Awaited<ReturnType<typeof deps.stt.openStream>> | undefined; let silenceTimer: ReturnType<typeof setTimeout> | undefined; let pendingTranscript = ""; let lastFinalAt = 0; let turnStartedAt = 0; let activeMetrics: TurnMetrics | undefined;
  const events: AgentEvent[] = []; const waiters: Array<(r: IteratorResult<AgentEvent>) => void> = [];
  const emit = (event: AgentEvent) => { const w = waiters.shift(); w ? w({ value: event, done: false }) : events.push(event); };
  const eventIterable: AsyncIterable<AgentEvent> = { [Symbol.asyncIterator]() { return { next: () => events.length ? Promise.resolve({ value: events.shift()!, done: false }) : stopped ? Promise.resolve({ value: undefined, done: true }) : new Promise(resolve => waiters.push(resolve)) }; } };
  const setState = (s: AgentState, id = turnId) => { state = s; emit({ type: "state", state: s, turnId: id }); };
  const finish = (reason: "transport_closed" | "stopped" | "error") => { if (stopped) return; stopped = true; emit({ type: "ended", reason }); for (const w of waiters.splice(0)) w({ value: undefined, done: true }); };
  const speak = async (text: string, signal?: AbortSignal): Promise<void> => {
    const req = { text, voice: config.tts.voice, model: config.tts.model, language: config.tts.language, format: config.tts.format, settings: config.tts.settings, signal };
    try {
      let found = false;
      for await (const c of deps.tts.synthesizeStream(req)) { if (signal?.aborted || stopped) return; found = true; const frame = convertFrame({ data: c.audio, encoding: encodingFor(config.tts.format?.container), sampleRate: config.tts.format?.sampleRate ?? 24000, channels: 1 }, deps.transport.outputFormat); deps.transport.sendAudio(frame); playbackMs += frameDurationMs(frame); if (activeMetrics && activeMetrics.ttsFirstByteMs === undefined) activeMetrics.ttsFirstByteMs = now() - turnStartedAt; }
      if (found) { playbackText += text; return; }
    } catch (e) { if (signal?.aborted) return; }
    if (signal?.aborted || stopped) return;
    const r = await deps.tts.synthesize(req); const frame = convertFrame({ data: r.audio.data, encoding: encodingFor(r.audio.format.container), sampleRate: r.audio.format.sampleRate ?? 24000, channels: 1 }, deps.transport.outputFormat); deps.transport.sendAudio(frame); playbackMs += frameDurationMs(frame); playbackText += text; if (activeMetrics && activeMetrics.ttsFirstByteMs === undefined) activeMetrics.ttsFirstByteMs = now() - turnStartedAt;
  };
  const speakChunks = async (text: string, signal?: AbortSignal) => { const c = new SentenceChunker({ minClauseWords: config.turn.minClauseWords, firstChunkFlushMs: config.turn.firstChunkFlushMs }); const chunks = [...c.push(text), ...c.flush()]; await Promise.all(chunks.map(x => speak(x, signal))); };
  const ask = async (userText: string, id: number): Promise<void> => {
    if (!userText.trim() || isFiller(userText)) return;
    turnId = id; const start = now(); turnStartedAt = start; const metrics: TurnMetrics = { turnId: id, interrupted: false, sttProvider: config.stt.provider, sttFinalMs: 0, endOfTurnMs: lastFinalAt ? start - lastFinalAt : 0 }; activeMetrics = metrics; history.push({ role: "user", content: userText }); setState("thinking", id); playbackText = ""; playbackMs = 0; turnAbort = new AbortController();
    const signal = turnAbort.signal; let messages = trim(history, config.llm.maxHistoryMessages ?? 30);
    try {
      for (let step = 0; step < 5; step++) {
        const chunker = new SentenceChunker({ minClauseWords: config.turn.minClauseWords, firstChunkFlushMs: config.turn.firstChunkFlushMs }); let full = ""; let result: import("../llm/types.js").LlmResult | undefined; const jobs: Promise<void>[] = [];
        metrics.llmProvider = config.llm.provider; metrics.ttsProvider = "engine";
        for await (const ev of deps.llm.stream({ messages, model: config.llm.model, provider: config.llm.provider, temperature: config.llm.temperature, maxTokens: config.llm.maxTokens, tools: config.llm.tools, signal, reasoning: config.llm.reasoning ? { effort: config.llm.reasoning } : undefined })) {
          if (signal.aborted) return;
          if (ev.type === "text_delta") { if (metrics.llmTtftMs === undefined) metrics.llmTtftMs = now() - start; full += ev.text; emit({ type: "assistant_text", text: ev.text, turnId: id, final: false }); for (const part of chunker.push(ev.text)) { if (state !== "speaking") setState("speaking", id); if (!metrics.firstAudioMs) metrics.firstAudioMs = now() - start; jobs.push(speak(part, signal)); } }
          else if (ev.type === "done") result = ev.result;
        }
        for (const part of chunker.flush()) { if (state !== "speaking") setState("speaking", id); jobs.push(speak(part, signal)); }
        await Promise.all(jobs); if (signal.aborted) return;
        emit({ type: "assistant_text", text: "", turnId: id, final: true });
        if (!result?.toolCalls.length) { history.push({ role: "assistant", content: full || result?.text || "" }); break; }
        const calls = result.toolCalls; history.push({ role: "assistant", content: [...(full ? [{ type: "text" as const, text: full }] : []), ...calls.map(c => ({ type: "tool_call" as const, id: c.id, name: c.name, arguments: c.arguments }))] });
        const outputs = await Promise.all(calls.map(async call => { emit({ type: "tool_call", call, turnId: id }); const out = config.llm.toolHandler ? await config.llm.toolHandler(call) : { content: "No tool handler configured", isError: true }; const content = typeof out === "string" ? out : out.content; emit({ type: "tool_result", callId: call.id, content, isError: typeof out === "string" ? false : !!out.isError, turnId: id }); return { role: "tool" as const, name: call.name, content } satisfies LlmMessage; })); history.push(...outputs); messages = trim(history, config.llm.maxHistoryMessages ?? 30);
      }
      if (!signal.aborted) { setState("listening", id); emit({ type: "metrics", metrics }); }
    } catch (error) { if (!signal.aborted) { emit({ type: "error", error, turnId: id, recoverable: true }); setState("listening", id); emit({ type: "metrics", metrics }); } }
  };
  const handleAudio = async (frame: import("./types.js").AgentAudioFrame) => {
    if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = undefined; }
    const vadSpeech = config.vad?.process(convertFrame(frame, { encoding: "pcm16", sampleRate: frame.sampleRate })).isSpeech ?? false;
    if (state === "speaking" && config.turn.bargeIn && vadSpeech) { speechMs += frameDurationMs(frame); if (speechMs >= config.turn.bargeInMinSpeechMs) agent.interrupt(); } else if (!vadSpeech) speechMs = 0;
    try { stream ??= await deps.stt.openStream({ provider: config.stt.provider, model: config.stt.model, language: config.stt.language, encoding: "pcm16", sampleRate: 16000, interimResults: true, endpointingMs: config.stt.endpointingMs, keywords: config.stt.keywords, endOfTurn: config.stt.useProviderEndpointing ?? true }); stream.send(convertFrame(frame, { encoding: "pcm16", sampleRate: 16000 }).data); }
    catch (error) { emit({ type: "error", error, turnId, recoverable: false }); finish("error"); }
  };
  const agent: VoiceAgent = {
    get state() { return state; }, get history() { return history; }, events: eventIterable,
    async run() { if (running || stopped) return; running = true; setState("listening"); if (config.greeting) await speakChunks(config.greeting); const sttPump = (async () => { while (!stopped) { const current = stream; if (!current) { await new Promise(r => setTimeout(r, 5)); continue; } for await (const ev of current.events) { if (stopped) return; if (ev.type === "interim") emit({ type: "user_interim", text: ev.text, turnId }); else if (ev.type === "final") { emit({ type: "user_final", text: ev.text, turnId }); lastFinalAt = now(); if (!isFiller(ev.text)) pendingTranscript = `${pendingTranscript} ${ev.text}`.trim(); if (silenceTimer) clearTimeout(silenceTimer); silenceTimer = setTimeout(async () => { const result = config.endOfTurn ? await config.endOfTurn.analyze({ transcript: pendingTranscript, silenceMs: config.turn.silenceEndpointMs, language: config.stt.language, history }) : { endOfTurn: true, confidence: 1 }; if (result.endOfTurn && pendingTranscript) { const final = pendingTranscript; pendingTranscript = ""; await ask(final, turnId + 1); } }, config.turn.silenceEndpointMs); } else if (ev.type === "end_of_turn") { const final = ev.text?.trim() || pendingTranscript; pendingTranscript = ""; if (silenceTimer) clearTimeout(silenceTimer); silenceTimer = undefined; if (final) await ask(final, turnId + 1); } else if (ev.type === "speech_started" && state === "speaking") speechMs = 0; else if (ev.type === "error") { emit({ type: "error", error: ev.error, turnId, recoverable: true }); stream = undefined; break; } } } })(); try { for await (const f of deps.transport.inbound) { if (stopped) break; await handleAudio(f); } } finally { if (silenceTimer) clearTimeout(silenceTimer); if (!stopped) finish("transport_closed"); } await sttPump; },
    async say(text) { turnAbort?.abort(); setState("speaking"); await speakChunks(text); setState("listening"); },
    async injectUser(text) { await ask(text, turnId + 1); },
    interrupt() { const id = turnId; turnAbort?.abort(); deps.transport.clearPlayback(); const spokenText = playbackText; if (activeMetrics) { activeMetrics.interrupted = true; emit({ type: "metrics", metrics: activeMetrics }); } if (history.at(-1)?.role === "assistant") history[history.length - 1] = { role: "assistant", content: `${spokenText}${config.turn.bargeIn ? "" : " [interrupted]"}` }; else history.push({ role: "assistant", content: spokenText }); emit({ type: "interrupted", turnId: id, spokenText }); setState("interrupted", id); setState("user_speaking", id); },
    async stop() { if (stopped) return; if (silenceTimer) clearTimeout(silenceTimer); turnAbort?.abort(); await stream?.close(); await deps.transport.close(); finish("stopped"); },
  };
  return agent;
}
function encodingFor(container?: string): "pcm16" | "mulaw" | "alaw" { return container === "mulaw" ? "mulaw" : container === "alaw" ? "alaw" : "pcm16"; }
function trim(h: LlmMessage[], n: number): LlmMessage[] { return h.slice(-Math.max(1, n)); }
function isFiller(s: string): boolean { return /^(?:\s|uh+|um+|hmm+|eh+|mm+|este|pues|euh|äh|hum|ehm|ok(?:ay)?)[,.!?\s]*$/iu.test(s); }
