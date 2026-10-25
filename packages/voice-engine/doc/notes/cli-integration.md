# CLI and integration notes

Date: 2026-10-22. Changes are confined to `src/cli/`, `src/integration/`,
`test/cli/`, `test/integration/`, `README.md`, package `doc/`, `examples/`, and
this notes file. No core/provider contracts or implementations were edited.

## Exports relied upon

Only these cross-area runtime entry points are imported (relative paths adjusted
for nested command/example directories):

- `createVoiceEngine(options?: VoiceEngineOptions): VoiceEngine` from `src/core/engine.ts`.
- `allProviders: ProviderDefinition[]` from `src/providers/index.ts`.
- `createFileStorage(dir: string): AudioStorage` from `src/core/storage.ts`.
- `createFileCache(dir: string): CacheStore` from `src/core/cache.ts`.
- Public types from `src/core/types.ts`, and `VoiceEngineError` from `src/core/errors.ts`.

`VoiceEngine` methods are called exactly through the public contract. No provider
implementation helpers or model constants are imported by CLI/integration code.
Provider documentation was checked against descriptor metadata and official pages;
its snapshot does not assert live account qualification.

## Contract decisions and gaps

1. **Source execution.** Relative imports retain `.js` suffixes. Node strip-only
   execution does not remap them to `.ts`, so `src/cli/register-source.ts` installs
   package-local resolution hooks. The concurrently supplied core initially used
   constructor parameter properties that Node's type stripper rejected; the loader
   falls back to Node's built-in TypeScript transformer for that syntax. CLI source
   itself uses no enums, namespaces, decorators, or parameter properties. Node
   24.11+ is documented; the checks ran on Node 24.13.0. Node may print an
   experimental-transformer warning on stderr. Compiled JS skips this bootstrap.

2. **Provider capabilities.** Definitions contain no static capability snapshot.
   `providers`, `languages`, and `describeProviders(engine)` inspect instantiated
   providers only where credentials are available; unavailable capabilities are
   null/unknown rather than inferred. `voiceEngineManifest.capabilitiesByProvider`
   is the async `describeProviders` function, not a precomputed JSON object.

3. **Alternative credentials.** Google's definition has `requiredCredentials: []`
   while synthesis requires an API key or access token. The default engine's
   availability result during the no-credential smoke check classified it as
   available. CLI diagnostics therefore check environment fields locally: for an
   empty required list with `apiKey`/`accessToken` fields, one of their env aliases
   must be populated. This is a documented catalog convention, not a widened core
   contract. Injected engines retain ownership of availability; the integration
   manifest trusts their `availableProviders()` contract. Connection specs preserve
   the original required flags, so a future connection UI must express Google's
   credential alternatives explicitly.

4. **Injected CLI engine.** `runCli(argv, io)` accepts stream-like or function
   writers, explicit env/cwd, optional stdin for testing, and optional async or
   synchronous `engineFactory(options)`. The injected factory receives scope and
   routing options and replaces default environment/cache/storage initialization.
   Tests never import a real engine through this path. Default runtime construction
   alone imports the engine/cache/storage/provider barrels.

5. **Streaming usage.** `synthesizeStream` yields chunks, with no final result or
   usage field. The CLI subscribes to `usage` events, then uses `estimateCost` if
   none were emitted. Unavailable estimates remain unknown. Because usage events
   do not guarantee a per-invocation correlation identifier, streaming batches
   require concurrency 1. A failed stream retains its reported partial output.
   Timestamps are preserved as delivered; the CLI does not invent missing timings.

6. **Costs.** `UsageRecord` contains estimates, not billed evidence. Non-null
   estimates (including zero) become `costStatus: estimated`; null becomes
   `unpriced` with zero as the numeric placeholder. The local type reserves
   `priced` but never emits it. Fractional cents and zero-unit records are preserved
   without dividing by zero. The future server boundary must adapt this media-studio
   shape to its current cost-event statuses and provenance. `createUsageSink`
   is synchronous; the host owns durable queueing, idempotency, budgets, and draining.

7. **Storage and tools.** `AudioStorage.save` has no artifact-id field, so the
   artifact adapter returns the URI and the host retains artifact/work-product
   relationships. Tools always save audio, omit raw provider voice payloads and
   data-URL previews, and return JSON-safe metadata/URIs. Only explicit
   `inline: true` includes base64 for an individual audio output below 1,000,000
   bytes. Storage must return a reference URI rather than a data URL. Tool inputs
   do not accept arbitrary URLs, filesystem paths, company overrides, signals, or
   provider options. A trusted host can add authorized artifact resolution and
   cancellation later.

8. **Consent.** Generic clone CLI/tool requests require attestation. Azure Personal
   Voice and Google Instant Custom Voice need additional consent recordings and
   provider-specific programmatic fields not collected by these generic surfaces.
   The docs distinguish this from general instant-clone support. Cloning attestation
   is neither identity verification nor a replacement for provider enrollment.

9. **Batch/output semantics.** Manifests use a documented subset of speak requests;
   no stdin or arbitrary provider options. All row shapes and path collisions are
   validated first. Workers continue after individual engine/I/O failures and return
   ordered results with error code/provider/status/message. Summary charges cover
   successful results only; failed-request charges cannot be inferred. Paths are
   resolved against caller cwd/out-dir, with explicit files overwritten.

10. **Lifecycle documentation.** The bundled compatibility catalog includes models
    whose vendors now list successors or retirement dates. README/PROVIDERS cite
    official Fish, OpenAI, and Hume notices and distinguish bundled support from
    current vendor feature claims. No provider model selection was changed here.

## Verification

- `node ../../node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`
- `node ../../node_modules/typescript/bin/tsc --noEmit -p test/cli/tsconfig.json`
  includes the owned source, tests, and examples; dependencies are checked transitively.
- `node ../../node_modules/vitest/vitest.mjs run test/cli test/integration`
  uses only fake engines, fake provider metadata, temporary local files, and injected storage.
- Plain Node `src/cli/bin.ts --help`, `providers --json`, and a missing-credential
  `doctor --provider google --json` exercised the launcher and credential diagnostics.
- All six runnable examples were launched with `--help`, without provider requests.

The first test pass exposed an ICU language-name expectation; the test now accepts
the platform's English Spanish label while asserting the exact tag/provider. The
first example startup exposed the core parameter-property issue described above;
the source loader corrected it without cross-area edits. Subsequent checks passed.

No credential-backed synthesis, cloning, design, deletion, or live playback was
performed. Repository-wide build/test, browser suites, and PR preparation were not
run: this task requested package-scoped verification and prohibits root workflows.
This package has no build script. No dependencies were installed and no commit or
external publication was made. Docs/examples are repository source work products;
there is no Paperclip issue/artifact destination configured for this task.
