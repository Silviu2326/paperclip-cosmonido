# @paperclipai/voice-engine

A standalone, dependency-free TypeScript voice engine with a unified voice catalog,
speech synthesis, streaming, long-form narration, cloning, voice design, and
speech-to-speech. Ten provider adapters share the contract in
[`src/core/types.ts`](src/core/types.ts). Credentials, storage, caching, and usage
events are injectable. This package does not import Paperclip server, UI, or database code.
It also includes STT, provider-neutral LLM chat, realtime speech-to-speech contracts,
and an injectable STT→LLM→TTS voice-agent pipeline.

## 60-second quickstart

Use Node **24.11+** from this package directory. Existing workspace development
dependencies are enough; the runtime needs no npm dependencies.

```sh
export OPENAI_API_KEY="your-key"
node --experimental-strip-types src/cli/bin.ts doctor --provider openai
node --experimental-strip-types src/cli/bin.ts speak "Hello! This is an AI-generated voice." --voice openai:coral --out hello.mp3
node --experimental-strip-types examples/quickstart.ts
node --experimental-strip-types src/cli/bin.ts stt-providers
node --experimental-strip-types src/cli/bin.ts llm-providers
```

PowerShell: set `$env:OPENAI_API_KEY = "your-key"`, then use the same Node commands.
If `tsx` is already available, `tsx src/cli/bin.ts ...` also works. The source
launcher resolves package-local `.js` imports to `.ts`; Node's built-in transformer
handles dependencies that require more than type erasure. Compiled JavaScript uses
normal ESM resolution.

In a TypeScript-aware application:

```ts
import { createVoiceEngine, allProviders, createFileStorage } from "@paperclipai/voice-engine";

const engine = createVoiceEngine({ providers: allProviders });
const result = await engine.synthesize({
  text: "Hola, esta voz está generada por inteligencia artificial.",
  voice: "openai:coral", language: "es-ES",
  format: { container: "mp3" },
});
const saved = await createFileStorage("./audio").save(result.audio, { fileName: "hello.mp3" });
console.log(saved.uri, result.usage);
```

The OpenAI example uses this package's bundled Speech API adapter. Its three bundled
models are scheduled to retire on **2027-01-06**; their replacement needs a different
API workflow. See the [official Speech API notice](https://developers.openai.com/api/docs/guides/text-to-speech).
For another provider, set its credentials and select a voice from `voices --provider ID`.

## Bundled feature matrix

Snapshot: **2026-10-22**, from this package's capability and model descriptors.
These are adapter capabilities, not a promise about every model, account, region,
or current vendor product. Language counts are declared catalog tags, not a quality
ranking. “Best model” means the bundled flagship candidate; the default can differ.

| Provider | TTS | Stream | Times | SSML | Emotion | Instant clone | Pro clone | Design | STS | Language tags | Best bundled model |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ElevenLabs | Yes | Yes | Yes | No | v3 tags | Yes | Yes | Yes | Yes | 85 | `eleven_v3` |
| Fish Audio | Yes | Yes | No | No | S1 tags | Yes | No | No | No | 13 | `s1` (deprecated) |
| OpenAI | Yes | Yes | No | No | Instructions | No | No | No | No | 57 | `gpt-4o-mini-tts` (deprecated) |
| MiniMax | Yes | Yes | Yes | No | Settings only | Yes | No | Yes | No | 37 | `speech-02-hd` |
| Cartesia | Yes | Yes | Yes | No | Yes | Yes | No | No | Yes | 41 | `sonic-3` |
| Azure | Yes | Yes | No | Yes | Voice-dependent | Gated¹ | No | No | No | 40 | `neural-hd` |
| Google | Yes | Sentence REST² | Marks² | Model-dependent | Gemini prompts | Gated¹ | No | No | No | 49 | `gemini-2.5-pro-tts` |
| Deepgram | Yes | Yes | No | No | No | No | No | No | No | 2 | `aura-2` |
| PlayHT | Yes | Yes | No | No | Model-dependent | Yes | No | No | No | 37 | `PlayDialog` |
| Hume | Yes | Yes | Octave 2 | No | Acting directions | No | No | Yes | No | 11 | `octave-2` |

### STT, LLM, realtime, and agent pipeline

| Kind | Bundled catalogs / pipeline | CLI |
|---|---|---|
| STT | Deepgram, ElevenLabs, OpenAI, Groq, AssemblyAI, Soniox, Speechmatics, Gladia, Mistral, Google, Azure, Fish Audio, Rev | `stt-providers`, `stt-models`, `transcribe`, `stt-stream` |
| LLM | Anthropic, OpenAI, Gemini, Groq, Cerebras, SambaNova, Fireworks, Together, DeepInfra, Mistral, xAI, DeepSeek, Qwen, Kimi, GLM, MiniMax, Cohere, OpenRouter, gateways, and local servers | `llm-providers`, `llm-models`, `chat`, `llm-bench` |
| Realtime | OpenAI Realtime and Gemini Live provider definitions | `realtime-info` |
| Agent | Injected transport → VAD/EOT → STT → LLM → TTS, with cancellation and barge-in | `agent-sim` |

Catalog presence depends on adapters included in the current build. See [STT](doc/STT.md), [LLM](doc/LLM.md), [agent](doc/AGENT.md), and [realtime](doc/REALTIME.md).

¹ Azure Personal Voice and Google Instant Custom Voice require provider enrollment,
additional consent recordings, and programmatic provider options. The generic CLI
clone command and agent tool do not collect those additional fields.

² Google's adapter streams sentence-sized REST results, not native bidirectional
gRPC. Timepoints are SSML marks on compatible families, not automatic word boundaries.

Fish S1 is scheduled to retire on **2026-12-31** according to its
[pricing and migration notice](https://docs.fish.audio/developer-guide/models-pricing/pricing-and-rate-limits).
Hume announces API access ending **2026-11-13** in its
[TTS documentation](https://dev.hume.ai/voice/docs/text-to-speech-tts/overview).
See [provider details](doc/PROVIDERS.md) for model limits and account-dependent features.

## CLI

```sh
node --experimental-strip-types src/cli/bin.ts providers
node --experimental-strip-types src/cli/bin.ts voices --language es-ES --gender female --tag narration --limit 10
node --experimental-strip-types src/cli/bin.ts speak @script.txt --voice auto --provider elevenlabs --language es-ES --long --out narration.mp3
node --experimental-strip-types src/cli/bin.ts batch examples/multi-language-batch.json --concurrency 2 --out-dir audio --json
```

Every command accepts `--provider`, `--company`, `--cache-dir`, `--out-dir`, and
`--json`. Normal output uses aligned tables; audio commands print saved paths.
JSON output never contains raw audio. Usage and latency go to stderr. Exit codes:
`0` success, `1` engine/provider/I/O failure, `2` usage error. See [all commands](doc/CLI.md).

## Routing and fallback

Voice ids use `provider:providerVoiceId`. Choose explicitly for a known identity,
or ask `recommendVoice({ language, gender, tags })` for a catalog match.

```ts
const engine = createVoiceEngine({
  providers: allProviders,
  routing: {
    preferred: ["elevenlabs", "openai"],
    byLanguage: { ja: ["fish-audio", "elevenlabs"] },
    tier: "balanced", fallback: true,
  },
});
const voice = await engine.recommendVoice({ language: "es-ES", tags: ["narration"] });
if (!voice) throw new Error("No matching voice is available");
const result = await engine.synthesize({ text: "Bienvenidos.", voice: voice.id });
```

Fallback is for retryable failures and requires another suitable provider. A new
provider may require a different voice: inspect `result.voice` and `result.provider`.
Do not rely on fallback to preserve a cloned identity. Authentication, consent,
and unsupported-format problems need an explicit correction.

## Caching and long text

Inject `createFileCache(dir)` through `VoiceEngineOptions.cache`, or pass `false`
to disable caching. The CLI enables persistent caching only with `--cache-dir`.
Choose separate cache locations and storage instances for each company; audio may
contain sensitive text. `cached` distinguishes cache results.

Use `synthesizeLong(request, { maxChunkChars, concurrency })` or CLI `--long` for
provider-sized chunks. Limits differ by model and may count bytes. For portable
long-form assembly, choose PCM or a supported WAV configuration and keep format,
sample rate, channels, and voice consistent. The engine owns concatenation;
container support does not imply transcoding. `--stream` writes each arriving
chunk and is separate from `--long`. Failed streams leave a reported partial file.

## Cost estimation and events

`estimateCost({ text, voice, model })` returns `UsageRecord`. `estimatedCents: null`
means unknown pricing. Costs are USD cents and can be fractional. Fish's native
billing unit is UTF-8 bytes; token-priced models and subscription plans cannot
always be reduced to a character tariff. Inspect `pricingSource`.

```ts
const unsubscribe = engine.on(event => {
  if (event.type === "usage") console.log(event.usage, event.scope);
  if (event.type === "synthesis.error") console.error(event.provider, event.willFallback);
});
// After the operation or at application shutdown:
unsubscribe();
```

Events include synthesis start/complete/error, clone completion, usage, and cache
hit/miss. Listeners are synchronous. Queue durable writes and drain that queue in
the host; do not assume the engine awaits an async listener. For streams, the CLI
uses usage events if emitted, otherwise a separate estimate, and labels unknown costs.

## Environment variables

Aliases are tried left to right. A populated key is not proof of account entitlement.

| Provider | Secret credential environment names | Other configuration |
|---|---|---|
| ElevenLabs | `ELEVENLABS_API_KEY`, `ELEVEN_API_KEY`, `XI_API_KEY` | — |
| Fish Audio | `FISH_AUDIO_API_KEY`, `FISH_API_KEY` | — |
| OpenAI | `OPENAI_API_KEY` | Optional `OPENAI_ORGANIZATION`, `OPENAI_PROJECT`, `OPENAI_BASE_URL` |
| MiniMax | `MINIMAX_API_KEY` | Optional `MINIMAX_GROUP_ID` |
| Cartesia | `CARTESIA_API_KEY` | — |
| Azure | `AZURE_SPEECH_KEY`, `SPEECH_KEY` | `AZURE_SPEECH_REGION`, `SPEECH_REGION`; adapter defaults to `westeurope` |
| Google | `GOOGLE_TTS_API_KEY`, `GOOGLE_API_KEY`, or `GOOGLE_ACCESS_TOKEN` | Optional `GOOGLE_CLOUD_PROJECT`; credential alternatives depend on API route |
| Deepgram | `DEEPGRAM_API_KEY` | — |
| PlayHT | `PLAYHT_API_KEY`, `PLAY_HT_API_KEY` | Required `PLAYHT_USER_ID` |
| Hume | `HUME_API_KEY` | — |

`providers --json` exposes the definitions' exact field-to-env mapping.
Google uses alternative credentials; an empty `requiredCredentials` list does not
mean unauthenticated TTS is supported. `doctor` reports credential availability
and runs health checks when an adapter provides one.

## Paperclip integration plan

[`src/integration/`](src/integration/) contains connection specs, a company-scoped
credential resolver, artifact storage adapter, cost-record conversion, and eight
JSON-schema agent tools. Nothing is registered with Paperclip automatically.

Follow [doc/INTEGRATION.md](doc/INTEGRATION.md) for catalog, vault, runner actions,
usage persistence, artifact, and UI work. The host remains responsible for access
checks, budgets, approval policy, audit, consent evidence, and durable event delivery.

## Cloning consent and ethics

Clone only a voice you own or have informed permission to use for the intended
purpose. CLI `clone` requires `--consent`; the agent tool requires
`consent.attested: true`. This is an attestation, not identity verification or a
substitute for provider consent workflows. Retain consent evidence, honor deletion
and revocation, and disclose synthetic speech to listeners. Do not use clones for
deceptive impersonation.

## Examples and verification

All examples run with `node --experimental-strip-types examples/<name>.ts` and
support `--help` without making provider calls:

- [Quickstart](examples/quickstart.ts)
- [Long-form narration](examples/long-form-narration.ts)
- [Clone and speak](examples/clone-and-speak.ts)
- [Design previews](examples/design-voice.ts)
- [Batch runner](examples/batch.ts) and [multilingual manifest](examples/multi-language-batch.json)
- [Streaming output](examples/streaming.ts)
- [Transcription](examples/transcribe.ts), [streaming chat](examples/chat-stream.ts)
- [Offline voice agent](examples/voice-agent-offline.ts), [Twilio Media Streams wiring](examples/voice-agent-twilio.ts), [realtime OpenAI](examples/realtime-openai.ts)

```sh
node ../../node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
node ../../node_modules/typescript/bin/tsc --noEmit -p test/cli/tsconfig.json
node ../../node_modules/vitest/vitest.mjs run test/cli test/integration
```

These tests use an injected fake engine and make no provider requests. They prove
the CLI/integration contract, not account access or live audio quality.

## Development notes

- [`doc/CONTRIBUTING.md`](doc/CONTRIBUTING.md) is the contributor brief: contract rules, provider module shape, commands.
- [`doc/notes/`](doc/notes/) records per-area implementation assumptions (endpoint versions, pricing dates, contract gaps) written while each adapter was built. Read the matching note before changing a provider.
- No live provider calls are made in the test suite; every adapter is covered with an injected fake `fetch`. Run a credentialed `doctor` + `speak` before relying on an adapter in production.

```sh
node ../../node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
node ../../node_modules/vitest/vitest.mjs run
```
