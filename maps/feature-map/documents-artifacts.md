---
navigation: {"section":"Tasks and conversations","sectionOrder":20,"order":70}
---

# Documents, attachments, and work products

People read and revise task documents, annotate specific content, open attached files, and inspect the outputs an agent hands back. The Artifacts explorer at `/artifacts` provides another route to the same work, and it is also where the company files (Entrada) live.

Implementation: [task documents](../../ui/src/components/IssueDocumentsSection.tsx), [document panel](../../ui/src/components/task-side-panel/TaskDocumentPanel.tsx), [artifacts explorer](../../ui/src/pages/artifacts/ArtifactsExplorer.tsx) and its [components](../../ui/src/components/artifacts/explorer/). The explorer is the only Artifacts page.

Agent access: [companion](../agent-access-map/documents-artifacts.md).

## Sub-features

- `documents`: edit versioned task documents and inspect or restore revisions.
- `annotations`: attach feedback to document content and inspect resolution state.
- `attachments`: upload, preview, and download allowed files with company access checks. The explorer preview pane renders each supported file type.
- `work-products`: link deliverables to their source task, resource, and review context.
- `library`: browse Entrada and Salida in the explorer: folder tree, list and icon views, sorting, back/forward navigation, search, "View output by" groupings, and quick views (Favorites, Recent, Uploaded by me).
- `company-files`: browse Entrada, the shared company file library, star files, and see which tasks read each file.

## How to get to it (user POV)

### `task-document`

Open a document from the task thread or document side panel.

### `task-output`

Open an attachment, output card, or file link from a task.
For direct uploads, use the task side panel's **Open a new tab → Artifacts →
Upload files** or drop files anywhere in that panel. On mobile, open
**More actions → Properties** first. Agent conversations do not expose this upload path.

### `artifact-library`

Open `/artifacts`, choose Salida, and use the tree, search, "View output by" groupings and the preview pane.

### `company-files`

Open the artifact explorer at `/artifacts` and choose Entrada. Open a file to see its versions and its **Usado en** list of tasks that read it. Star a file from the preview pane or the row menu, then open **Acceso rápido › Favoritos** to see starred files.

### `explorer-salida`

Open `/artifacts`, then choose **Salida**. Expand `Proyectos`, a project, and a task to reach agent outputs. Selecting a row opens its preview pane; double-click or the fullscreen control opens the full-screen viewer.

### `explorer-entrada`

Open `/artifacts`, choose **Entrada**, then use **Subir**, **+ Carpeta**, drag-and-drop, or the row context menu (rename, move, replace version, delete). From a Salida file's context menu, **Mover a Entrada** copies the artifact into a chosen folder. The quick views **Favoritos**, **Recientes** and **Subidos por mí** list Entrada files by star, recency and uploader.

## Driving it with Playwright and the Paperclip CLI

Preconditions: follow the [baseline](./README.md#before-driving-a-journey). Use a task with a text document, a small attachment, and a generated work product. Use nonsensitive fixture files.

### `task-document`

Automated: [documents service](../../server/src/__tests__/documents-service.test.ts), [annotations](../../server/src/__tests__/document-annotations-service.test.ts), and [revision restore](../../server/src/__tests__/issue-document-restore-routes.test.ts) cover server contracts.

Manual: Edit a paragraph, save, reload, and compare revisions. Add an annotation to a specific selection and inspect it after another edit. Resolve it through the supported action. Restore a disposable revision and confirm the new current document and history agree.

### `task-output`

Automated: [attachment routes](../../server/src/__tests__/issue-attachment-routes.test.ts) and [work products](../../server/src/__tests__/work-products.test.ts) cover data/access behavior; [artifact arrival browser suite](../../tests/e2e/artifact-tab-arrival.spec.ts) targets arrival. [Artifact uploads](../../tests/e2e/artifact-uploads.spec.ts) drives file selection/drop, filename collisions, retry, and preservation of paused/unassigned tasks.

Manual: Upload a small Markdown file and CSV through Artifacts. Markdown becomes
a versioned task document; other files become attachments. Read the document,
download the CSV and compare bytes, then reload. Upload the same Markdown filename
again and verify a separate suffixed document without overwriting the original.
On a paused unassigned task, confirm upload does not start work or add comments.
Verify agent-produced work products separately using an eligible test run.
Test an inaccessible user/company and explicit missing workspace-only resources.

### `artifact-library`

Automated: [explorer page](../../ui/src/pages/artifacts/ArtifactsExplorer.test.tsx) covers the Salida tree children and artifact selection with mocked APIs. The previous library page and its stack grouping tests were removed with it; the explorer's grouping and search are covered by its service tests (see `explorer-salida`).

Manual: In Salida, find the task’s output through the tree or search, group by agent or file type, open its preview, and reload the `?sel=` URL. Confirm the same file/content appears as from the task.

### `company-files`

Preconditions: a company with a few Entrada files (use one that a run has read), and a disposable agent run.

Automated: [company files routes](../../server/src/__tests__/company-files-routes.test.ts) cover upload, versions, rename/move, soft delete and restore, Range reads, agent read recording into usage, refused agent writes, cross-company denial and from-artifact copies. [Wake index](../../server/src/services/heartbeat/company-files-context.test.ts) and [native runner tools](../../server/src/services/native-runtime/runner-company-files.test.ts) cover the agent read path with mocks. No browser test covers the Entrada screen.

Manual: Open Entrada, open a file, and confirm the version list and the **Usado en** list after a run has read it. Reload and compare the usage count with `GET /api/company-files/{id}/usage`. Confirm that no agent-side action changes the file.

### `explorer-salida`

Preconditions: a task with a PDF, XLSX, HTML, CSV, JSON, Markdown, image and text output, all from fixtures.

Automated: [explorer page](../../ui/src/pages/artifacts/ArtifactsExplorer.test.tsx) covers Entrada root folders, Salida tree children, preview selection, sort toggling, ArrowDown, the context menu, quick views, stars and the usage list with mocked APIs. [Preview pane](../../ui/src/components/artifacts/explorer/ArtifactPreviewPane.test.tsx) and [type detection](../../ui/src/components/artifacts/explorer/preview-target.test.ts) cover the pane states. [Artifact service](../../server/src/__tests__/company-artifacts-service.test.ts) covers the tree aggregates, sorting, agent grouping, `issueId` filter and `byteSize`.

Manual: Open `/artifacts`, choose Salida, and expand a project to a task. Select the PDF and confirm the browser's inline viewer shows it; download it and compare bytes. Select the XLSX and check the table and sheet selector. Toggle the HTML view between rendered and code. Use ↑ ↓ Enter Backspace Space Esc F2 and Delete, right-click for the menu, and reload a `?sel=` URL to confirm the same selection. Narrow the window below 900px to see the bottom-sheet preview. Gaps: no browser e2e for the explorer; `groupBy=media_kind` and `groupBy=day` have no service test; PDF and XLSX rendering is checked only with Storybook fixtures, not a live file.

### `explorer-entrada`

Preconditions: a disposable company with default folders, and a small Markdown and CSV file.

Automated: [company files routes](../../server/src/__tests__/company-files-routes.test.ts) cover create, version, rename/move, delete, restore and folder rules. [Inbox dialogs](../../ui/src/components/artifacts/explorer/inbox/inbox-dialogs.test.tsx) cover new folder, rename, delete confirmation, replace version, move to Entrada and server errors inside the dialog, using mocks.

Manual: Create a folder under Marca, upload the Markdown and the CSV, rename one, and move it to Precios. Replace the Markdown with a second version and confirm the version number rises while the file id stays the same. Delete a file and restore it through the API. Try to delete a non-empty folder and confirm the message. Upload a disallowed type and confirm it is refused. From a Salida artifact, use **Mover a Entrada** and check the new file. Gaps: no browser test for drag-and-drop; per-file permissions are not part of this version.

## Gotchas

- A local path is not automatically an uploaded artifact accessible to another user.
- A preview screenshot is not proof that download bytes or revision references are correct.
- Version conflicts and stale annotations must stay visible rather than silently targeting different content.
- `/artifacts` is always the explorer. Company-file and artifact-tree API routes are always mounted, and the explorer is the only UI on top of them.
- Entrada is visible to the whole company and cannot be restricted per file. Agent reads are recorded and shown under **Usado en**. Deliverables belong on the task, not in Entrada.
- Salida is read-only. Its `-vN` grouping is a name pattern, not stored versions.
- The PDF iframe is not sandboxed and depends on the browser's PDF viewer; some mobile browsers download instead.
- "Subido por" shows the uploader's account name, falling back to email; an empty value shows `—`. Favorites, recents and "Uploaded by me" are live quick views; stars are per board user, and agents cannot star.

### Storybook verification

#### `documents`

Scope: ui
Storybook: Writable/read-only document, save pending/failure/conflict, revision history/historical preview and restore confirmation.
Production: Persist edited body and reload; append-only restore creates new revision; reject stale writes and inaccessible company/task.
Sources: Source: [IssueDocumentsSection.tsx](../../ui/src/components/IssueDocumentsSection.tsx), [TaskDocumentPanel.tsx](../../ui/src/components/task-side-panel/TaskDocumentPanel.tsx), [documents.ts](../../server/src/services/documents.ts). Tests: [IssueDocumentsSection.test.tsx](../../ui/src/components/IssueDocumentsSection.test.tsx), [document-revisions.test.ts](../../ui/src/lib/document-revisions.test.ts), [documents-service.test.ts](../../server/src/__tests__/documents-service.test.ts), [issue-document-restore-routes.test.ts](../../server/src/__tests__/issue-document-restore-routes.test.ts)

#### `attachments`

Scope: ui
Storybook: Explorer preview pane per file type (image, video, PDF, Markdown, HTML, CSV, spreadsheet, text, unsupported download) with metadata, actions and version list; fixtures only.
Production: Preview a real Entrada or Salida file from a running instance, comparing bytes with download; PDF and XLSX rendering is not proven by the story.
Sources: Source: [ArtifactPreviewPane.tsx](../../ui/src/components/artifacts/explorer/ArtifactPreviewPane.tsx), [viewers](../../ui/src/components/artifacts/explorer/viewers/), [preview-target.ts](../../ui/src/components/artifacts/explorer/preview-target.ts). Story: [ArtifactPreviewPane.stories.tsx](../../ui/storybook/stories/documents-artifacts/ArtifactPreviewPane.stories.tsx). Tests: [ArtifactPreviewPane.test.tsx](../../ui/src/components/artifacts/explorer/ArtifactPreviewPane.test.tsx), [preview-target.test.ts](../../ui/src/components/artifacts/explorer/preview-target.test.ts)

### Documentation scope: Artifacts and work products

Document/attachment/library/work-product journeys are mapped; every media preview type, storage backend, annotation conflict, and runtime-resource lifecycle variant remains separate.
