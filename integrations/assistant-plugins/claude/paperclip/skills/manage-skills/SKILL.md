---
name: manage-skills
description: Create, edit, import, update and disconnect company skills through Paperclip's governed skill system.
---

Identify the company, inspect `paperclip_list_skills` and `paperclip_list_skill_sources`, then select the requested lifecycle operation. For an external GitHub source, use `paperclip_discover_skill_source` first, review its commit and candidate paths, preview important files with `paperclip_preview_skill_source_file`, then install only selected paths from that exact commit. Never import from a user-supplied non-GitHub URL or execute imported content.

Use source revision values for refresh and settings changes. Before disconnecting, explain the effect of keeping editable copies versus deleting imported skills and use only the user's explicit choice. Create or edit skill files through the existing skill tools and current version IDs. Normal skill policy, access provenance and validation remain authoritative.

Report installed version/source and any warnings. Do not claim an upstream update occurred unless Paperclip returns that result.
