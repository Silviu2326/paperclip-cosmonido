---
name: review-deliverables
description: Inspect actual Paperclip task outputs and request specific corrections.
---

Resolve the task with `paperclip_search_tasks` when the user provides a title or identifier. Read the task, list its deliverables and inspect relevant documents before judging completion. Separate observed output from missing evidence and check the task's stated acceptance criteria.

When the user asks for a correction, add one concise comment with an explicit requestId. Do not approve a governed review or mark work complete on the agent's behalf. Return links to the inspected evidence and the current task status.
