# Leads intake and qualification - agent access

Product map: [leads](../feature-map/leads.md).

## `intake`

Review: `baseline`.

API: `present` - GET /api/companies/{companyId}/leads; POST /api/companies/{companyId}/leads; POST /api/companies/{companyId}/leads/import/preview; POST /api/companies/{companyId}/leads/import; public POST /api/p/{companySlug}/form/{formSlug}.

Agent access: `partial` - lead_list and lead_get read leads; creating a lead has no dedicated tool and uses REST with the agent key. The public form is visitor-only.

Policy: company-scoped; a public form resolves the company from its slug and rate-limits submissions; source and source reference identify duplicates.

Evidence: `source-only` - [routes](../../server/src/routes/leads.ts), [public form](../../server/src/routes/public/leads.ts), [intake](../../server/src/services/leads/intake.ts).

Verification: `not-run` - submit the same form twice and confirm one lead; import a preview then confirm the import as an agent with REST.

Gaps: no dedicated agent create tool or bulk endpoint. The board manual-intake dialog uses the existing POST; form authoring is separate at `/sales/forms`. Bulk board actions issue bounded per-lead requests through the existing endpoints.

## `edit`

Review: `baseline`.

API: `present` - PATCH /api/leads/{id}.

Agent access: `partial` - REST with the existing company-scoped agent key; no dedicated edit tool.

Policy: existing lead access checks; the board picker lists only the company's human/agent directory and clears the other assignee kind when switching.

Evidence: `source-only` - [editor](../../ui/src/components/crm/LeadEditorDialog.tsx), [routes](../../server/src/routes/leads.ts).

Verification: `not-run` for live agent authorization; component regressions pass for payload preservation and exclusive assignment.

Gaps: no dedicated edit tool; the API has no optimistic version field for lead edits.

## `triage`

Review: `baseline`.

API: `present` - POST /api/leads/{id}/triage.

Agent access: `available` - lead_triage dispatches to this route.

Policy: assertCompanyAccess; triage of a converted or discarded lead returns 409.

Evidence: `source-only` - [routes](../../server/src/routes/leads.ts), [tools](../../server/src/services/leads/lead-tools.ts).

Verification: `not-run` - triage an open lead as an agent and confirm the priority; triage a converted lead and confirm 409.

Gaps: none beyond the shared gaps of intake.

## `convert`

Review: `baseline`.

API: `present` - POST /api/leads/{id}/convert.

Agent access: `available` - lead_convert dispatches to this route with an idempotency key.

Policy: assertCompanyAccess; a repeated key returns the same result; a different key on a converted lead is a conflict. Conversion creates records but does not send messages, so it is not gated.

Evidence: `source-only` - [routes](../../server/src/routes/leads.ts), [service](../../server/src/services/leads/leads.ts).

Verification: `not-run` - convert with one key twice and confirm one customer; convert with another key and confirm 409.

Gaps: the opportunity created by conversion uses the sales pipeline defaults and inherits the lead's assignment; its gate is the same as opportunity creation.

## `discard`

Review: `baseline`.

API: `present` - POST /api/leads/{id}/discard.

Agent access: `partial` - no dedicated discard tool; REST only.

Policy: assertCompanyAccess; discard reason is optional and stored.

Evidence: `source-only` - [routes](../../server/src/routes/leads.ts).

Verification: `not-run` - discard as an agent and confirm the status and reason.

Gaps: no dedicated agent tool.

## `activity`

Review: `baseline`.

API: `present` - GET /api/leads/{id}/activity; GET/POST /api/companies/{companyId}/crm/activities with subjectKind=lead.

Agent access: `partial` - readable through REST with the agent key; no dedicated tool.

Policy: assertCompanyAccess on the lead's company.

Evidence: `source-only` - [routes](../../server/src/routes/leads.ts).

Verification: `not-run` - read a lead's activity as an agent from another company and confirm denial.

Gaps: no dedicated agent tool.
