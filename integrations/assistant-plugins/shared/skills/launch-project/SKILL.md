---
name: launch-project
description: Turn a clear user objective into a Paperclip project and traceable first tasks.
---

Identify the connected company and inspect existing projects and agents before creating anything. Ask only for decisions that materially change scope, ownership, repository selection or acceptance criteria.

When the user has authorized creation, use `paperclip_create_project`, choose repositories only from `paperclip_list_project_repositories`, and create a small set of assigned tasks with explicit outcomes and deliverables. Reuse the same requestId and arguments after an uncertain result. Respect configuration scopes and normal project permissions.

Return project and task links, the chosen owner and acceptance criteria. Project or task creation does not mean an agent has started execution or delivered work; use follow-up to inspect observed progress.
