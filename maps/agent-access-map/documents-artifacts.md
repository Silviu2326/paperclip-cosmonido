# Documents, attachments, and work products — agent access

Product map: [Documents, attachments, and work
products](../feature-map/documents-artifacts.md).

The UX integration note concerns presentation and navigation; it does not itself grant new file or artifact access. Any new media/context API or agent binding is not enumerated by the operation baselines below, which remain source-only.

Review date: 2026-10-12. Source commit: `f981fa3cc10cb8663a87dec60345fbff46d54d0a`.

This is a source-reviewed baseline of representative operations and known gaps.
Each capability needs operation-level review before its entire scope can be
qualified. No live agent execution is claimed. Follow the [map contract](../README.md)
for format, permission checks, evidence and maintenance.

## `documents`

Review: `baseline`.

API: `present` — representative operation IDs:

- `GET /api/issues/{id}/documents`.
- `PUT /api/issues/{id}/documents/{key}`.
- `POST /api/issues/{id}/documents/{key}/revisions/{revisionId}/restore`.

Agent access: `available` — Native list/read/write documents; other-task bridge; REST /
CLI / MCP.

Policy: Task/resource visibility, mutation/checkout ownership, revision/lock guards and
permitted deliverable context.

Evidence: `source-only` — [implementation](../../server/src/routes/issues.ts#L10299) at
the reviewed commit above.

Verification: `not-run` — exercise a listed permitted operation with actual agent
credentials/run context; inspect its result and applicable persistence/attribution.
Assert the relevant denied actor, owner, company or mode from Policy. Review the
remaining operations before qualifying the whole capability.

Gaps: Supported. Native helpers focus on the active task; generic API or explicit
other-task tools cover additional scope.

## `annotations`

Review: `baseline`.

API: `present` — representative operation IDs:

- `POST /api/issues/{id}/documents/{key}/annotations`.
- `PATCH /api/issues/{id}/documents/{key}/annotations/{threadId}`.

Agent access: `available` — REST / native call_api.

Policy: Task/resource visibility, mutation/checkout ownership, revision/lock guards and
permitted deliverable context.

Evidence: `source-only` — [implementation](../../server/src/routes/issues.ts#L10299) at
the reviewed commit above.

Verification: `not-run` — exercise a listed permitted operation with actual agent
credentials/run context; inspect its result and applicable persistence/attribution.
Assert the relevant denied actor, owner, company or mode from Policy. Review the
remaining operations before qualifying the whole capability.

Gaps: Annotation operations exist without a special annotation tool; check revision
anchors and resolver authority.

## `attachments`

Review: `baseline`.

API: `present` — representative operation IDs:

- `POST /api/companies/{companyId}/issues/{issueId}/attachments`.
- `GET /api/assets/{assetId}/content`.

Agent access: `available` — Native register_deliverable and API multipart/binary
support; REST / CLI / MCP transfers.

Policy: Task/resource visibility, mutation/checkout ownership, revision/lock guards and
permitted deliverable context.

Evidence: `source-only` — [implementation](../../server/src/routes/issues.ts#L10299) at
the reviewed commit above.

Verification: `not-run` — exercise a listed permitted operation with actual agent
credentials/run context; inspect its result and applicable persistence/attribution.
Assert the relevant denied actor, owner, company or mode from Policy. Review the
remaining operations before qualifying the whole capability.

Gaps: Native API uploads are bounded; attachment reading has target/provider and
permission conditions.

## `work-products`

Review: `baseline`.

API: `present` — representative operation IDs:

- `POST /api/issues/{id}/work-products`.
- `PATCH /api/work-products/{id}`.

Agent access: `available` — Native register_deliverable for file outputs; REST / native
call_api for metadata.

Policy: Task/resource visibility, mutation/checkout ownership, revision/lock guards and
permitted deliverable context.

Evidence: `source-only` — [implementation](../../server/src/routes/issues.ts#L10299) at
the reviewed commit above.

Verification: `not-run` — exercise a listed permitted operation with actual agent
credentials/run context; inspect its result and applicable persistence/attribution.
Assert the relevant denied actor, owner, company or mode from Policy. Review the
remaining operations before qualifying the whole capability.

Gaps: A registered reference does not prove uploaded bytes, external delivery, or
accepted review.

## `library`

Review: `baseline`.

API: `present` — representative operation IDs:

- `GET /api/companies/{companyId}/artifacts` (flat list; `sort`, `dir`, `issueId`, `groupBy=agent|media_kind|day|task|parent_task`).
- `GET /api/companies/{companyId}/artifacts/tree` (Salida folder tree; `node` = `root|projects|no_project|project:<id>|issue:<id>`).
- `GET /api/companies/{companyId}/artifacts/archive?node=issue:<id>|project:<id>` ZIP of the node's artifacts (board only; 422 when empty, 413 above 500 MB).
- `GET /api/attachments/{attachmentId}/thumbnail` 320px WebP for image attachments (board or agent, same access as `/content`; 404 otherwise).

Agent access: `available` — REST / native call_api.

Policy: Task/resource visibility, mutation/checkout ownership, revision/lock guards and
permitted deliverable context.

Evidence: `source-only` — [implementation](../../server/src/routes/issues.ts#L10299) at
the reviewed commit above.

Verification: `not-run` — exercise a listed permitted operation with actual agent
credentials/run context; inspect its result and applicable persistence/attribution.
Assert the relevant denied actor, owner, company or mode from Policy. Review the
remaining operations before qualifying the whole capability.

Gaps: Library search/filter uses the artifact API; no new tool needed merely to mirror
the UI.

## `company-files`

Review: `baseline`.

API: `present` — representative operation IDs:

- `GET /api/companies/{companyId}/files` lists files; `scope=all` lists every folder with `folderPath`, and `createdByMe` and `starred` filter to the board user (board only, 400 for agents).
- `PUT /api/companies/{companyId}/resource-memberships/me/company-files/{companyFileId}` stars a file for the board user (board only).
- `GET /api/company-files/{id}/content` reads the current or `?version=N` bytes.
- `GET /api/company-files/{id}/usage` lists the tasks that read the file (board preview "Usado en").
- `GET /api/company-files/{id}/thumbnail` 320px WebP of an image file's current version (board or agent; 404 for non-images and undecodable images).
- `GET /api/company-files/folders/{id}/archive` ZIP of a folder, recursive, current versions (board only; 422 when empty).
- `PATCH /api/company-files/folders/{id}` with `agentVisible` (board only) hides or shows a folder for agents; logs `folder.updated`.
- `PUT /api/companies/{companyId}/resource-memberships/me/company-files/{companyFileId}` stars or unstars a file for the board user; `GET .../resource-memberships/me` returns `starredCompanyFileIds` and `companyFileStarredAt`.
- `POST /api/companies/{companyId}/files/from-artifact` copies an attachment, work product or document (board only).

Agent access: `available` — native `list_company_files` and `read_company_file` on by default for every native run, independent of the Dot attachment grant; legacy REST `GET /api/company-files/{id}/content` with the run key; CLI `paperclip files list` and `paperclip files download <fileId> --out <path>`. Writes are `restricted` for agent identity and return 403.

Policy: Reads are scoped to the run's company; another company's file returns not found. A folder with `agentVisible = false` hides itself, its subfolders and their files from agents: they are absent from the task-context index, `list_company_files`, `GET /companies/{companyId}/files` and the tree, and `read_company_file` and the agent content, versions, usage and thumbnail routes return not found. The board is unaffected. Each read records a `company_file_reads` row and a `company_file.read` activity entry. The index in task context is metadata only. Native reads are not gated by the operator opt-in for task attachments (`dotAttachmentAccess`), and read contents go to the model provider.

Evidence: `source-only` — [company files service](../../server/src/services/company-files.ts), [native tools](../../server/src/services/native-runtime/runner-company-files.ts) and [CLI](../../cli/src/commands/client/files.ts) at the reviewed commit; unit tests cover scope, paging, cache, and recording, with no live agent run.

Verification: `not-run` — with an enabled native Dot run, list company files, read one with paging and `expectedSha256`, then confirm the board's "Usado en" list shows the run. Confirm a file from another company returns not found and that a legacy agent key cannot POST, PATCH or DELETE company files.

Gaps: Agent-hidden folders were verified only by embedded-Postgres route and runner tests, not in a live run. The task-context index is capped at 200 entries with a truncated flag. The native `folder` filter returns direct children only. Legacy adapters have no read tool and must use the REST route or CLI. Live proof is still missing.

Update 2026-10-21: the company-file routes above were re-checked against the working tree (uncommitted); the `/artifacts` explorer is the only Artifacts page, so the operations above have no experimental gate. Stars and `from-artifact` are board-only and carry no agent entry point.

