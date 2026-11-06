# CLI reference

From the package directory, use Node 24.11+:

```sh
node --experimental-strip-types src/cli/bin.ts --help
```

Below, `voice-engine` abbreviates `node --experimental-strip-types src/cli/bin.ts`.
An existing `tsx src/cli/bin.ts` launcher also works. No runtime packages are installed
by the CLI. `--help` and `<command> --help` do not initialize the engine.

## Conventions

- Options accept `--flag value` or `--flag=value`. Boolean options are enabled by
  presence or `=true`, and disabled by `=false`. Use `--` before positional text
  starting with `--`. Negative numbers such as `--pitch -2` work.
- Repeat `--tag`, `--sample`, or catalog `--provider` for multiple values. Other
  options are single-valued. Misspelled and command-inapplicable options fail.
- Every command accepts `--provider ID`, `--json`, `--company ID`,
  `--cache-dir DIR`, and `--out-dir DIR`.
- `--provider` filters catalog commands or supplies routing preferences. An explicit
  engine voice id still identifies its provider. Clone/design require one provider.
- `--company` forwards `scope.companyId` to the engine; the standalone CLI uses local
  environment credentials. It does **not** authenticate a Paperclip company or
  load connection secrets. Use the integration resolver in a trusted host for that.
- Input paths are relative to the invocation's working directory. `--out-dir` is
  relative to that directory; relative `--out` paths are relative to `--out-dir`.
  Absolute output paths are honored. Existing explicit output files are overwritten.
  Omitted output names use unique ids (batch defaults to numbered files).
- Caching is disabled unless `--cache-dir` is provided. Use per-company directories
  for shared deployments. Output is saved locally even if the engine has storage configured.
- `--json` writes one JSON value on stdout; diagnostics stay on stderr. Audio bytes
  and base64 are never printed by CLI synthesis commands. Errors under `--json` are
  `{ "error": { "code", "provider"?, "status"?, "message" } }` on stderr.
- Exit `0`: success; `1`: engine/provider/I/O failure (or failed doctor/batch);
  `2`: invalid command, arguments, manifest shape, or missing consent/confirmation.

## providers

```sh
voice-engine providers
voice-engine providers --provider elevenlabs --json
```

Lists id, name, docs URL, credential env aliases, required fields, availability,
and capability flags. “Available” checks the CLI environment (including Google's
key/token alternatives); injected engines supply their own credential availability.
It does not prove permission or credit balance. Capabilities
are null/`?` for unavailable providers because definitions have no static capability
field. Credentials and their values are never printed.

## models

```sh
voice-engine models --provider elevenlabs
voice-engine models --language es-ES --tier fast --json
```

Optional filters: `--provider`, `--language`, and `--tier
flagship|balanced|fast|legacy`. Language matching includes the primary language
subtag. Models with unknown/empty language inventories remain eligible. Tables
show provider, id, tier, languages, and a character-rate field when available;
read JSON `notes` for byte-based/token-based pricing exceptions.

## voices

```sh
voice-engine voices --provider elevenlabs --language es-ES --gender female --age middle_aged --tag narration --tag calm --limit 10
voice-engine voices --provider openai --provider azure --search narrator --origin premade --json
```

Filters map directly to `VoiceQuery`: `--provider`, `--language`, `--gender`,
`--age`, repeated `--tag`, `--origin`, `--search`, and positive integer `--limit`.
Gender values: `male`, `female`, `neutral`, `unknown`. Age values: `child`, `young`,
`middle_aged`, `old`, `unknown`. Origin values: `premade`, `cloned`, `designed`,
`professional_clone`, `community`, `custom`. Catalog results depend on credentials
and provider metadata quality.

## voice

```sh
voice-engine voice openai:coral
voice-engine voice elevenlabs:YOUR_VOICE_ID --json
```

Prints voice details. An absent voice returns `not_found`, exit 1. The first colon
separates provider and voice id; additional colons in native ids are preserved.

## recommend

```sh
voice-engine recommend --language es-ES --gender female --tag narration
voice-engine recommend --provider openai --language en-US --json
```

Uses `recommendVoice`; accepts the same filters as `voices`. No match is a
`not_found` error. A recommendation does not synthesize or create a voice.

## speak

```sh
voice-engine speak "Hola, mundo." --voice openai:coral --language es-ES --out hola.mp3
voice-engine speak @script.txt --voice elevenlabs:YOUR_VOICE_ID --model eleven_multilingual_v2 --timestamps --out narration.mp3
printf 'Hello from stdin.' | voice-engine speak - --voice openai:coral --stream --out streamed.mp3
voice-engine speak @book.txt --voice openai:coral --long --format wav --sample-rate 24000 --max-chunk-chars 1500 --concurrency 2 --out book.wav
voice-engine speak "Bienvenidos." --voice auto --provider elevenlabs --language es-ES --gender female --tag narration --play
```

The text argument is literal text, `-` for UTF-8 stdin, or `@file.txt`. All modes
preserve input whitespace and reject empty text. `--voice` is required;
`auto` first calls `recommendVoice` with the catalog filters.

| Option | Meaning |
|---|---|
| `--model ID`, `--language TAG` | Explicit model and language hint |
| `--format mp3|wav|pcm|opus` | Output container, default MP3; provider must support it |
| `--sample-rate HZ` | Positive integer rate; provider may constrain or reject it |
| `--speed N` | 0.25–4; 1 is normal |
| `--stability N`, `--similarity N`, `--style N` | 0–1 normalized settings |
| `--pitch N` | -12..12 semitones |
| `--volume N` | -20..20 dB |
| `--emotion NAME`, `--seed N` | Named emotion and nonnegative integer seed |
| `--timestamps` | Request alignment and write `<audio-path>.json` |
| `--stream` | Write each arriving chunk to disk |
| `--long` | Call `synthesizeLong` |
| `--max-chunk-chars N`, `--concurrency N` | Long-form controls; concurrency 1–32 |
| `--out FILE` | Output filename, relative to `--out-dir` unless absolute |
| `--play` | Best-effort playback after saving |

`--stream` and `--long` are mutually exclusive. Timestamp sidecars have
`{ "timestamps": [{ "text", "startMs", "endMs" }] }`; successful synthesis without
alignment produces an empty list with a diagnostic. A provider can instead reject
an unsupported timestamp request. Streaming JSON reports bytes,
path, latency, and usage events or a separate estimate. A stream failure reports
the partial output path and exits 1. Playback tries `ffplay`, macOS `afplay`, or
Windows PowerShell's WAV player; unavailable playback does not fail synthesis.

## batch

```sh
voice-engine batch examples/multi-language-batch.json --concurrency 2 --out-dir audio --json
```

The manifest is an array of objects:

```json
[
  {
    "text": "Hello!",
    "voice": "openai:coral",
    "language": "en-US",
    "format": { "container": "mp3" },
    "settings": { "speed": 0.95 },
    "timestamps": false,
    "out": "hello-en.mp3"
  },
  { "text": "@spanish.txt", "voice": "auto", "provider": "elevenlabs", "language": "es-ES", "tag": ["narration"], "out": "hello-es.mp3" }
]
```

Optional fields: `model`, `language`, `format` (container string or
`{container, sampleRate?}`), `settings` (the speak settings), `timestamps`, `out`,
`long`, `stream`, `provider`, `gender`, and `tag` (string or array).
`voice` can also be `{ "provider": "openai", "voiceId": "coral" }`.
No stdin, playback, arbitrary provider options, or per-row cache/company override.
File references resolve relative to the invocation's working directory.

All row shapes and output-path collisions are validated before starting. Execution
uses at most `--concurrency` workers (default 3, maximum 32). Streaming batches
require concurrency 1 because usage events lack a reliable cross-request correlation
field. Failed rows do not cancel unrelated rows. Summary includes ordered results,
success/failure counts, successful text characters, known estimated cents, and total
estimated cents (null if any successful row is unpriced). Charges from failed
provider calls are not inferable from this summary. Any failed row returns exit 1.

## clone

```sh
voice-engine clone --provider elevenlabs --name "My consented voice" --sample a.wav --sample b.wav --mode instant --language en-US --description "Recorded with permission" --denoise --consent
voice-engine clone --provider elevenlabs --name "Professional voice" --sample long-recording.wav --mode professional --language en-US --consent --json
```

`--provider`, `--name`, one or more `--sample`, and **`--consent`** are required.
The flag sets `consent.attested = true`; `--consent=false` refuses the operation.
Optional: `--mode instant|professional`, `--language`, `--description`, `--denoise`.
Results contain voice, status, and an optional training job id. Use `voice ID` for
provider-supported follow-up; no polling is performed by the CLI. Azure/Google
enrollment needs additional programmatic fields; see [provider notes](PROVIDERS.md).

## design

```sh
voice-engine design --provider elevenlabs --prompt "A warm Spanish narrator, calm and clear" --language es-ES --gender female --age middle_aged --accent Castilian --candidates 3 --out-dir previews
voice-engine design --provider elevenlabs --prompt "A gentle storyteller" --text "Welcome to our story. Settle in and listen." --candidates 3 --out-dir previews --save Storyteller --pick 2 --json
```

`--provider` and `--prompt` are required. Optional: `--text`, `--language`, `--gender`,
`--age`, `--accent`, `--candidates`, and `--out-dir`. Provider preview-text limits
can require a longer sample than a short sentence.
Every candidate preview is saved. `--save NAME` persists one returned candidate;
`--pick N` is one-based and defaults to 1. `--pick` without `--save` is a usage error.
JSON returns candidate ids, paths, optional usage, and the saved voice if requested.

## sts

```sh
voice-engine sts --voice elevenlabs:YOUR_VOICE_ID --input performance.wav --out converted.mp3
```

Loads local audio, calls `speechToSpeech`, saves audio, and reports usage/latency.
Unsupported providers return an engine error; the CLI does not transcribe and
re-synthesize as an implicit substitute.

## delete-voice

```sh
voice-engine delete-voice elevenlabs:YOUR_CLONE_ID --yes
```

Requires explicit `--yes` before deleting the provider voice. Omitting it returns
exit 2 without calling `deleteVoice`. There is no interactive confirmation prompt.

## estimate

```sh
voice-engine estimate "Hello there." --voice openai:coral --model gpt-4o-mini-tts
voice-engine estimate @book.txt --voice elevenlabs:YOUR_VOICE_ID --json
```

Calls `estimateCost` with text, voice, and optional model. Does not generate audio.
Unknown pricing is displayed as `unpriced` / JSON null; estimates are not invoices.

## doctor

```sh
voice-engine doctor
voice-engine doctor --provider playht --json
```

Checks each selected provider independently. Reports missing credential names,
health check result when implemented, or “connectivity not checked”. Missing
credentials or failed health return exit 1. A provider without a health method
can pass credential presence without a network check.

## languages

```sh
voice-engine languages --provider azure
voice-engine languages --json
```

Lists language tags, English names from the local Node/ICU installation, and
supporting provider ids. Only instantiated, available provider capability catalogs
contribute; unavailable providers are reported on stderr. Empty inventories mean
unknown language coverage. Regional display names can differ between Node versions.

## STT, LLM, realtime, and agent commands

`stt-providers` and `stt-models [--provider ID] [--language TAG] [--tier TIER]` display static metadata without credentials. `transcribe <file|->` accepts `--words`, `--diarize`, repeated `--keyword`, `--translate-to`, and `--out FILE.json|.txt|.srt|.vtt`. `stt-stream <file.wav|raw>` supports `--encoding pcm16|mulaw`, `--sample-rate`, and `--realtime` pacing.

`llm-providers` and `llm-models [--provider ID] [--tier TIER]` list static catalogs. `chat <prompt|-|@file>` accepts model/system/tier, streaming, temperature, max tokens, JSON Schema files, and optional demo tools. `llm-bench` streams requests to selected providers and measures TTFT and approximate whitespace-token throughput; it makes live requests. `realtime-info` lists realtime definitions. `agent-sim --in speech.wav --voice provider:id` runs the memory transport simulation. See [STT](STT.md), [LLM](LLM.md), [realtime](REALTIME.md), and [agent](AGENT.md).
