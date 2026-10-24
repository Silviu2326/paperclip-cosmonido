---
navigation: {"section":"Customers and sales","sectionOrder":25,"order":100}
---

# External action gate

Every action that leaves the company (email, message, booking, stage change, proposal, publication, call, review link) passes one gate. A board user acts directly. An agent acts according to its autonomy level for that action type: draft only (nothing is sent), send with approval (an approval is requested), or send direct. A repeated request with the same key returns the first action.

Implementation: [approval detail](../../ui/src/pages/ApprovalDetail.tsx), [inbox approvals filter](../../ui/src/pages/Inbox.tsx), [autonomy matrix](../../ui/src/pages/Autonomy.tsx), [gate service](../../server/src/services/external-action-gate.ts), [approval routes](../../server/src/routes/approvals.ts).
Agent access: [companion](../agent-access-map/external-actions.md).

## Sub-features

- `policy`: the level for an agent and action type is the agent's current grant, else the company's, else draft only. Revoked grants do not count.
- `draft`: the action is stored as pending with its payload; nothing is executed.
- `approval`: an approval is created; approving executes the action, rejecting records the rejection.
- `direct`: the action executes now; its result or failure is stored.
- `idempotency`: the same company, action type and key return the existing action.
- `audit`: each transition is written to the activity log.
- `capability`: an agent may send messages and emails only with its `channels:message` company grant, make calls only with `channels:call`, and use media tools only with `media:generate`. Without the grant the request is refused (403, `agent_capability_disabled`) before any action is stored. Board users are not affected.

## How to get to it (user POV)

### `approval-queue`

Open the approvals page. An external action waiting for a decision appears there with its type and subject.

### `autonomy-levels`

Open `/autonomy` to see and change the level per agent and action type. Raising a level needs a passed bench; the detail is in the autonomous sales map.

## Driving it with Playwright and the Paperclip CLI

Preconditions: disposable company, one agent, default draft-only policy, and a test subject (a conversation or opportunity).

1. As the agent, request a message send under the default policy; verify a pending action and no outbound delivery.
2. Grant send-with-approval for that action type after a passed bench; request the send; verify an approval appears.
3. Approve it; verify the action becomes executed and the delivery is recorded.
4. Reject a second request; verify rejected and nothing sent.
5. Repeat the first request with its key; verify the original action is returned and no new action is created.
6. As a board user, perform the same action; verify it is direct.

Targeted evidence: [external action gate](../../server/src/services/external-action-gate.test.ts).

## Gotchas

- A pending action is not a sent action. Report delivery only from the executed state.
- The autonomy matrix currently lists seven action types; the review link type is accepted by the gate and the policy validator but has no matrix cell yet.
- Approval decisions are forwarded from the approvals route; a failed execution is returned to the decision, not thrown.
- A missing capability grant is a refusal, not a draft: the agent gets 403 and no pending action row is created. Granting an agent a capability does not change the autonomy level, which still decides draft, approval or direct.
