---
navigation: {"section":"Getting started and access","sectionOrder":10,"order":20}
---

# Business setup and portable profiles

An operator can review a portable package, request a persistent agent hire, and resume a company-scoped business setup journey. This supplements [technical onboarding](./onboarding.md) and uses existing [agents](./agents.md) and [assignments](./assignments.md).

Implementation: [setup page](../../ui/src/pages/Productization.tsx), [workbench](../../ui/src/features/productization/ProductizationWorkbench.tsx), [onboarding routes](../../server/src/routes/productization-onboarding.ts), [catalog routes](../../server/src/routes/productization-catalog.ts), [builder page](../../ui/src/pages/BusinessBuilder.tsx), [account and billing pages](../../ui/src/pages/ProductAccounts.tsx), [lead forms](../../ui/src/pages/LeadForms.tsx), [customer portal settings](../../ui/src/pages/CustomerPortalSettings.tsx), [customer portal view](../../ui/src/pages/PublicCustomerPortal.tsx), [outcome metrics](../../ui/src/pages/OutcomeMetrics.tsx), [media queue](../../ui/src/pages/MediaQueue.tsx), [security settings](../../ui/src/pages/SecuritySettings.tsx), [notifications](../../ui/src/pages/NotificationSettings.tsx), [Public API routes](../../server/src/routes/productization-public-api.ts), [OpenAPI registration](../../server/src/routes/productization-openapi.ts).

Agent access: [companion](../agent-access-map/productization.md).

## Sub-features

- `journey`: create and resume an entrepreneur, agency, or commercial journey with confirmed business/context and a durable revision.
- `package-preview`: inspect a portable package and its supported persistent profiles without installing it.
- `profile-hire`: review a profile and request a hire under the company's existing approval policy.
- `first-result`: select real company agents and link a started assignment; observe accepted deliverables from S1 reviews.
- `catalog-installation`: review package omissions, prepare an installation receipt, then explicitly claim approved persistent profiles through the existing hire/approval path.
- `builder`: save, clone and compare human-authored drafts or request a versioned proposal from the configured decision model; review and explicitly apply governed routine changes. Conversational preview never qualifies autonomy.
- `account-billing`: manage billing accounts, members, explicit company grants, configured plans and Stripe checkout/portal.
- `lead-forms`: configure/publish a public lead form, then receive submissions through the rate-limited public intake route.
- `customer-portal`: issue, list and revoke scoped expiring links; let a token holder view allowed material, comment, accept a proposal revision or submit deliverable feedback.
- `outcome-metrics`: view company-scoped outcome counts and cost/time evidence with current/previous windows and source coverage.
- `media-production`: manage versioned presets, inspect production evidence and reprioritize queued media jobs while a running job continues.
- `security-retention`: manage account security, preview and confirm a revision-bound retention sweep, and request/cancel commercial account deletion during cooling. Shared companies and global user identity are preserved.
- `product-notifications`: review the current user's company inbox, update preferences and manage Web Push subscriptions when server VAPID configuration is available.
- `scoped-public-api`: administer company-bound read-only keys and signed business webhooks; third-party reads require a `pcp_public_` key and explicit resource scope.
- `public-catalog`: browse explicitly approved public package versions; import a private draft and submit a rating backed by an exact completed installation.
- `agency-workspace`: provision a client company through a resumable capacity-gated operation, manage explicit client access and opt-in public branding.
- `webchat-agent-dispatch`: opt in to durable agent task dispatch for confirmed incoming webchat messages with a selected agent and responsible company writer.

- `contact-import`: review and commit a bounded CSV import with conservative identity matching and a stable receipt.
- `pipeline-forecast`: inspect weighted open pipeline with period, currency and attribution coverage.
- `external-review`: request or create a version-bound external client review link without resolving internal acceptance.
- `crm-phone`: inspect stored call evidence and approve a callback bound to the current contact, endpoint and voice lifecycle.
- `commercial-maintenance`: observe durable commercial preparation, follow-up and delivery tasks with explicit pending evidence.
- `package-resources`: install supported pinned resources as drafts through the reviewed package receipt.
- `crm-sync-state`: configure a current external CRM connection and inspect delegated synchronization jobs, conflicts and receipts.

## How to get to it (user POV)

### `business-setup`

Choose **Puesta en marcha** in the company sidebar's **Negocio** section, or open `/<company-prefix>/productization`. The unprefixed route redirects into company context. The existing `/onboarding` wizard remains separate.

### `builder`

Open `/<company-prefix>/business-builder` or **Configurar negocio** in Board Chat. Model proposals need a configured authorized decision model and budget; saved routine changes require explicit confirmation and normal assignment permission. Configuration preview and the conversational sandbox execute no tools.

### `account-billing`

Open `/<company-prefix>/product-accounts` and `/<company-prefix>/product-billing`. Company grants use the existing company permission-management grant; Stripe actions require configured provider settings.

### `lead-forms`

Open `/<company-prefix>/lead-forms`. Published submissions arrive through `/api/p/{companySlug}/form/{formSlug}` and accept only fields enabled on that form.

### `customer-portal`

Open the customer record in the company CRM and use its **Portal del cliente** section to create, inspect feedback for, or revoke a link. A customer opens `/portal/{portalId}`; API requests carry `X-Paperclip-Customer-Portal` and remain limited by token scope, expiry and revocation.

### `outcome-metrics`

Open Home with `?results=1&path=<entrepreneur|agency|commercial>&days=<7|30|90>` (`/<company-prefix>/outcome-metrics` redirects there with the old page's entrepreneur/30-day defaults); values report source and coverage from the metrics API.

### `media-production`

Open **Media Templates** at `/<company-prefix>/media-templates` and **Media Queue** at `/<company-prefix>/media-queue`. Priority is bounded 0–100 and changes only queued work; the active job is not interrupted.

### `security-retention`

Open `/<company-prefix>/product-security`. Preview counts and confirm the exact retention policy revision. Sweeps redact closed conversation content in bounded batches; file retention purges only eligible old soft-deleted files with an irreversible restore tombstone. Commercial deletion has a cooling period, owner checks and provider blockers.

### `product-notifications`

Open `/<company-prefix>/notifications`. Remote push needs valid VAPID subject/public/private settings; WhatsApp remains blocked until an authorized channel exists.

### `scoped-public-api`

Manage keys and webhooks through Public API management routes. Integrators call `/api/v1` with a scoped bearer key; endpoints are read-only and do not accept ambient board sessions or agent credentials.

## Driving it manually

Preconditions: an isolated instance with the S4 migration applied, an operator authorized for the company, and the [baseline](./README.md#before-driving-a-journey). This recipe has not been executed for the S4 integration.

The original `business-setup` recipe below remains the onboarding and hiring journey. Added S4 surfaces have source evidence only and were not driven in this pass; the [access companion](../agent-access-map/productization.md) records route/actor contracts and proposed checks.

### `business-setup`

1. Create a journey for each of the three paths. Confirm business and context, reload, and inspect the saved values. Saving from two tabs with the same revision must reject the stale write without replacing newer state.
2. Preview the [example package](../../doc/plans/2026-10-22-s4-paquete-ejemplo.json). Inspect warnings, omitted resources and profile selection. Malformed, oversized and incompatible input must give a visible error without hiring anything.
3. Select a persistent profile, choose an adapter/environment and review available installed skills. Submit once and inspect the real agent or pending approval. Hiring may perform lifecycle setup; this panel does not start an assignment. A lost response must not cause an automatic second hire.
4. Select eligible agents from this company for the journey and explicitly choose to use the team. Pending approvals and agents from another company cannot satisfy readiness. This confirmation does not prove a model run.
5. Create a real assignment through the existing Encargos page and start it through its existing execution path. Link that specific assignment to the journey; a merely created or older unrelated assignment must not count as a new first start. Review a real deliverable through S1. Only its accepted review can complete the result milestone.
6. Switch companies while requests are pending, then return. No form, preview, hire response or journey may leak into another company.

### `catalog-installation`

Automated: `not run` — no automated checks were run in this documentation pass.

Manual: `not run` — preview an example package, inspect unsupported sections and skill versions, create a reviewed receipt, claim one persistent item, then inspect the existing hire approval and reconciliation result. Do not infer that claim bypasses approval.

### `builder`

Automated: `not run` — no automated checks were run in this documentation pass.

Manual: `not run` — save a human-authored draft, reload, clone and compare versions, and confirm configuration preview has no execution side effects. Check missing connector configuration as an explicit state.

### `account-billing`

Automated: `not run` — no automated checks were run in this documentation pass.

Manual: `not run` — use two signed-in account users to confirm membership isolation, grant a company only with its permission-manager authority, and test Stripe checkout/portal only with configured credentials and prices.

### `lead-forms`

Automated: `not run` — no automated checks were run in this documentation pass.

Manual: `not run` — create and publish a form, submit only its configured fields through the public URL, and verify unpublished, stale and cross-company requests are rejected.

### `customer-portal`

Automated: `not run` — no automated checks were run in this documentation pass.

Manual: `not run` — create a portal for a test customer, use the one-time token header, verify scoped view/comment/acceptance/feedback, then verify revoked and expired links fail.

### `outcome-metrics`

Automated: `not run` — no automated checks were run in this documentation pass.

Manual: `not run` — compare 7-, 30- and 90-day responses with source records, current/previous windows and coverage; verify company isolation.

### `media-production`

Automated: `not run` — no automated checks were run in this documentation pass.

Manual: `not run` — with queued jobs in a test company, change priority, verify deterministic pending order and stale-update conflict, and confirm a running job is never preempted. A real render additionally needs configured providers and budget.

### `security-retention`

Automated: `not run` — no automated checks were run in this documentation pass.

Manual: `not run` — opt one test user into official TOTP, verify recovery and session revocation, and confirm unauthorized retention writes fail while saved preferences do not delete data.

### `product-notifications`

Automated: `not run` — no automated checks were run in this documentation pass.

Manual: `not run` — inspect missing-VAPID status, then with test VAPID settings subscribe/revoke one device and verify the worker delivery path. No WhatsApp or device-delivery acceptance is claimed here.

### `scoped-public-api`

Automated: `not run` — no automated checks were run in this documentation pass.

Manual: `not run` — create a temporary scoped read key, verify an allowed resource and a missing-scope/cross-company denial, then test webhook signatures and one-time secret rotation in a controlled environment.

## Gotchas

- Source review only; no tests, builds, server or migrations were run for this integration at the user's request.
- A preview installs nothing. The S90 installer additionally creates selected playbooks/forms as drafts and stores inert brand presets/request templates. Meeting types, connections and temporary specialists remain unsupported; no permissions are inherited.
- Provider checks, URL extraction, subscriptions and payment are not proved by completing this journey.
- Plan admission now has domain hooks for assignments, connections, outbound messages and proven video duration. Adaptive cadence and active-artifact contracts still do not establish executed behavior.

## S90 additions (source only)

The current [integration cut](../../doc/plans/2026-10-22-sprints-90.md) and [criterion audit](../../doc/plans/2026-10-22-s90-estado-criterios.md) supersede handoff-time wiring gaps. None of these journeys was executed.

### `contact-import`

Open `/<company-prefix>/contact-import` from Business. Map a bounded CSV, inspect duplicate/invalid rows, then confirm the reviewed batch. Existing contacts are preserved and importing grants no outbound consent. [Page](../../ui/src/pages/ContactImport.tsx), [domain service](../../server/src/services/productization/contact-import.ts).

Verification: `not run` — two companies, quoted CSV, ambiguous identities, concurrent creation, stale preview and lost-response replay.

### `pipeline-forecast`

Open Opportunities. Select period/currency/owner to inspect weighted open pipeline, coverage, exclusions and overdue actions. This estimates pipeline, not collected revenue. [Panel](../../ui/src/components/crm/OpportunityForecastPanel.tsx), [source](../../server/src/services/crm/opportunity-forecast.ts).

Verification: `not run` — missing data, currencies, UTC window boundaries, persisted probabilities and truncation.

### `external-review`

Open a customer's external review tab; select one of that customer's project work products and create/revoke a version-bound link. A visitor uses `/review/:companyId/:linkId` with the secret in the fragment; API requests use the review-token header. Customer feedback remains separate from internal review resolution. [Board component](../../ui/src/pages/ExternalReview.tsx), [public view](../../ui/src/pages/PublicReview.tsx).

Verification: `not run` — cross-company/project denial, stale version, token expiry/revocation, response idempotency/CAS and concurrent agent approval creation.

### `crm-phone`

Open `/<company-prefix>/crm-phone` to inspect stored inbound call evidence, unresolved caller identity and callback requests. A callback is not a dialed call; the S95 worker uses the existing voice lifecycle with a separate CRM callback principal, consent/approval revalidation and provider-bound receipts. [Page](../../ui/src/pages/CrmPhone.tsx), [service](../../server/src/services/crm-phone.ts).

Verification: `not run` — actual report hook, ambiguous phone, consent/revocation, request replay, real-run scope and receipt binding.

### `commercial-maintenance`

Configure playbooks, confirmed commitments, service agreements and the Daily Brief agent preference through their existing pages. The scheduler drives bounded durable maintenance and creates explicitly pending preparation/delivery tasks. [Maintenance](../../server/src/services/commercial-automation.ts).

Verification: `not run` — more than twenty sources, cursor wrap/restart, two worker leases, response stop, renewal callback authority, timezone and provider receipt.

### `package-resources`

Open Portable Catalog to review source-pinned resources and install supported items as drafts. Receipts reference exact persisted provenance; a missing resource is a conflict. No form is published and no playbook is started automatically. [Installer](../../server/src/services/productization/package-resources.ts).

Verification: `not run` — conflicting manual identity, claim race, failure/restart, missing domain row, dependency cancellation and pending hire approval.

### `crm-sync-state`

Open `/<company-prefix>/crm-sync`. Choose a current HubSpot/Pipedrive connection and map its exact live tool names, start or resume a job and resolve conflicts. The shared delegated gateway rechecks current grants/configuration/lease before dispatch. A required approval remains blocked until a durable approval executor exists. [Routes](../../server/src/routes/crm-sync.ts).

### `public-catalog`

Open `/catalog` to browse public versions, or `/<company-prefix>/public-catalog` to request publication, import and review installation-backed ratings. Publication requires explicit selected content and instance administrator review; imports do not hire agents or grant tools.

### `agency-workspace`

Open `/<company-prefix>/agency`. Select a published package from an account-linked company and confirm client setup. A capacity denial leaves the same target company archived for a later resume. The existing installer owns hires/approvals. Client users require explicit company ACL; custom domains remain unavailable.

### `webchat-agent-dispatch`

Open Webchat Settings, select an eligible agent and responsible user, then explicitly enable dispatch. Confirmed inbound messages create durable tasks and normal wakes. Replies still require ordinary governed message sending.

Verification: `not run` — missing invoker, identity grant revocation, conflict resolution, resume and unknown create outcome. A status response does not prove synchronization.
