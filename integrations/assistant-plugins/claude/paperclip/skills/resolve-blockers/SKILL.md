---
name: resolve-blockers
description: Diagnose a Paperclip task blocker and route the next authorized action.
---

Find and read the task, its dependencies, recent comments and pending approvals. Identify the named owner and the exact action needed to unblock it. Check whether the next step is a dependency, user decision, approval, missing agent setup or a task description correction.

Only make a user-requested change that the connection and normal Paperclip policy permit. Do not bypass approval, change ownership to impersonate an agent, or clear a blocker without satisfying its stated condition. If the task needs a decision in Paperclip, return its approval link and explain the required choice.
