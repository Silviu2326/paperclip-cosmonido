# Business setup and portable profiles

Product journey: [companion](../feature-map/productization.md).

## `journey`

Review: `baseline`.
API: `present` — GET/PUT /api/companies/{companyId}/productization/onboarding; POST /api/companies/{companyId}/productization/onboarding/events.
Agent access: `restricted` — onboarding routes enforce board identity; an agent bearer key does not inherit operator authority.
Policy: company access plus board identity. Create/resume uses one durable row per company. Writes require an expected revision; server creates evidence for human confirmations and rejects technical milestone events from browser input. See [routes](../../server/src/routes/productization-onboarding.ts) and [service](../../server/src/services/productization/onboarding.ts).
Evidence: `source-only` — integration based on `809454f96`; no live access proof.
Verification: `not-run` — persist/reload each path; reject another company, agent actor and stale revision; verify a malformed event does not mutate state.
Gaps: operator-only setup is deliberate; native agent discovery is not permission to mutate it. Subscription/account ownership is not implemented by this route.

## `package-preview`

Review: `baseline`.
API: `present` — POST /api/companies/{companyId}/productization/catalog/preview.
Agent access: `partial` — direct REST can request a preview if the actor passes company access and `agents:create`; no dedicated semantic tool is added. Native fallback remains subject to its own admitted run and mode policy.
Policy: [route](../../server/src/routes/productization-catalog.ts) checks company scope and access-service decision. JSON input is bounded to 1 MiB and preview to 100 persistent profiles. Inline portability preview installs no resources and fetches no package URL.
Evidence: `source-only` — reviewed route/service and [preview adapter](../../server/src/services/productization/portable-package-preview.ts); not executed.
Verification: `not-run` — allowed same-company preview; deny missing create permission and another company; reject invalid/oversized input; inspect database for absence of installed resources.
Gaps: native `search_api`/`call_api` production admission for this new route is unverified. Catalog resolution is not installation of skills.

## `profile-hire`

Review: `baseline`.
API: `present` — existing POST /api/companies/{companyId}/agent-hires.
Agent access: `partial` — the existing hire route and its policy remain authoritative; the new UI does not grant an agent new rights or add a semantic tool.
Policy: company scope, hire approval policy, installed company skills and supported adapter/environment. The [builder](../../packages/shared/src/productization/profile-hire.ts) excludes arbitrary package configuration and permissions. Temporary specialists are rejected. Existing lifecycle preparation may run after hire; no new assignment is started by this panel.
Evidence: `source-only` — [panel](../../ui/src/features/productization/hiring/ProfileHirePanel.tsx) and existing hire integration; no live request.
Verification: `not-run` — inspect approved/pending states and company attribution; deny unavailable references; confirm one submission and no blind automatic retry after uncertain response.
Gaps: durable board-hire idempotency/reconciliation across reloads remains an existing service limitation; UI guards do not prove exactly-once creation.

## `first-result`

Review: `baseline`.
API: `present` — POST /api/companies/{companyId}/productization/onboarding/team, /activate and /first-job; existing assignment and deliverable-review routes supply the facts.
Agent access: `restricted` — these onboarding selection/confirmation endpoints are board-only. Existing assignment/review permissions remain unchanged; see [assignments](./assignments.md).
Policy: explicit selected agent IDs and goal ID in the same company; server checks usable approved agents, the actual root task start, and an accepted review belonging to that assignment. The client cannot submit evidence timestamps or claim execution/acceptance.
Evidence: `source-only` — [service](../../server/src/services/productization/onboarding.ts); no live proof.
Verification: `not-run` — reject other-company agents/goals, pending team, unstarted/old assignment and stale revision; accept only the linked assignment's actual start and accepted review.
Gaps: the readiness confirmation is consent to use the selected team, not execution qualification. Provider-specific connection qualification and automatic execution are outside this slice.

## `catalog-installation`

Review: `baseline`.
API: `present` — Example: POST /api/companies/{companyId}/productization/catalog/packages/{packageId}/installations. GET/POST `/api/companies/{companyId}/productization/catalog/packages`; GET/PUT/DELETE package; POST request-review/return-to-draft/publish/withdraw; GET export/install-plan; POST installations and item claim/reconcile/cancel; GET installations and installation detail. Bodies reuse `portablePackageSchema`, `portablePackageStatusActionSchema` and `createPackageInstallationSchema` in OpenAPI.
Agent access: `restricted` — the catalog route is board-only; the eventual hire remains the existing `/api/companies/{companyId}/agent-hires` route and its authority contract.
Policy: company scope plus `agents:create` for package mutations/installation operations. Preview and install-plan do not install. `claim` returns a proposed hire payload; it does not bypass hire approval. Cancellation is limited to unclaimed items.
Evidence: `source-only` — [catalog route](../../server/src/routes/productization-catalog.ts), [installer](../../server/src/services/productization/package-installation.ts), [OpenAPI inventory](../../server/src/routes/productization-openapi.ts); no requests executed.
Verification: `not-run` — verify same-company denial, missing `agents:create`, unsupported-item acknowledgement, one-time claim behavior and existing hire approval.
Gaps: route access for native API admission is not verified; installation does not install forms, playbooks, connections, meetings or temporary specialists.

## `builder`

Review: `baseline`.
API: `present` — Example: GET /api/companies/{companyId}/productization/builder/connections. GET builder/connections and builder/url-extraction; POST builder/drafts, drafts/{draftId}/clone and configuration-preview; GET builder/compare, all under `/api/companies/{companyId}/productization/builder`.
Agent access: `restricted` — board-only route contract; no new semantic agent tool is added.
Policy: company scope and board actor. Drafts are revision bounded; S95 model proposals pin an actual configured decision invocation and a durable company/actor/request fingerprint before any paid call. URL extraction is an availability/status surface, not an arbitrary server fetch. Configuration preview validates configuration; it does not execute tools.
Evidence: `source-only` — [route](../../server/src/routes/productization-builder.ts), [service](../../server/src/services/productization/description-builder.ts), [OpenAPI inventory](../../server/src/routes/productization-openapi.ts); no live proof.
Verification: `not-run` — confirm stale revision conflict, same-company references, clone/compare fields and preview without execution.
Gaps: model/provider acceptance and the conversational preview are not accredited autonomy qualification. External URL extraction still requires its own authorized connection.

## `account-billing`

Review: `baseline`.
API: `present` — Example: GET /api/productization/accounts. GET/POST `/api/productization/accounts`, GET account/members, POST members/companies grant, GET plans, PUT `/api/productization/plans/{planId}`, POST account billing checkout/portal and POST `/api/public/productization/stripe/webhook`.
Agent access: `restricted` — account and checkout/portal operations require a signed-in board user; plan changes require instance admin; Stripe webhook is signature-authenticated, not agent access.
Policy: account membership for snapshots; company grant requires company `users:manage_permissions`, does not confer company access rights. Stripe action needs configured provider credentials/prices; webhook verifies `stripe-signature` against raw body.
Evidence: `source-only` — [account route](../../server/src/routes/productization-accounts.ts), [service](../../server/src/services/productization/accounts.ts); Stripe is not exercised.
Verification: `not-run` — verify account-member isolation, company grant permission, invalid/unconfigured Stripe and signed webhook replay behavior.
Gaps: invoice/cancellation user surfaces and live billing lifecycle are not evidenced here; no access to company work is derived from account membership.

## `lead-forms`

Review: `baseline`.
API: `present` — Example: GET /api/companies/{companyId}/lead-forms. GET/POST `/api/companies/{companyId}/lead-forms`, GET `/api/lead-forms/{id}`, PATCH form, POST publish/unpublish/archive/restore; public POST `/api/p/{companySlug}/form/{formSlug}`.
Agent access: `partial` — same-company authenticated reads follow company access; form writes are board-only; public submission is unauthenticated intake, not an agent control API.
Policy: public route accepts only fields from the active published form, has per-IP limits (20/min form plus public-router limit), and uses a honeypot. Mutations validate `expectedUpdatedAt` on update/lifecycle changes.
Evidence: `source-only` — [form routes](../../server/src/routes/lead-forms.ts), [public intake](../../server/src/routes/public/leads.ts), shared lead-form validators; no submission executed.
Verification: `not-run` — deny cross-company form access, stale update, unpublished form submission and unconfigured/unknown fields; verify rate limits and stored consent/attribution.
Gaps: form schema for public POST depends on the form configuration; OpenAPI describes this as a dynamic record, not a fixed field list.

## `customer-portal`

Review: `baseline`.
API: `present` — Example: GET /api/public/customer-portals/{portalId}. company POST create, customer GET list, POST revoke, GET feedback; public GET `/api/public/customer-portals/{portalId}` and POST comments/proposal-acceptances/deliverable-feedback.
Agent access: `restricted` — management and feedback reads require board user; public methods require a portal token in `X-Paperclip-Customer-Portal`, never a board or agent bearer.
Policy: token scoped to a company/customer/resource set, expiry and revocation; public responses are `no-store` and `no-referrer`. Proposal acceptance binds to reference/revision; feedback uses an idempotency key.
Evidence: `source-only` — [routes](../../server/src/routes/productization-customer-portal.ts), [service](../../server/src/services/productization/customer-portal.ts); no client-token journey executed.
Verification: `not-run` — verify missing/wrong/expired/revoked token denial, no cross-customer leakage and permitted versus ungranted resource behavior.
Gaps: no customer-account session or internal-review resolution is claimed. S95 uploads/downloads use an explicit files grant, stable public upload receipt, scoped storage and token-derived references; provider acceptance remains unverified.

## `outcome-metrics`

Review: `baseline`.
API: `present` — Example: GET /api/companies/{companyId}/productization/metrics. GET `/api/companies/{companyId}/productization/metrics?days=`.
Agent access: `restricted` — board-only metrics endpoint.
Policy: company scoped; shared query accepts 1–90 days. Result carries current/previous windows and source/coverage per metric; numbers are not proof of complete cash or provider cost accounting.
Evidence: `source-only` — [route](../../server/src/routes/productization-metrics.ts), [service](../../server/src/services/productization/outcome-metrics.ts), shared response/query schema.
Verification: `not-run` — compare bounded real source rows to returned windows and verify another-company denial.
Gaps: no live company dataset or end-to-end evidence.

## `media-production`

Review: `baseline`.
API: `present` — Example: GET /api/companies/{companyId}/media-queue. GET/POST `/api/companies/{companyId}/media-presets`, GET preset metrics; GET `/api/companies/{companyId}/media-queue?limit=&cursor=`; PATCH `/api/companies/{companyId}/media-jobs/{jobId}/priority`.
Agent access: `partial` — preset reads/metrics and existing media-job execution use company and run context; preset creation and queue administration/reprioritization are board-only.
Policy: media queue priority is bounded 0–100, `updatedAt` CAS and queued-only; worker order is priority descending then createdAt/id, one active job per company remains, and running is not preempted. Budget, pause, provider credential and enqueue behavior remain existing checks.
Evidence: `source-only` — [preset route](../../server/src/routes/productization-media-presets.ts), [Media Studio route](../../server/src/routes/media-studio.ts), [worker](../../server/src/services/media-studio.ts), [schema](../../packages/db/src/schema/media_studio.ts); route/UI/migration not runtime verified.
Verification: `not-run` — check priority claim order, stale CAS 409, same-company isolation, one running job and no preemption.
Gaps: provider renders/cost coverage require configuration and live execution. S90 video-minute admission is connected at enqueue, with uncertain/confirmed settlement; it has not been exercised here. The additive migration and queue page/navigation are present in source but have not been applied or exercised.

## `security-retention`

Review: `baseline`.
API: `present` — Example: GET /api/companies/{companyId}/productization/security/retention. GET/PUT `/api/companies/{companyId}/productization/security/retention`; official Better Auth TOTP/session operations use Better Auth endpoints, not new custom auth endpoints.
Agent access: `restricted` — retention is board-only; writes require `users:manage_permissions`. Account security/session management is self-service to the authenticated user.
Policy: retention preview is company/actor/input scoped and expires; one-use revision CAS schedules a leased bounded sweep. File purge only covers eligible old soft-deleted files and blocks restore before storage I/O. TOTP remains explicit Better Auth enrollment. Commercial deletion is owner-only with cooling, current provider checks and a durable receipt; it never deletes shared companies or a global user.
Evidence: `source-only` — [security routes](../../server/src/routes/productization-security.ts), [security service](../../server/src/services/productization/security.ts), [auth config](../../server/src/auth/better-auth.ts); no enrollment or session revocation performed.
Verification: `not-run` — verify enrollment/backup/recovery through official plugin, per-user session revoke and permission-denied retention update.
Gaps: no external-provider deletion or live retention journey is accredited here. Persistent deployment migration and provider configuration remain necessary; files with protected references are skipped rather than silently removed.

## `product-notifications`

Review: `baseline`.
API: `present` — Example: GET /api/companies/{companyId}/product-notifications. GET inbox, PUT preferences, GET push config/subscriptions, POST subscription, DELETE subscription/{id} and DELETE subscriptions at `/api/companies/{companyId}/product-notifications`.
Agent access: `restricted` — endpoints require board user context and company access; stored subscriptions belong to the current user and company.
Policy: Web Push only activates with valid VAPID configuration and supported HTTPS push hosts; subscription material is encrypted. WhatsApp remains blocked pending authorized channel/consent. Worker send outcomes and retry limits remain service owned.
Evidence: `source-only` — [route](../../server/src/routes/productization-notifications.ts), [service](../../server/src/services/productization/notifications.ts), shared notification types; no device delivery tested.
Verification: `not-run` — exercise no-config state, subscribe/revoke ownership, push consent, worker delivery/retry/expired endpoint behavior.
Gaps: no remote delivery or device journey is verified; no WhatsApp delivery is claimed.

## `scoped-public-api`

Review: `baseline`.
API: `present` — Example: GET /api/v1/customers. `/api/v1` read-only list/get for customers, leads, assignments, proposals, accepted results and conversations; management GET scopes/keys/webhooks, POST create/rotate, DELETE revoke under `/api/productization/public-api`.
Agent access: `not-applicable` — these keys are for external read-only integrators, not agent API keys or native `call_api` credentials. Management requires a signed-in board user with company `users:manage_permissions`.
Policy: each `pcp_public_` token is hashed at rest, expires/revokes, is bound to the key's company and must hold the requested read scope; list query is limit/offset. No write endpoint exists under `/api/v1`. Webhook recipients must be HTTPS and their signing secret is returned once; events are `lead.created`, `proposal.accepted`, `deliverable.accepted`, `conversation.created`.
Evidence: `source-only` — [management and v1 routes](../../server/src/routes/productization-public-api.ts), [service](../../server/src/services/productization/public-api.ts), shared scope validators.
Verification: `not-run` — verify bearer-only auth, missing-scope denial, cross-company resource denial, revoked/expired key, read-only surface and signature/secret rotation.
Gaps: no external integrator run or webhook delivery proof. Management is exposed through PublicApiSettings; its runtime journey remains unverified.

## `contact-import`

Review: `baseline`.
API: `present` — Example: POST /api/companies/{companyId}/productization/imports/contacts/preview. POST company `/productization/imports/contacts/preview` and `/commit`.
Agent access: `restricted` — signed-in board user only; no agent tool.
Policy: company write access, byte/row limits, current identity ownership, preview hash and transactional receipt; no consent inference.
Evidence: `source-only` — [routes](../../server/src/routes/productization-contact-import.ts).
Verification: `not-run` — other company/user, changed preview, reused key with changed content, concurrent identity creation.
Gaps: Gmail/HubSpot onboarding import and executed acceptance remain absent.

## `pipeline-forecast`

Review: `baseline`.
API: `present` — Example: GET /api/companies/{companyId}/opportunities/forecast. GET company `/opportunities/forecast`.
Agent access: `partial` — company-authorized REST read; no dedicated forecast tool.
Policy: company scope, one currency, explicit data exclusions and bounded query; does not assert revenue.
Evidence: `source-only` — [service](../../server/src/services/crm/opportunity-forecast.ts).
Verification: `not-run` — cross-company scope and period/currency coverage.
Gaps: no real data/accuracy acceptance.

## `external-review`

Review: `baseline`.
API: `present` — Example: GET /api/companies/{companyId}/review-links. review-link management, customer reviewable work products and public header-token review/response.
Agent access: `partial` — `review_link_create` requests board approval from a real task run within its client project; `review_status_get` reads that project's state. Agents receive no URL.
Policy: company/project/customer scope, pinned target version, expiry/revocation, public body limit, response CAS/idempotency; external feedback never resolves the internal review.
Evidence: `source-only` — [routes](../../server/src/routes/public/review.ts), [service](../../server/src/services/public-surface/review-links.ts), [dispatcher](../../server/src/services/sprint2-tools.ts).
Verification: `not-run` — concurrent approval request, changed target, expired/revoked header token and another task's project.
Gaps: work products only, no zone annotations or verified visitor identity; no provider notification.

## `crm-phone`

Review: `baseline`.
API: `present` — Example: GET /api/companies/{companyId}/crm-phone/status. company CRM phone reports, callback requests, authorization and real outbound receipt recording.
Agent access: `partial` — `call_summary_get` and `call_schedule` require actual task context; project client contacts are checked when present. No direct dialing tool exists.
Policy: strict company scope, caller text untrusted, current call consent/autonomy and receipt association; no inferred consent from inbound calls. Queued tasks do not imply calls.
Evidence: `source-only` — [phone routes](../../server/src/routes/crm-phone.ts), [service](../../server/src/services/crm-phone.ts).
Verification: `not-run` — real-run scope, missing/revoked consent, changed connector and unrelated session receipt.
Gaps: external provider acceptance is unverified; caller identity may remain unresolved. S95 binds an internal CRM-callback principal, endpoint, contact number, consent, approval revision and lease to the existing voice lifecycle; no HTTP endpoint accepts a client-claimed dial receipt.

## `commercial-maintenance`

Review: `baseline`.
API: `present` — Example: GET /api/companies/{companyId}/service-agreements. existing commercial endpoints and active assigned-run renewal-reference callback.
Agent access: `partial` — normal S3 tools route to the S3 dispatcher; scheduler operates as explicit maintenance with durable claims and configured agent ownership.
Policy: event cursor leases/CAS, current membership/consent/agent eligibility, stable assignment keys and domain quota admission. Preparation/handoff remains pending until the actual proposal, decision or provider receipt exists.
Evidence: `source-only` — [maintenance](../../server/src/services/commercial-automation.ts), [scheduler](../../server/src/index.ts).
Verification: `not-run` — restart/wrap, concurrent leases and provider/run acknowledgment.
Gaps: native bench replay and confirmed daily-channel delivery remain incomplete.

## `package-resources`

Review: `baseline`.
API: `present` — Example: POST /api/companies/{companyId}/productization/catalog/installations/{installationId}/items/{itemId}/install. per-item install within the existing catalog receipt API.
Agent access: `restricted` — board with existing agents:create authority; no new semantic installer bypass.
Policy: company scope, published source snapshot, draft-only domain resources, exact persisted item provenance and conditional claims; no unsafe release or repeated uncertain hire.
Evidence: `source-only` — [installer](../../server/src/services/productization/package-resources.ts).
Verification: `not-run` — crash/race, manually-created collision and removed linked resource.
Gaps: meeting types/connections/specialists/public marketplace remain unsupported.

## `crm-sync-state`

Review: `baseline`.
API: `present` — Example: GET /api/companies/{companyId}/crm/sync/status. company CRM sync status/config/jobs/conflicts API.
Agent access: `partial` — read-only `crm_sync_status`; board starts/configures/resolves.
Policy: company source/link IDs, declared system of record, durable leases and unknown-create blocking. S95 mounts an authorized delegated gateway and independent tick; each call binds the persisted job attempt/configuration and actual operator grant, with exact live tool schema/risk checks.
Evidence: `source-only` — [service](../../server/src/services/crm-sync/crm-sync.ts).
Verification: `not-run` — provider authorization, lease recovery, conflict version and uncertain create.
Gaps: no real HubSpot/Pipedrive receipt acceptance is accredited. Connections with incompatible schemas or approval-required policies fail closed; unknown creates require reconciliation.

## `public-catalog`

Review: `baseline`.
API: `present` — Example: GET /api/catalog/public. anonymous GET `/api/catalog/public` and detail/ratings; company POST catalog public-request/public-import/public-ratings/public-withdraw; instance-admin review/moderation endpoints.
Agent access: `restricted` — publication/import/rating writes are board-only with company authority; anonymous reads grant no installation authority.
Policy: explicit privacy-attested selection, immutable approved hash/version, exact installation receipt for ratings, moderated public text. Imports create private drafts and reuse the existing installer.
Evidence: `source-only` — [routes](../../server/src/routes/productization-public-catalog.ts), [service](../../server/src/services/productization/public-catalog.ts).
Verification: `not-run` — cross-company writes, stale review hash, incomplete/wrong-version receipt, withdrawal and public projection leakage.
Gaps: external marketplace acceptance and full browser journey remain unverified.

## `agency-workspace`

Review: `baseline`.
API: `present` — Example: GET /api/productization/accounts/{accountId}/agency/portfolio. account agency portfolio/operations/clients/resume; company agency client-users and brand settings; explicit public branding projection/logo.
Agent access: `restricted` — authenticated account manager and actual company permission checks; commercial account membership never implies company ACL.
Policy: stable operation and target company, pinned source package hash and current access, archived until capacity admission; normal installer/hire flow. Client access cannot downgrade or silently reuse existing membership/grants. Domain activation is unavailable.
Evidence: `source-only` — [routes](../../server/src/routes/productization-agency.ts), [service](../../server/src/services/productization/agency.ts).
Verification: `not-run` — same-key retries, capacity failure/recovery, source permission revoked, existing client membership, public logo scope and account isolation.
Gaps: Cloud-managed provisioning is explicitly blocked; per-client invoices and custom domain activation are unavailable.

## `webchat-agent-dispatch`

Review: `baseline`.
API: `present` — Example: GET /api/companies/{companyId}/conversation-agent-dispatch. GET/PUT `/api/companies/{companyId}/conversation-agent-dispatch`.
Agent access: `restricted` — only board/company configuration; the worker acts under an explicitly configured current responsible writer and eligible agent.
Policy: confirmed inbound webchat transaction and idempotent outbox, lease fencing, quota-bound task creation and normal heartbeat wake. Context holds IDs and contact/conversation language; inbound text remains untrusted. No direct transport send.
Evidence: `source-only` — [dispatcher](../../server/src/services/conversations/agent-dispatch.ts), [inbound](../../server/src/services/conversations/inbound.ts).
Verification: `not-run` — duplicate inbound, disabled policy, revoked membership/agent, reassignment, restart and wake receipt correlation.
Gaps: agent/provider execution and actual response delivery are not accredited by the outbox alone.
