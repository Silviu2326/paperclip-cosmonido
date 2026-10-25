# Real-time voice agents: infrastructure research and recommended STT -> LLM -> TTS architecture

Snapshot date: 2026-10-22. Scope: official docs first; third-party pricing trackers are labelled as such.

Confidence legend: **[official]** read from a vendor doc page in this pass; **[3rd-party]** from a tracker or blog; **[unverified]** could not be checked in this pass (official page redirected, 404, or not researched). Dates on pricing are the date of the source, not of the price.

---

## 0. Caveats on this report

- Several official pages could not be read (Deepgram docs redirected to a portal, Cartesia docs redirected to a login, ElevenLabs formats page 404, Vapi pricing 404). Those rows are marked and should be re-checked before any budget decision.
- OpenAI naming is inconsistent across pages captured today: `gpt-realtime` (model page, default snapshot `gpt-realtime-2025-08-28`), `gpt-realtime-2.1` (WebSocket page), and a separate "GPT-Live" API. Treat exact model IDs as needing a live check.
- Hume's EVI and TTS APIs are being sunset; access ends **2026-11-13** [official]. Do not adopt.
- The package brief (`packages/voice-engine/BRIEF.md`) requires zero runtime dependencies. Several recommendations below (ONNX Silero, a Python turn-detector sidecar) conflict with that rule. This is flagged in section 6.

---

## 1. Speech-to-speech / realtime model APIs

| Provider | Protocol | Audio formats / rates | Auth | Pricing (source date) | Latency | Languages | Tool calling | Usable as protocol without hosted platform? |
|---|---|---|---|---|---|---|---|---|
| **OpenAI Realtime** (`gpt-realtime`) | WebSocket `wss://api.openai.com/v1/realtime?model=...`; WebRTC; SIP | GPT-Live (separate API, same docs page): `audio/pcm` 24 kHz default, 16 kHz, `audio/pcmu` and `audio/pcma` (G.711) at 8 kHz; base64 raw bytes, no header [official, undated page]. Realtime sample rates not captured in this pass. | `Authorization: Bearer` server-side; ephemeral keys for browsers; WebRTC recommended for clients [official] | Audio $32/1M input, $0.40/1M cached, $64/1M output; text $4 in / $16 out [official model page, captured 2026-10-22]. June 2026 press reports the same audio rates for a newer model [3rd-party]. Budget by audio tokens, not minutes; a community thread reports audio-input overruns on a preview model [3rd-party]. | No official figure captured [unverified] | Multilingual (not enumerated here) | Yes, function calling [official] | Yes. Plain WebSocket/WebRTC protocol; no lock to a hosted UI. |
| **Google Gemini Live** | WebSocket (WSS), stateful; server-to-server or client-to-server with ephemeral tokens [official] | Input: raw 16-bit PCM **16 kHz** LE. Output: raw 16-bit PCM **24 kHz** LE. Images as JPEG up to 1 fps [official] | API key server-side; ephemeral tokens for browsers [official] | Not on the page captured [unverified]. Model IDs not named on the page [official]. | No figure [unverified] | 70 languages (Live Translation: "70+") [official] | Function calling and Google Search [official] | Yes, raw WebSocket protocol. |
| **xAI realtime voice** | WebSocket (endpoint not captured) [official, partial] | Not captured [unverified] | API key [unverified] | Per minute or per token; rates not captured [official, partial] | No figure | Not listed | Yes: custom functions, remote MCP, web/X search [official] | Likely yes (WebSocket), not confirmed. |
| **Hume EVI** | WebSocket; REST with `X-HUME-API-KEY`; SDKs [official] | Not captured | API key | Subscription tiers with concurrency limits; no rate captured [official] | No figure | EVI 4-mini: 11 languages; EVI 3: English only [official] | Not captured | Yes, but **sunset: access ends 2026-11-13** [official]. **Do not adopt.** |
| **ElevenLabs Agents** | WebSocket API and SDKs (React, iOS, Android, RN); SIP trunking [official] | Not captured (formats page returned 404) [unverified] | API key | Not on captured page [unverified] | "Low-latency", no number [official] | 31 languages for voice/language config vs 70+ for TTS, unreconciled [official] | Yes, via Tools [official] | Probably, via WebSocket API; not explicitly confirmed. |
| **Cartesia Line** | Managed platform; you write Python with the Line SDK and deploy via the `cartesia` CLI [3rd-party skill listing; official page redirected to login] | Not captured | Cartesia account | Not captured [unverified] | Not captured | Not captured | Not captured | **No**: a proprietary managed platform with an SDK, not a self-hostable framework [3rd-party]. |
| **Deepgram Voice Agent API** | WebSocket [3rd-party; official docs redirected] | Not captured [unverified] | API key | Per minute; tiers Standard $0.075, BYO-TTS $0.065, BYO-LLM $0.056, BYO-LLM+TTS $0.050, Advanced $0.163 per minute [3rd-party, Aug–Sep 2026]. Flux STT about $0.0065–0.0077/min [3rd-party]. A Flux TTS promotion ended 2026-09-12 [3rd-party]. | Not captured | Not captured | Not captured | Partly: the STT (Flux) can be used alone. |
| **Amazon Nova Sonic** | Bedrock `InvokeModelWithBidirectionalStream` over HTTP/2; model `amazon.nova-sonic-v1:0` [3rd-party summaries; official AWS pages not fetched] | Not captured | AWS IAM / Bedrock | Conflicting: $4.50/M input and $17/M output speech tokens vs about $3.40/M and $13.60/M [3rd-party, undated] | Not captured | Original: English (US/UK). Nova 2 Sonic reportedly adds Spanish, French, Italian, German, Hindi [3rd-party, unverified] | Not captured | No: AWS-hosted only. |
| **Moshi (Kyutai)** | Local server: Python on `localhost:8998`, Rust server on HTTPS, WebRTC via gradio-webrtc demo [official repo] | Mimi codec: 24 kHz audio, 12.5 Hz token rate, 80 ms frames, ~1.1 kbps [official] | None (self-hosted) | Free; weights CC-BY 4.0; code MIT (Python), Apache (Rust) [official] | Theoretical 160 ms; practical "as low as 200 ms" on an L4 GPU [official, the repo's claim] | Not stated | Not mentioned | **Yes**, fully self-hostable. Research-grade. |
| **Ultravox** (Fixie) | Hosted API; BYO voice and external TTS supported [official docs] | Wrapper defaults only: 16 kHz in, 24 kHz out (from LiveKit plugin) [3rd-party, unverified] | API key | $0.05/min pay-as-you-go; SIP listed separately (about $0.005/min); Pro $100/month [official pricing page per 3rd-party summary; date not captured] | Not captured | Not captured | Yes [unverified] | No: hosted API. |
| **Sesame** | Not researched in this pass | | | | | | | |

**Read-across for a TypeScript engine:** The realtime APIs are the only path with native audio end-to-end. The chain (STT -> LLM -> TTS) gives control over every stage, which is the goal here. The realtime models are useful as a benchmark and as an optional adapter.

---

## 2. Orchestration frameworks and transports

### Frameworks

- **LiveKit Agents** [official docs]
  - Packages: `@livekit/agents` (Node, Apache-2.0) and Python `livekit-agents`. Node plugins include `@livekit/agents-plugin-silero` (VAD) and `@livekit/agents-plugin-livekit` (turn detector). Plugin lists cover STT, LLM, TTS, VAD, EOU, realtime, avatars.
  - Turn detection modes: `inference.TurnDetector()` (default), `realtime_llm`, `vad`, `stt` endpointing, `manual`.
  - Options under `turn_handling`: `endpointing` (fixed `min_delay`/`max_delay`, defaults 0.5 s/3.0 s, or 0.3 s/2.5 s with the audio detector; dynamic mode is Python only); `interruption` (`enabled`, `mode` adaptive or vad, `min_duration`, `min_words`, `discard_audio_if_uninterruptible`); false-interruption resume (`resume_false_interruption`, `false_interruption_timeout`); adaptive mode ignores backchannels like "uh-huh" [official].
  - Usable as a library without LiveKit Cloud: yes, the Agents SDK runs against a self-hosted LiveKit server. The LiveKit server being open source is not verified in this pass [unverified].

- **Pipecat** [official docs and repo]
  - BSD-2-Clause. Python 3.11+. Server framework is Python only. There is a JS/TS client SDK but no TypeScript server SDK.
  - Transports: Daily, LiveKit, SmallWebRTC, Vonage (WebRTC); FastAPI WebSocket, WebSocket server; Twilio, Telnyx, Plivo, Exotel, Genesys as serializers [official].
  - Service counts on the repo page: 24 STT, 25 LLM, 31 TTS, 6 speech-to-speech [official repo page, counted by reviewer].
  - Use: the best reference implementation for turn-stop strategies and barge-in. Do not embed it in a TypeScript engine; read it.

- **Vapi, Retell, Bland** (hosted agent platforms)
  - Vapi pricing page returned 404 [unverified].
  - Retell: third-party guides give $0.07–0.31/min on pay-as-you-go, with a per-component breakdown (voice infrastructure about $0.055/min, TTS $0.015–0.040/min, telephony about $0.015/min) [3rd-party, undated; official page not reached].
  - Bland: not researched in this pass.
  - None is self-hostable. They are useful as product benchmarks, not as building blocks.

- **Daily**: transport provider for Pipecat and a WebRTC SDK. Not researched further in this pass.

### Telephony and transports

- **Twilio ConversationRelay** [official]
  - Transport is a `wss://` WebSocket from TwiML `<ConversationRelay url=...>`.
  - Text-level only: Twilio handles telephony audio and STT/TTS; your server receives `setup`, `prompt` (transcribed speech; partial prompts with Deepgram Flux), and sends text tokens. Also `switch language`, `end session`, `error`, `agentSpeaking`/`clientSpeaking`, `tokens-played`, and DTMF events.
  - TTS: Google, Amazon, or ElevenLabs. STT: Google or Deepgram.
  - The official page does not document interrupt, play, or sendDigits messages, and does not state an audio format. Third-party sources disagree about whether raw audio is ever exposed; treat it as text-only.
  - Implication: if the engine must own STT and TTS, use **Media Streams**, not ConversationRelay.

- **Twilio Media Streams** [official]
  - Audio is `audio/x-mulaw` at **8000 Hz**, mono, base64 payloads with no file header.
  - Inbound messages: `connected`, `start`, `media`, `dtmf` (bidirectional only), `mark`, `stop`.
  - Outbound (bidirectional `<Connect><Stream>`): `media`, `mark`, `clear`.
  - Barge-in: send `clear` with the stream SID. Twilio returns `mark` for unplayed audio, which is what you need to truncate the assistant's history correctly.

- **Transport comparison**

| Transport | Typical audio | Notes |
|---|---|---|
| WebRTC (browser, mobile) | Opus, 48 kHz internally; browser AEC/NS/AGC via `getUserMedia` constraints | Built-in jitter buffer and congestion control. Browser constraint defaults are browser-specific, and Chrome disables hardware noise suppression when echo cancellation is on [official MDN/Chrome notes]. |
| WebSocket (server-to-server, raw) | PCM16 mono: 16 kHz (Gemini in), 24 kHz (OpenAI, Gemini out); G.711 8 kHz optional | Simple, but you own jitter, reconnects, and echo cancellation. |
| SIP / PSTN | G.711 mu-law or A-law, 8 kHz | Phone quality. Needs resampling to 16 kHz for most STT models. |

---

## 3. Turn-taking building blocks

### VAD

- **Silero VAD** [official repo]
  - Supports 8 kHz and 16 kHz. Stated JIT model about 2 MB. Claims under 1 ms per chunk on one CPU thread (vendor claim, not independently checked). MIT per the page text; one badge says CC BY-NC 4.0, so check the `LICENSE` file before shipping.
  - Non-Python: ONNX usable from C++, Rust, Go, Java, C#; no official Node.js example. Node is reachable through `onnxruntime-node` or the LiveKit Node plugin `@livekit/agents-plugin-silero` [official listing].
  - Pipecat defaults: `VADParams` with `start_secs=0.2`, `stop_secs=0.2` (the docs' example uses `confidence=0.7`, `min_volume=0.6`).
- **WebRTC VAD** (GMM-based, from the WebRTC stack): not researched in this pass [unverified]. Lower accuracy than Silero in general; mention only as a fallback.

### Semantic end-of-turn (EOT)

- **LiveKit turn detector** [official]
  - `v1`: audio-based model on LiveKit Inference (cloud). `v1-mini`: local CPU model, default for self-hosted production.
  - 14 languages for the audio model. Needs VAD with `min_silence_duration` of at least 0.25 s (Silero default 0.55 s qualifies). Does not need STT.
  - Must return a prediction within about 1 s, or the turn is committed anyway. Option `unlikely_threshold` (`unlikelyThreshold` in Node) sets the confidence needed to end the turn.
  - Text-based detector (deprecated; removal planned for Agents SDK 2.0): Qwen2.5-0.5B-Instruct, about 396 MB, 50–160 ms per turn on CPU, under 500 MB RAM, 14 languages, needs live STT transcripts [official].
  - Licensing: Apache-2.0 for the SDK, LiveKit Model License for the models [official].

- **Pipecat Smart Turn** [official]
  - Default stop strategy: `TurnAnalyzerUserTurnStopStrategy(turn_analyzer=LocalSmartTurnAnalyzerV3())`. Alternative: `SpeechTimeoutUserTurnStopStrategy(user_speech_timeout=0.6)`.
  - Version: the code says V3; a third-party guide and the repo say the weights are now v3.2 [unverified]. Check the installed package.
  - Runs only during silence, which is why it pairs with a lightweight VAD.

- **Deepgram Flux** [3rd-party pricing; official docs redirected]
  - An STT with built-in EOT, used as an alternative to a separate detector. Pricing about $0.0065–0.0077/min for English [3rd-party].
  - Event names (EagerEndOfTurn, TurnResumed) are from prior knowledge and were not confirmed in this pass [unverified].

### Barge-in and interruption

- Pipecat: interruptions on by default through `enable_interruptions` on start strategies. On user turn start, the bot stops, in-flight work is cancelled, and pending audio and text are cleared [official].
- LiveKit: `interruption.min_duration`/`min_words`; false interruption (VAD fires with no transcribed words) can resume the agent [official].
- OpenAI: `response.cancel` and `conversation.item.truncate` exist in the Realtime API from prior knowledge but were not captured on the page fetched in this pass [unverified].
- Latency reference: a conference talk gives about 32 ms VAD pickup and 15 ms pipeline flush for barge-in. The speaker says this is a component figure, not an end-to-end guarantee [3rd-party talk].

### Backchannel

- LiveKit adaptive mode is the only documented mechanism here: it ignores VAD speech shortly after the agent starts speaking and re-enables interruption on a real interruption [official].

### Echo cancellation

- Browser: `echoCancellation` is on by default in the major browsers; the actual state is read back from `MediaTrackSettings` [official MDN]. Chrome's hardware noise suppression can interfere with echo cancellation [official Chrome notes].
- Server-side bots (no browser AEC): AEC must come from the client or the telephony path. Not researched further in this pass.

### Filler and latency masking, sentence-level TTS streaming

- Not researched against official docs in this pass. The design recommendations in section 5 are engineering judgment, not sourced.

---

## 4. Latency numbers (what is sourced)

| Item | Figure | Source |
|---|---|---|
| LiveKit text turn detector, CPU | 50–160 ms per turn | official |
| LiveKit audio turn detector | must answer within ~1 s | official |
| LiveKit endpointing defaults | 0.5 s min / 3.0 s max (0.3 / 2.5 with audio detector) | official |
| Silero VAD, one chunk | under 1 ms (vendor claim) | official repo |
| Pipecat barge-in components | ~32 ms VAD + ~15 ms flush | 3rd-party talk |
| Moshi | 160 ms theoretical; ~200 ms on L4 | official repo |
| Gemini Live, OpenAI Realtime | no official latency figure captured | — |

---

## 5. Recommended architecture: self-hosted STT -> LLM -> TTS in TypeScript

### 5.1 Component list

1. **Transport gateway.** Two adapters: (a) Twilio Media Streams over WebSocket, mu-law 8 kHz in and out; (b) browser or app clients over WebRTC via LiveKit (self-hosted) or raw WebSocket with PCM16. Normalizes everything to **PCM16 mono 16 kHz** internally.
2. **Audio codec and resampler.** mu-law to PCM16, and 8/16/24/48 kHz resampling. Adopt a resampler library; do not hand-roll polyphase filters.
3. **VAD.** Silero, run by the engine. Preferred: onnxruntime (see the dependency conflict in section 6).
4. **EOT detector.** Phase 1: VAD plus fixed endpointing (`min_delay` 300 ms, `max_delay` 2.5 s). Phase 2: semantic detector behind the same interface (LiveKit `v1-mini` via sidecar, or Smart Turn V3 via sidecar, or STT-side EOT such as Deepgram Flux).
5. **STT.** Streaming WebSocket adapter, behind an interface that emits `partial`, `final`, and `speech_start`/`speech_end` events with timestamps.
6. **Turn manager.** The state machine below. Owns the only mutable turn state.
7. **LLM.** Streaming chat completion with tool calls, behind an adapter. Output is token deltas.
8. **Sentence chunker.** Converts token deltas into speakable chunks (section 5.3).
9. **TTS.** Streaming per-chunk WebSocket or HTTP adapter with a context ID, so chunks continue prosody across sentences. Output is PCM frames.
10. **Playback scheduler.** Paces TTS audio into the transport at real time, tags each frame with a mark ID, and reports the mark when it is actually played (Twilio `mark`, WebRTC playout callback).
11. **History and truncation.** Stores what the user actually heard, not what the LLM generated.
12. **Metrics.** Timestamps at each stage for the latency budget (5.4).

### 5.2 Turn state machine

States: `LISTENING`, `USER_SPEAKING`, `THINKING`, `SPEAKING`, `INTERRUPTED`.

| From | Event | To | Action |
|---|---|---|---|
| LISTENING | VAD speech start | USER_SPEAKING | Open a user segment; start STT stream if closed |
| USER_SPEAKING | EOT fires | THINKING | Close segment; start turn with a new `turnId`; start LLM stream |
| THINKING | first TTS frame ready | SPEAKING | Begin playback |
| THINKING | VAD speech start (barge-in during think) | LISTENING | Abort the turn's signal; discard the pending reply; continue the user segment |
| SPEAKING | VAD speech start, confirmed by `min_duration` (e.g. 300 ms) and `min_words` (e.g. 1) | INTERRUPTED | Abort the turn; send transport `clear`; truncate history to played marks |
| INTERRUPTED | settle (immediate) | USER_SPEAKING | Keep the segment going |
| SPEAKING | playback finished | LISTENING | Commit the assistant message to history |
| SPEAKING | VAD speech start, not confirmed in N ms and no words | SPEAKING | False interruption: resume, do not truncate (LiveKit-style) |

Every event carries `turnId`. Events from a stale `turnId` are dropped, not processed.

### 5.3 LLM -> TTS buffering and chunking

- Accumulate LLM tokens. Flush a chunk on the first of:
  - a sentence terminator `. ! ? …` followed by whitespace, with guards for decimals, abbreviations (`Dr.`, `etc.`), and URLs; or
  - a clause boundary (`, ; :` or an em dash) once at least **6 words** have accumulated, but only for the **first** chunk of a turn; or
  - a hard cap of **~20 words** or ~120 characters, to bound TTS time-to-first-byte.
- **First-chunk budget**: flush within **250 ms** of the first LLM token if a clause boundary is present; otherwise flush at the 6-word or 400 ms ceiling, whichever comes first. Later chunks use sentence boundaries only.
- Send each chunk to TTS with the same TTS context ID. Queue at most two chunks ahead of playback; a larger queue increases barge-in latency.
- These thresholds are engineering targets, not vendor figures. Tune them against measured TTS time-to-first-byte.

### 5.4 First-audio latency budget (target)

Target p50 time from end of user speech to first audible agent audio: **~800 ms**, p90 under 1.2 s. Allocation (design targets):

| Stage | Budget |
|---|---|
| EOT decision after last speech frame | 200–300 ms (semantic detector can be shorter; fixed endpointing needs 300+) |
| Final STT result (streaming, already mostly done) | 100–150 ms |
| LLM time to first token | 250–350 ms |
| First chunk flush (5.3) | 50–150 ms |
| TTS first audio byte | 150–200 ms |
| Transport and playback buffer | 50–100 ms |

These sum to roughly 800–1,250 ms. Measure each stage (item 12 above) before tuning.

### 5.5 Cancellation propagation

- Each turn owns an `AbortController`. Its signal is passed to: the LLM stream, the chunker, every in-flight TTS request, and the playback scheduler.
- On INTERRUPTED or barge-in during THINKING: `abort()` the turn controller. Then send transport `clear` (Twilio) or flush the local playout buffer (WebRTC), and cancel TTS contexts so generation stops, not just playback.
- Playback marks give the exact heard text. Truncate the assistant message in history to that text before the next LLM call, so the model does not believe it said things the user never heard.
- Drop late TTS frames carrying a stale `turnId`.

### 5.6 Build vs adopt

| Area | Decision | Reason |
|---|---|---|
| Turn state machine, turn IDs, abort tree | **Build** | Core product logic; no adopted library fits a TypeScript engine |
| Sentence chunker | **Build** (small module) | Simple, testable, and must match your TTS and language rules |
| History truncation to heard text | **Build** | Depends on your transport marks and storage |
| Twilio Media Streams adapter | **Build** | Small protocol surface (section 2) |
| Audio resampling and mu-law codec | **Adopt** a library | Easy to get wrong; not differentiating |
| Silero VAD weights | **Adopt** the model; wrap it yourself | Open model; fits the local-first goal |
| Semantic EOT | **Adopt** LiveKit `v1-mini` or Smart Turn via a sidecar, behind an interface | Mature models; languages covered; avoids training data work |
| WebRTC transport | **Adopt** LiveKit (self-hosted server) or a browser WebRTC stack | Jitter, NAT traversal, and AEC are hard to build |
| STT and TTS | **Adopt** vendor or open models behind adapters | Use the engine's existing adapters; swap by config |
| LLM | **Adopt** any streaming chat API behind an adapter | Commodity |
| Hosted voice platforms (Vapi, Retell, Bland, Cartesia Line, Hume) | **Do not adopt** for self-hosting | Not self-hostable, or sunset (Hume) |

### 5.7 Dependency conflict to resolve before implementing

The voice-engine package is zero-runtime-dependency by rule. Silero (onnxruntime) and the Node LiveKit plugins are dependencies. Options: (a) relax the rule for a separate `voice-agent` package that is not the TTS/STT engine; (b) keep VAD and EOT in a Python sidecar behind a socket; (c) implement the state machine in the zero-dependency package and inject VAD and EOT as interfaces. Option (c) fits the existing BRIEF.md injection pattern best.

---

## 6. Open items / next checks

1. Re-fetch Deepgram (Voice Agent, Flux event names, pricing), Cartesia Line, ElevenLabs Agents formats, Vapi pricing, and Sesame. All were unavailable or not researched in this pass.
2. Confirm the current OpenAI realtime model ID and audio format list (`gpt-realtime-2.1` vs `gpt-realtime` vs GPT-Live).
3. Confirm the Silero license (MIT vs CC BY-NC badge) and the Node VAD path.
4. Confirm the current Smart Turn weights version.
5. Pricing for every row in section 1 is either official-but-undated or third-party, dated Aug–Sep 2026 at the latest. Re-check the vendor pricing pages before committing a budget.
