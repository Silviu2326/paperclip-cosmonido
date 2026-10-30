# External action gate - agent access

Product map: [external-actions](../feature-map/external-actions.md).

## `policy`

Review: `baseline`.

API: `present` - GET /api/companies/{companyId}/autonomy; POST /api/companies/{companyId}/autonomy/grant; POST /api/companies/{companyId}/autonomy/revoke.

Agent access: `restricted` - granting or revoking autonomy is board-only (assertBoard); an agent cannot raise its own level.

Policy: the effective level is the agent's current grant, else the company grant, else draft only; revoked grants are ignored. Raising a level requires a passed bench (see the autonomous sales map).

Evidence: `source-only` - [autonomy routes](../../server/src/routes/autonomy.ts), [gate](../../server/src/services/external-action-gate.ts).

Verification: `not-run` - as an agent attempt a grant and confirm 403; as a board user grant after a passed bench and confirm the effective level.

Gaps: review_link is accepted by the gate and the policy validator but is missing from the matrix list.

## `draft`

Review: `baseline`.

API: `missing` - there is no route listing pending external actions; pending actions are visible through the approvals and the message or stage response.

Agent access: `partial` - the agent sees the pending state in the tool response (202 or pending delivery state); there is no dedicated list tool.

Policy: a draft action stores its payload and key and executes nothing.

Evidence: `source-only` - [gate](../../server/src/services/external-action-gate.ts), [tests](../../server/src/services/external-action-gate.test.ts).

Verification: `not-run` - under draft-only request a message and confirm no delivery and a pending record.

Gaps: no list route for pending external actions.

## `approval`

Review: `baseline`.

API: `present` - POST /api/approvals/{id}/approve; POST /api/approvals/{id}/reject.

Agent access: `restricted` - approving or rejecting is a board decision; an agent can observe the outcome only through the action's state.

Policy: the approval decision is forwarded to the external action; a failed execution is reported on the decision, not thrown.

Evidence: `source-only` - [approval routes](../../server/src/routes/approvals.ts), [resolver](../../server/src/services/external-action-gate.ts).

Verification: `not-run` - approve a pending send as a board user and confirm one execution; reject another and confirm nothing is sent.

Gaps: the approval executor for send-with-approval is held in process memory; a restart before the decision loses it.

## `direct`

Review: `baseline`.

API: `present` - the gated routes (POST /api/opportunities/{id}/stage, POST /api/messages/{id}/send, POST /api/companies/{companyId}/calendar/events, and others that pass the gate).

Agent access: `available` - an agent executes directly only under send-direct policy; board users always execute directly.

Policy: the result or failure is stored on the action; the activity log records the transition.

Evidence: `source-only` - [gate](../../server/src/services/external-action-gate.ts).

Verification: `not-run` - under send-direct, send as an agent and confirm executed status and one delivery.

Gaps: a grant of send-direct for a new action type needs a passed bench first.

## `idempotency`

Review: `baseline`.

API: `not-applicable` - a property of the gate applied by each gated route; no route of its own.

Agent access: `not-applicable` - agents use it through the gated operations' idempotency keys.

Policy: the same company, action type and key return the existing action without executing again.

Evidence: `source-only` - [gate](../../server/src/services/external-action-gate.ts).

Verification: `not-run` - repeat a send with one key and confirm one action.

Gaps: the unique index is partial and enforced per company and key.

## `audit`

Review: `baseline`.

API: `present` - GET /api/companies/{companyId}/activity.

Agent access: `partial` - the activity log is readable through REST with the agent key; no dedicated tool.

Policy: each transition (draft, approval, direct, executed, failed) is written to the company activity log.

Evidence: `source-only` - [activity routes](../../server/src/routes/activity.ts), [gate](../../server/src/services/external-action-gate.ts).

Verification: `not-run` - confirm one activity entry per transition for a sent message.

Gaps: no dedicated agent tool for the external action history.

## `capability`

Review: `baseline`.

API: `not-applicable` - enforced inside the gate, the voice tool service, the project tools route, the media studio routes and the native runner; the grants are set through the agent capabilities route, not by this gate.

Agent access: `restricted` - an agent cannot grant itself a capability. Without the grant every gated operation below is refused, and the agent sees `agent_capability_disabled` in the response or tool error.

Policy: applies only to agent actors. Email and message actions need `channels:message`; CRM conversation sends also need to match `agents.metadata.profile.messageChannels` when that allowlist is present. The channel check runs before staging and again inside delivery, including approved-action retries; a missing field preserves legacy unrestricted channel behavior. The call action and the Speko `call_my_phone` tool need `channels:call`; media tools and media studio routes need `media:generate`. The grant is a company permission grant (`principal_permission_grants`, principal = the agent) and a missing membership denies too. The capability check runs before the idempotency lookup. Board actors and the action types booking, stage change, proposal, publish and review link are unchanged. Media tools are not listed to an agent without the grant and are refused when called.

Evidence: `source-only` - [gate](../../server/src/services/external-action-gate.ts), [channel allowlist enforcement](../../server/src/services/conversations/messages.ts), [agent capability profile](../../server/src/services/agent-capabilities.ts), [voice tools](../../server/src/services/voice/speko-agent-tools.ts), [project tools route](../../server/src/routes/project-tools.ts), [media studio routes](../../server/src/routes/media-studio.ts), [runner tool authority](../../server/src/services/native-runtime/paperclip-runner-tool-authority.ts), [gate tests](../../server/src/services/external-action-gate.test.ts), [media capability tests](../../server/src/__tests__/media-agent-capability.test.ts).

Verification: `not-run` - as an agent without grants, request a message, a call and a media tool; confirm 403 `agent_capability_disabled`, no external action row and no delivery. With the message grant, allow one selected conversation channel and reject an unselected one before staging; revoke a channel after approval and confirm delivery/retry is refused. Grant each capability and confirm the request reaches the existing autonomy logic.

Gaps: the native runner still advertises media tools in its synchronous tool list to agents without `media:generate`; the call is refused at execution, so the listing is not filtered. Any future outbound path that does not call the gate bypasses this check. The Speko assigned-resource instructions are not gated by `channels:call`. Existing agents need the A1 backfill of grants before they keep their current access.
