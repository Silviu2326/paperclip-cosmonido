---
navigation: {"section":"Projects and execution","sectionOrder":40,"order":15}
---

# Assignments, context and media delivery

Implementation: [assignments](../../ui/src/pages/Assignments.tsx), [context in Files](../../ui/src/components/artifacts/explorer/FileContextProperties.tsx), [media panel](../../ui/src/components/MediaProjectPanel.tsx).
Agent access: [companion](../agent-access-map/assignments.md).

## Sub-features

- `create`: create an assignment with criteria, responsible agent, expected deliverable and budget.
- `review`: submit and resolve a specific deliverable version; request changes with a reason. Resolution uses a full-precision PostgreSQL CAS and refuses deleted/purging file targets; accepting an immutable file version leaves newer versions unreviewed.
- `context`: manage current company/project context and inspect which files a task used.
- `media`: ingest, transcribe, edit, render and dub media assets with durable jobs; create new structured videos from authorized assets with Motor Video.
- `costs`: inspect assignment costs, descendant attribution and explicitly unattributed usage.
- `dashboard`: inspect current work, human decisions, reviews and today/week costs independently.
- `content-team`: install the optional content-and-video team and its four skills.

## How to get to it (user POV)

Open `/assignments`, choose New assignment, define the acceptance criteria before execution and select a responsible agent. Open `/assignments/:id` for the task tree, output reviews, context used and cost breakdown. Open `/context` for offer, brand, procedures and customer reference files. From `/artifacts`, select a video to inspect its media project and an exact output version to review it. The task output section also exposes its reviews. Use Costs > By assignment for the company report; the existing dashboard includes four result-oriented cards.

## Driving it with Playwright and the Paperclip CLI

Preconditions: use a disposable company with two agents/projects, a short video asset, and an isolated database. Provider tests use controlled responses; live transcription/dubbing requires company secrets and incurs provider usage.

1. Create twice with the same retry key and verify one assignment/root task. Reject foreign-company agent/project IDs.
2. Produce a work product and submit its exact updatedAt timestamp as the version. An agent cannot resolve it. Request changes, verify the reason comment and reopened task, then submit the new version and accept as a human. A stale version must return409 without accepting newer content.
3. Read context from one project; deny another project's file and agent-hidden folders. Expired files are absent by default and appear only with explicit includeExpired. Inspect recorded reads from the root and descendants.
4. Detect silence, remove a range, burn transcript subtitles and export 9:16. Poll the real job and play the resulting video. Retry its key and verify one job/cost receipt. Missing provider credentials must return 422 before paid work starts.
5. Create a `motor_video` project from the active task, submit a specification that references authorized Paperclip assets, and inspect the completed work product. Retry its key and confirm one job; an unowned asset, pending image generation node, or generated speech must be rejected. Cancel a queued job and an active render, then confirm only the render accepts live cancellation. This journey requires the operator-provisioned Motor Video runtime.
6. Attribute a child task's cost to its assignment. Company totals equal attributed plus unattributed totals. Fail one dashboard section and verify other cards remain usable.
7. Install the optional team from the catalog and inspect its role/skill references and produce-video-series task template.

Targeted evidence: [assignment integration](../../server/src/__tests__/assignment-services.integration.test.ts), [costs](../../server/src/__tests__/assignment-costs.test.ts), [dashboard isolation](../../server/src/__tests__/assignment-dashboard.test.ts), [tool modes](../../server/src/__tests__/product-tool-catalog.test.ts), [UI cards](../../ui/src/components/AssignmentDashboard.test.tsx).

S95 focused evidence: [review availability integration](../../server/src/__tests__/deliverable-review-availability.integration.test.ts) passed two PostgreSQL cases for a purging target and exact immutable-version acceptance. This is backend evidence, not the live journey above.

## Gotchas

- Completing a task alone does not prove human acceptance of its output.
- A stored assignment budget is not a separate enforcement policy; company/agent/project budget rules remain authoritative.
- Unpriced media usage must remain visible and cannot be represented as a verified zero charge.
- Source and catalog checks are not evidence that a live provider or native agent journey passed.
