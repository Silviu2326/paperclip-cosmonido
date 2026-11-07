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

API: `present` - POST /api/companies/{companyId}/media-projects (source or `creationType: motor_video`); GET /api/media-projects/{id}; POST /api/media-projects/{id}/transcribe|detect-silences|detect-fillers|operations|render|dub|motor-video-render; POST /api/media-jobs/{id}/cancel; GET /api/media-jobs/{id}; GET /api/companies/{companyId}/media-jobs?goalId={goalId}.

Agent access: `available` - media_ingest/transcribe/detect_silences/detect_fillers/cut/subtitle/export/dub/get_project/get_job use authenticated APIs. Motor Video creation uses authenticated agent REST or native `call_api`: create a `motor_video` project then POST `motor-video-render` with a validated spec and stable idempotency key. Authenticated REST cancellation is task-scoped; queued jobs can be cancelled, and an active render can be cancelled only for Motor Video. Mutations require Standard/skill-test mode; asset, issue, company and budget boundaries and paid-provider credentials apply. Per-action grants gate analyze, edit and create-video; legacy `media:generate` temporarily covers all three.

Policy: Active run identity, current assignment, company/resource authorization, work mode and existing approvals/budgets remain required where applicable. Project/job reads stay ACL-scoped without a generation grant. Cancellation uses the owning task's media action grant; active cancellation moves Motor Video through `cancel_requested` and `finalizing` is no longer cancellable. Motor Video accepts only same-company, actor-readable assets, explicit durations and bounded supported media types; pending image generation and generated speech are rejected. `PAPERCLIP_MOTOR_VIDEO_ENTRY` and runtime dependencies are operator provisioned; see [rendering configuration](../../doc/media-video-rendering.md).

Evidence: `source-only` - [routes](../../server/src/routes/media-studio.ts), [worker](../../server/src/services/media-studio.ts), [Motor Video adapter](../../server/src/services/media-studio/motor-video.ts), [runtime setup](../../doc/media-video-rendering.md) and generated migrations `0368_media_projects_motor_video`, `0369_media_job_cancellation`. Migrations are not applied to a live instance; no live render evidence yet.

Verification: `not-run` - follow the paired disposable-company journey with a real permitted agent; assert allowed/denied analyze, edit and create-video grants, foreign/private asset denial, idempotent render, unsupported spec rejection, queued cancellation, active Motor Video cancellation, and 409 for cancelling another running media kind. Inspect task work product, final status and quota settlement. Unit/API fixtures are separate evidence.

Gaps: Apply both pending media migrations, provision the Motor Video CLI/runtime, and run the paired journey with an installed engine. Live provider and native-agent qualification is not implied by catalog declarations.

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

