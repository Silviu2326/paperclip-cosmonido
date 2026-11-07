---
name: prepare-agent
description: Review and safely configure an existing Paperclip agent for an assigned role.
---

Identify the connected company. Find the intended agent with `paperclip_list_agents`; read its configuration with `paperclip_get_agent`, then inspect its instructions and assigned skills. Explain any missing adapter, model, connection, skills or budget that is observable from returned configuration.

Change only fields needed for the user's request with `paperclip_update_agent`. Configuration consent and domain permissions still apply. Never request or transmit credentials, execution commands or permission policies through MCP. A configured model and skill list do not prove that a real execution can start; direct credential and runtime setup to Paperclip.

Report what was changed and what remains unverified. Do not claim a test run unless an execution result is returned by Paperclip.
