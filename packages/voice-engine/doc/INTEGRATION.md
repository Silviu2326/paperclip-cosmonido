# Paperclip integration plan

This package is a standalone seam. It currently registers no Paperclip connections,
routes, runner actions, database tables, budgets, or UI pages. The following is a
future implementation sequence; each step needs its own host-side verification.

## 1. Define governed provider connections

Use the repository's [Connector Playbook](../../../doc/connections/CONNECTOR-PLAYBOOK.md)
and [AI Connections](../../../doc/connections/AI-CONNECTIONS.md). Reuse an existing
provider application where possible; otherwise add a catalog entry for each of
the ten provider ids. Include official credential setup URLs, supported account
types, scopes, authentic artwork, grant ownership, revocation, and live proof.

`VOICE_CONNECTION_SPECS` derives UI fields from `allProviders[].credentialEnv`
and `requiredCredentials`, preserving aliases in `envNames`. `apiKey` and access
tokens are secrets; region, group/user/project/organization ids are configuration.
The specs are not complete Apps catalog entries. In particular, Google's
alternative key/token requirement needs a host-level choice and validation.

AI provider credentials follow the catalog's `connectionPurpose: ai` and
`transport: runtime_auth` model. They do not become remote MCP discovery endpoints.
Runner voice tools are a separate product surface using those governed credentials.
Persist credentials through the canonical credential writer and vault declarations;
do not store raw keys in tool arguments, manifests, issue text, or audit records.

## 2. Bind credentials to authenticated scope

Resolve company, agent, task, responsible user, and selected connection/grant from
the authenticated request/run. Check membership and grant ownership before constructing
an engine. Re-evaluate connection policy at use; do not silently switch personal
credentials to a company credential or fall back to process environment secrets.

```ts
import { createVoiceEngine, allProviders } from "@paperclipai/voice-engine";
import { connectionCredentialResolver } from "@paperclipai/voice-engine/integration";

const credentials = connectionCredentialResolver(async (providerId, companyId) => {
  // The host enforces actor/run/grant access and decrypts fields here.
  return authorizedConnectionStore.resolveVoiceCredentials(providerId, companyId);
});
const engine = createVoiceEngine({
  providers: allProviders, credentials,
  scope: { companyId: authenticatedCompanyId, agentId: authenticatedAgentId },
  cache: false,
});
```

The identifiers and `authorizedConnectionStore` above are host placeholders, not
exports from this package. `connectionCredentialResolver` fails without a nonempty
company id, forwards provider/company exactly, and returns undefined when that
company has no connection. It does not decide who may access a company. Construct
separate scoped engine/cache instances, and invalidate them on credential rotation
or revocation. Never reuse another company's cached voices or audio.

Verify two-company denial, revoked grants, personal ownership, missing credentials,
rotation, and absence of secret values in logs and errors.

## 3. Store generated audio as artifacts

Bind the host's artifact uploader to the same authenticated scope, not to arbitrary
caller metadata. Use `artifactAudioStorage(adapter)`:

```ts
import { artifactAudioStorage, createVoiceToolHandlers } from "@paperclipai/voice-engine/integration";

const storage = artifactAudioStorage({
  upload: (bytes, options) => scopedArtifactUploader.upload(bytes, options),
});
const handlers = createVoiceToolHandlers(engine, { storage });
const result = await handlers.voice_speak({ text: "Hello.", voice: "openai:coral" });
// result contains a URI and audio metadata, not Uint8Array bytes.
```

The uploader returns `{ artifactId, uri }`; `AudioStorage.save` exposes `{ uri }`
because that is its public contract. Keep artifact ownership and work-product links
in the host. Link the artifact to the originating issue/job with content type,
filename, provider/model, provenance, and retention policy. Do not put source text
or credentials into metadata by default. Honor authenticated artifact reads,
expiration, and deletion. Preview audio deserves the same access controls.

For agent output, follow [Generated Artifacts and Work Products](../../../doc/AGENT-ARTIFACTS.md)
and the host's existing publication workflow. An artifact upload alone does not
create an issue work product or post an issue comment.

## 4. Translate usage into cost records

```ts
import { createUsageSink } from "@paperclipai/voice-engine/integration";

const unsubscribe = engine.on(createUsageSink(record => {
  durableUsageQueue.enqueue({ ...record, runId: authenticatedRunId });
}));
// At completion: drain the host queue, then unsubscribe.
```

`createUsageSink` forwards only `usage` events. `toCostRecord` preserves company,
agent, model, operation, request id, billing unit, source, and fractional cents.
Its shape mirrors the media-studio provider boundary:

```ts
{
  provider,
  costCents,
  costStatus: "estimated" | "unpriced", // "priced" is reserved in the local type
  pricingProvenance: {
    source, unit, units, centsPerUnit, estimatedCents, coverage
  }
}
```

All non-null `UsageRecord.estimatedCents` are estimates, including zero. The contract
has no invoice or billed-price evidence, so this helper never labels them `priced`.
Unknown pricing uses `costCents: 0` only as the server-shaped placeholder while
retaining `costStatus: unpriced` and null provenance values. Do not count that as
free usage. Fish byte usage and token-priced models need appropriate provenance.

Before persistence, adapt to the current server cost-event API: media-studio and
cost-event statuses/provenance are not identical. The host currently has a
`reported` status for billed evidence; do not assume the local reserved `priced`
label can be inserted unchanged. Add biller, usage kind, model, occurrence time,
run/issue identifiers, and a durable idempotency key at that boundary. A request id
may be absent, so combine the run/job/operation/chunk identity using host records.
Subscribe once; do not also charge `synthesis.complete.result.usage`.

Listeners are synchronous and the engine does not await persistence. Queue writes,
surface enqueue failures, and drain/retry in the host. Budget checks and reservations
must happen before provider execution and preserve Paperclip's hard-stop semantics.
An unknown estimate requires an explicit host budget policy, not an assumed zero.
Keep local run-log evidence distinct from first-party telemetry or OTLP traces.

## 5. Expose governed runner actions

Register the eight `VOICE_TOOLS` definitions through the existing runner
protocol-actions/catalog and authorization pipeline:

| Tool | Effect | Engine call |
|---|---|---|
| `voice_list_voices` | read | `listVoices` |
| `voice_speak` | write | `synthesize` plus storage |
| `voice_speak_long` | write | `synthesizeLong` plus storage |
| `voice_clone` | write | `cloneVoice` |
| `voice_design` | write | `designVoice` plus preview storage |
| `voice_estimate` | read | `estimateCost` |
| `voice_transcribe` | write | STT `transcribe` |
| `llm_chat` | write | LLM `complete` |

The JSON schemas describe an MCP-style interface, but this package does not start
an MCP server. Register the same schemas with the runner, check connection/action
policy before dispatch, apply budgets, and write activity records for mutations.
Allowlist requested providers for the scoped actor. Engine tool handlers validate
input shape; schemas are not an authorization system. Never trust a tool-supplied
company id: schemas intentionally expose none.

Handlers accept engine voice ids, normalized format/settings, and plain filenames.
They cannot fetch arbitrary URLs or read host paths. Clone samples are explicit
`{ dataBase64, mimeType, fileName? }` objects with `consent: { attested: true }`.
For production, resolve authorized sample artifacts into these bytes in the host;
impose request-size limits before decoding. Add governed provider-specific consent
fields separately for enrollment workflows that require them.

Synthesis/design always save audio and return URIs. Only an explicit `inline: true`
adds base64, and only when each audio output is **smaller than 1,000,000 bytes**.
At or above that size, only the URI is returned. Raw provider voice payloads are
omitted. Design returns candidate tokens; persisting/deleting a voice can be added
as separately governed actions later. Cancellation should come from the trusted
host, not an unvalidated serialized `AbortSignal` in JSON.

Verify schema rejection, consent refusal, permission denial, budget exhaustion,
artifact access, bounded long synthesis, event persistence, and JSON-safe output.
Then capture credential-backed provider read/write proof separately from fake tests.

## 6. Build company-scoped UI journeys

1. **Voice catalog:** selected company, connection availability, provider/language/
   gender/tag filters, model compatibility, preview, and explicit voice selection.
   Show unavailable connections without implying an empty vendor catalog.
2. **Voice studio:** text/SSML where supported, model/settings controls, estimate
   and uncertainty, request/stream state, cancellation, saved audio artifact,
   optional timestamps, and usage receipt. Disable unsupported controls based on
   provider and model capabilities rather than assuming a universal feature set.
3. **Clone consent:** explain the intended use, capture owner permission and
   evidence, collect required provider consent recordings, show training or
   verification state, and provide revocation/deletion. An attestation checkbox
   is not a provider enrollment or identity verification bypass.
4. **Voice design:** describe a voice, generate previews, compare candidates,
   save a selected candidate, and associate the resulting provider voice with
   the company and originating consent/provenance records.

Use `DESIGN.md` tokens, standard company context, shared connection setup, and
the step-owned footer pattern. Keep errors actionable and partial audio labeled.
Update feature/access maps and tests in the corresponding host-side change.

## Explicit v1 non-goals

- No automatic Apps catalog registration, database migration, server endpoint,
  runner transport, scheduled job, or UI page in this standalone package.
- No user authentication, grant evaluator, company membership enforcement,
  approval flow, hard-budget accounting, audit sink, or durable queue.
- No automatic recording of legal consent, identity verification, provider
  entitlement enrollment, or cross-company sharing of clones.
- No built-in Twilio server, browser microphone session, WebRTC bridge, or
  replacement of Paperclip's voice transport. The standalone package provides
  injectable STT and voice-agent interfaces and examples, not host transport wiring.
- No universal transcoder/resampler, provider feature parity, invoice-accurate
  billing guarantee, or claim that fake tests establish live provider access.
- No raw-audio/base64 tool output by default or process-environment fallback when
  the company-scoped connection resolver is used.

## STT, LLM, and realtime connections

`VOICE_CONNECTION_SPECS` merges TTS, STT, LLM, and realtime definitions by provider id, retaining a `kind` of `tts`, `stt`, `llm`, `realtime`, or `multiple`. Shared providers contribute one merged field list. Credential resolution remains company-scoped and definitions supply environment aliases.

`toCostRecord` accepts TTS `UsageRecord`, `SttUsageRecord`, and token-based `LlmUsage`; input/output and cached-token counts remain in source usage while the existing provenance shape records estimate and units. Unpriced usage retains a null estimate and zero placeholder with an explicit unpriced label. `createUsageSink` accepts `usage`, `stt.usage`, and `llm.usage` events.

The tool catalog adds `voice_transcribe` and `llm_chat`. Provide scoped STT/LLM engines to `createVoiceToolHandlers`; handlers do not replace host authorization, budget, or audit checks. Realtime sessions are not exposed as runner tools.
