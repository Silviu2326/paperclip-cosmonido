# Opportunities and the sales pipeline - agent access

Product map: [opportunities](../feature-map/opportunities.md).

## `create`

Review: `baseline`.

API: `present` - POST /api/companies/{companyId}/opportunities.

Agent access: `available` - crm_create_opportunity dispatches to the create route through the native runner (services/sprint2-tools.ts).

Policy: assertCompanyAccess; the customer must belong to the company; creation is not an external action and is not gated. The idempotency key is stored as an activity reference.

Evidence: `source-only` - [routes](../../server/src/routes/crm.ts), [service](../../server/src/services/crm/opportunities.ts).

Verification: `not-run` - create twice with one key as an agent and confirm one row; create against another company's customer and confirm denial.

Gaps: the idempotency reference has no unique index, so two concurrent requests with one key can create two rows.

## `pipeline`

Review: `baseline`.

API: `present` - GET /api/companies/{companyId}/opportunities?customerId=&stageKey=&limit=.

Agent access: `partial` - there is no dedicated pipeline read tool; the REST list is reachable with the agent's company-scoped key but is not in the native API catalog.

Policy: company-scoped list; no owner filter bypasses company checks.

Evidence: `source-only` - [routes](../../server/src/routes/crm.ts).

Verification: `not-run` - list opportunities as an agent and confirm only the run's company appears.

Gaps: a dedicated read tool for the pipeline is absent; native call_api does not list these routes.

## `stage-change`

Review: `baseline`.

API: `present` - POST /api/opportunities/{id}/stage.

Agent access: `available` - crm_update_opportunity_stage dispatches to the stage route. Under draft-only policy the call returns 202 with a pending action and leaves the stage unchanged.

Policy: the route goes through gateExternalAction with actionType stage_change. A board user applies the change directly (200). An agent follows its stage_change autonomy level; the key is stage_change:<id>:<expectedVersion>:<stageKey>. A stale expectedVersion returns 409 version_conflict.

Evidence: `source-only` - [routes](../../server/src/routes/crm.ts), [gate](../../server/src/services/external-action-gate.ts).

Verification: `not-run` - as an agent under draft-only, request a move and confirm 202 with the stage unchanged; approve the pending action after granting approval and confirm the stage changes once.

Gaps: approval execution has not been exercised with a live agent run.

## `close`

Review: `baseline`.

API: `present` - POST /api/opportunities/{id}/close.

Agent access: `available` - reached by the stage tools with outcome won or lost; the same gate applies.

Policy: same gate and key scheme as stage-change, with an expected version check.

Evidence: `source-only` - [routes](../../server/src/routes/crm.ts).

Verification: `not-run` - close as an agent under draft-only and confirm the opportunity remains open until approval.

Gaps: the close path is not a separate agent tool in the admitted list; it is reached through the stage tool only.

## `next-action`

Review: `baseline`.

API: `present` - POST /api/opportunities/{id}/next-action.

Agent access: `available` - crm_set_next_action dispatches to this route.

Policy: assertCompanyAccess; the optional expected version protects concurrent edits.

Evidence: `source-only` - [routes](../../server/src/routes/crm.ts).

Verification: `not-run` - set a next action as an agent and confirm it persists on the opportunity.

Gaps: none beyond the shared gaps of the pipeline.

## `customer-tab`

Review: `baseline`.

API: `present` - GET /api/companies/{companyId}/opportunities?customerId={id}.

Agent access: `partial` - same as `pipeline`; an agent can list a customer's opportunities only through REST.

Policy: company-scoped; the customer filter does not widen access.

Evidence: `source-only` - [routes](../../server/src/routes/crm.ts).

Verification: `not-run` - list by customer as an agent and confirm another company's customer returns nothing.

Gaps: no dedicated agent read tool.
