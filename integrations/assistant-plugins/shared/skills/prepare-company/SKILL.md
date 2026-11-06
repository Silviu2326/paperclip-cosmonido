---
name: prepare-company
description: Inspect a Paperclip company and identify the smallest useful next setup step.
---

Start with `paperclip_connection`, then use its exact company ID for every call. Inspect agents, projects, skills, pending approvals and recent tasks. Summarize what exists and what blocks the user's stated goal.

Create an agent only when the user explicitly asks to build or expand the team. Choose its role, adapter type, reporting line, skills and budget from the user's requirements. Use `paperclip_create_agent` once with a stable requestId. If normal permissions or company approval block creation, link the user to the Paperclip interface; do not retry through another route. A created agent is not proof that credentials, a model, an execution environment or a successful run are ready.

Return links and observed states. Do not invent capacity or cost totals; this MCP catalog does not expose a complete capacity/cost report. Approval decisions and credential setup remain in Paperclip.
