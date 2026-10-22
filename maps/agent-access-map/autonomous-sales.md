# Autonomous sales and delivery (Sprint 3) - agent access

Product map: [autonomous-sales](../feature-map/autonomous-sales.md).

## `playbooks`

Review: `baseline`.

API: `present` - GET/POST /api/companies/{companyId}/playbooks; GET /api/companies/{companyId}/playbooks/templates; POST /api/companies/{companyId}/playbooks/from-template; GET/PATCH /api/playbooks/{id}; POST /api/playbooks/{id}/publish|new-draft|archive; GET/POST /api/companies/{companyId}/playbook-runs; GET /api/playbook-runs/{id}; POST /api/playbook-runs/{id}/advance|pause|resume|cancel.

Agent access: `restricted` - playbook_start, playbook_get_run and playbook_advance act only on runs assigned to the calling agent and only on the current step. Authoring, publishing, pause, resume and cancel are board only.

Policy: Active run identity, current assignment, company/resource authorization, work mode and existing approvals/budgets remain required where applicable. Effective step autonomy is min(step, granted level).

Evidence: `source-only` - [routes](../../server/src/routes/playbooks.ts).

Verification: `not-run` - follow the paired disposable-company journey with a real permitted agent and assert the stale-step 409 and the board-only 403.

Gaps: Subjects (lead, opportunity, conversation, customer) are opaque ids until Sprint 2 tables exist.

## `autonomy`

Review: `baseline`.

API: `present` - GET /api/companies/{companyId}/autonomy; GET /api/companies/{companyId}/autonomy/effective; GET /api/companies/{companyId}/autonomy/history; POST /api/companies/{companyId}/autonomy/grant|revoke|shadow-outcomes|bench; GET /api/companies/{companyId}/autonomy/bench; GET /api/autonomy-bench-runs/{id}.

Agent access: `restricted` - agents read their effective level and history and record their own shadow outcomes. Grant, revoke and bench are board only; raising above draft_only requires a passing bench run.

Policy: Active run identity, company authorization and work mode remain required. Revocation disables pending playbook triggers of the agent.

Evidence: `source-only` - [routes](../../server/src/routes/autonomy.ts).

Verification: `not-run` - grant without bench must return 409; revoke must disable queued triggers.

Gaps: Queued Sprint 2 messages are cancelled through an injected hook that is not wired yet.

## `commercial-decisions`

Review: `baseline`.

API: `present` - GET/POST /api/companies/{companyId}/commercial-decisions; GET /api/commercial-decisions/{id}; POST /api/commercial-decisions/{id}/resolve|remote-link; public GET /api/public/decisions/{token}; public POST /api/public/decisions/{token}/resolve.

Agent access: `restricted` - decision_create and decision_get originate from an issue-bound agent run. Resolution is board only or through a one-time remote token that expires.

Policy: Subject version mismatch returns 409; used or expired tokens return 410; effects apply at most once.

Evidence: `source-only` - [routes](../../server/src/routes/commercial-decisions.ts).

Verification: `not-run` - resolve twice and assert a single effect; use an expired token and assert 410.

Gaps: Effect handlers for Sprint 2 subjects are injected later; unknown effects are recorded as pending.

## `proposals`

Review: `baseline`.

API: `present` - GET/POST /api/companies/{companyId}/proposals; GET /api/proposals/{id}; GET /api/proposals/{id}/revisions; POST /api/proposals/{id}/revise|send; public GET /api/public/proposals/{token}; GET /api/public/proposals/{token}/view; POST /api/public/proposals/{token}/accept|reject; POST /api/public/stripe/webhook.

Agent access: `available` - proposal_create, proposal_send and proposal_get use the authenticated API in Standard mode. A sent revision is immutable; changes create a new revision.

Policy: Company scoping, Stripe secrets per company (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET), signed webhook or 401.

Evidence: `source-only` - [routes](../../server/src/routes/proposals.ts).

Verification: `not-run` - accept a non-sent revision and assert 409; post an unsigned webhook and assert 401.

Gaps: The /p/:company/proposal/:token router belongs to Sprint 2; the public page is /api/public/proposals/{token}/view for now.

## `handoff`

Review: `baseline`.

API: `present` - POST /api/companies/{companyId}/handoffs/from-proposal|from-opportunity; GET /api/companies/{companyId}/handoffs; GET /api/handoffs/{id}; POST /api/handoffs/{id}/retry.

Agent access: `available` - handoff_to_delivery is idempotent per source and resumable; retry is board only.

Policy: Requires an accepted proposal; the assignment is created through the Sprint 1 assignment service with its own authorization.

Evidence: `source-only` - [routes](../../server/src/routes/handoff.ts).

Verification: `not-run` - call twice and assert one project and one assignment.

Gaps: Team install is best effort and may commit outside the handoff transaction.

## `agreements`

Review: `baseline`.

API: `present` - GET/POST /api/companies/{companyId}/service-agreements; GET/PATCH /api/service-agreements/{id}; POST /api/service-agreements/{id}/cancel; GET /api/service-agreements/{id}/periods; POST /api/companies/{companyId}/service-agreements/tick; POST /api/companies/{companyId}/upsell-suggestions.

Agent access: `restricted` - agreement_get reads; upsell_suggest only records a suggestion in the activity log. Agreement CRUD and the cycle tick are board only.

Policy: One assignment per period; renewal proposal and decision ids are stored once.

Evidence: `source-only` - [routes](../../server/src/routes/service-agreements.ts).

Verification: `not-run` - tick twice and assert one assignment per period.

Gaps: Renewal proposal and decision creation are injected dependencies not wired yet.

## `qualification`

Review: `baseline`.

API: `present` - POST /api/companies/{companyId}/leads/{leadId}/qualify; GET /api/companies/{companyId}/leads/{leadId}/qualifications; POST /api/companies/{companyId}/enrichment; POST /api/companies/{companyId}/conversations/{conversationId}/commitments/extract; POST /api/companies/{companyId}/commercial-triggers.

Agent access: `available` - lead_qualify, lead_enrich and commitments_extract use the authenticated API in Standard mode. Enrichment requires an agent actor and a configured provider (422 otherwise) and records a cost receipt.

Policy: Criteria come from a context file with role procedure named qualification-criteria; missing criteria return 422.

Evidence: `source-only` - [routes](../../server/src/routes/leads.ts).

Verification: `not-run` - qualify without criteria and assert 422.

Gaps: No lead, conversation or commitment tables yet; ids are not validated against Sprint 2 data.

## `explain`

Review: `baseline`.

API: `present` - GET /api/companies/{companyId}/agent-actions/{actionId}/explain?kind=decision|run|tool_action|proposal|playbook_run.

Agent access: `available` - read only through the normal company boundary; no writes to the run log.

Policy: Company scoping; actions of another company return 404.

Evidence: `source-only` - [routes](../../server/src/routes/agent-explain.ts).

Verification: `not-run` - explain a run and assert context reads, tool calls and autonomy level appear.

Gaps: Conversation message and calendar receipts arrive with Sprint 2.

## `daily-brief`

Review: `baseline`.

API: `present` - GET/PATCH /api/companies/{companyId}/daily-brief/preferences; GET /api/companies/{companyId}/daily-brief/preview.

Agent access: `restricted` - board users only; agents receive 403.

Policy: One attempt per user per local day; the send channel is injected.

Evidence: `source-only` - [routes](../../server/src/routes/daily-brief.ts).

Verification: `not-run` - tick at the configured hour twice and assert one send.

Gaps: No email or WhatsApp delivery is wired; ticks record "no delivery channel configured".
