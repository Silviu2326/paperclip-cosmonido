# Assignments, context and media delivery - agent access

Product map: [assignments](../feature-map/assignments.md).

## `create`

Review: `baseline`.

API: `present` - GET/POST /api/companies/{companyId}/assignments; GET/PATCH /api/assignments/{id}; POST /api/assignments/{id}/cancel; GET /api/issues/{id}/assignment.

Agent access: `restricted` - get_assignment reads the current assignment. Board creates, changes and cancels; agents cannot impersonate its human buyer.

Policy: Active run identity, current assignment, company/resource authorization, work mode and existing approvals/budgets remain required where applicable.

Evidence: `source-only` - [routes](../../server/src/routes/assignments.ts).

Verification: `not-run` - follow the paired disposable-company journey with a real permitted agent and assert the relevant denied company, project, mode or human resolver. Unit/API fixtures are separate evidence.

Gaps: Live provider and native-agent qualification is not implied by catalog declarations; use current run results for acceptance.

## `review`

Review: `baseline`.

API: `present` - POST /api/companies/{companyId}/deliverable-reviews; GET /api/goals/{id}/deliverable-reviews; GET /api/issues/{id}/deliverable-reviews; POST /api/deliverable-reviews/{id}/resolve.

Agent access: `restricted` - submit_deliverable_for_review submits an exact target/version in Standard mode. Resolution is human board only; stale work-product timestamps and changed review revisions fail. Deleted/purging files and missing immutable target versions cannot be resolved. An accepted immutable version grants no acceptance to newer content.

Policy: Active run identity, current assignment, company/resource authorization, work mode and existing approvals/budgets remain required where applicable.

Evidence: `source-only` - [routes](../../server/src/routes/deliverable-reviews.ts).

Verification: `not-run` - follow the paired disposable-company journey with a real permitted agent and assert the relevant denied company, project, mode or human resolver. Unit/API fixtures are separate evidence.

Gaps: Live provider and native-agent qualification is not implied by catalog declarations; use current run results for acceptance.

## `context`

Review: `baseline`.

API: `present` - GET /api/companies/{companyId}/context; GET /api/companies/{companyId}/context/{fileId}; PATCH /api/company-files/{id}; GET /api/assignments/{id}/context-usage.

Agent access: `available` - context_search/context_get infer project and task from the authenticated active run. Company, project, folder visibility and expiration checks remain authoritative; editing and usage summary are board operations.

Policy: Active run identity, current assignment, company/resource authorization, work mode and existing approvals/budgets remain required where applicable.

Evidence: `source-only` - [routes](../../server/src/routes/company-files.ts).

Verification: `not-run` - follow the paired disposable-company journey with a real permitted agent and assert the relevant denied company, project, mode or human resolver. Unit/API fixtures are separate evidence.

Gaps: Live provider and native-agent qualification is not implied by catalog declarations; use current run results for acceptance.

## `media`

Review: `baseline`.

API: `present` - POST /api/companies/{companyId}/media-projects; GET /api/media-projects/{id}; POST /api/media-projects/{id}/transcribe|detect-silences|detect-fillers|operations|render|dub; GET /api/media-jobs/{id}; GET /api/companies/{companyId}/media-jobs?goalId={goalId}.

Agent access: `available` - media_ingest/transcribe/detect_silences/detect_fillers/cut/subtitle/export/dub/get_project/get_job use authenticated APIs. Mutations require Standard/skill-test mode; asset, issue, company and budget boundaries and paid-provider credentials apply.

Policy: Active run identity, current assignment, company/resource authorization, work mode and existing approvals/budgets remain required where applicable.

Evidence: `source-only` - [routes](../../server/src/routes/media-studio.ts).

Verification: `not-run` - follow the paired disposable-company journey with a real permitted agent and assert the relevant denied company, project, mode or human resolver. Unit/API fixtures are separate evidence.

Gaps: Live provider and native-agent qualification is not implied by catalog declarations; use current run results for acceptance.

## `costs`

Review: `baseline`.

API: `present` - GET /api/companies/{companyId}/costs/by-goal; GET /api/goals/{id}/cost-summary.

Agent access: `available` - REST/native call_api retain existing cost-read authorization. get_assignment reports budget availability honestly if its actor lacks reporting access.

Policy: Active run identity, current assignment, company/resource authorization, work mode and existing approvals/budgets remain required where applicable.

Evidence: `source-only` - [routes](../../server/src/routes/costs.ts).

Verification: `not-run` - follow the paired disposable-company journey with a real permitted agent and assert the relevant denied company, project, mode or human resolver. Unit/API fixtures are separate evidence.

Gaps: Live provider and native-agent qualification is not implied by catalog declarations; use current run results for acceptance.

## `dashboard`

Review: `baseline`.

API: `present` - GET /api/companies/{companyId}/dashboard.

Agent access: `available` - REST/native call_api use the normal company access boundary. A failed section cannot grant access or fabricate a zero amount.

Policy: Active run identity, current assignment, company/resource authorization, work mode and existing approvals/budgets remain required where applicable.

Evidence: `source-only` - [routes](../../server/src/routes/dashboard.ts).

Verification: `not-run` - follow the paired disposable-company journey with a real permitted agent and assert the relevant denied company, project, mode or human resolver. Unit/API fixtures are separate evidence.

Gaps: Live provider and native-agent qualification is not implied by catalog declarations; use current run results for acceptance.

## `content-team`

Review: `baseline`.

API: `present` - GET /api/teams/catalog; existing team install/import routes.

Agent access: `partial` - The optional package declares role instructions and exact skill/tool names; installation does not grant new tools or provider credentials. Use existing catalog/import authority.

Policy: Active run identity, current assignment, company/resource authorization, work mode and existing approvals/budgets remain required where applicable.

Evidence: `source-only` - [routes](../../server/src/routes/teams-catalog.ts).

Verification: `not-run` - follow the paired disposable-company journey with a real permitted agent and assert the relevant denied company, project, mode or human resolver. Unit/API fixtures are separate evidence.

Gaps: Live provider and native-agent qualification is not implied by catalog declarations; use current run results for acceptance.

