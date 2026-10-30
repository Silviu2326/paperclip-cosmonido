# Customer conversations inbox - agent access

Product map: [conversations](../feature-map/conversations.md).

## `inbox`

Review: `baseline`.

API: `present` - GET /api/companies/{companyId}/conversations?status=&channel=&assigned=&overdue=&customerId=&contactId=&cursor=&limit=.

Agent access: `available` - conversation_list dispatches to this route.

Policy: company-scoped; the customer and contact filters do not widen access.

Evidence: `source-only` - [routes](../../server/src/routes/conversations.ts), [service](../../server/src/services/conversations/conversations.ts).

Verification: `not-run` - list as an agent and confirm only the run's company appears.

Gaps: the list has no lead filter; lead conversations are found through the lead's contact or conversation link.

## `thread`

Review: `baseline`.

API: `present` - GET /api/conversations/{id} returns the newest 50 messages and nextMessageCursor; GET /api/conversations/{id}/messages?before={messageId}&limit= returns chronological items and nextCursor (default 50, maximum 100 per page).

Agent access: `available` - conversation_get dispatches to the detail route; its optional before argument dispatches to the older-message route. Use nextMessageCursor for the first older page and nextCursor thereafter.

Policy: getAccessibleResource and assertCompanyAccess on the conversation's company. A cursor must identify a message in that same company and conversation; it grants no access of its own.

Evidence: `source-only` - [routes](../../server/src/routes/conversations.ts).

Verification: `not-run` - read a thread of another company as an agent and confirm denial.

Gaps: none beyond the shared gaps.

## `draft`

Review: `baseline`.

API: `present` - POST /api/conversations/{id}/messages.

Agent access: `available` - message_draft dispatches to this route; a draft is not an external action.

Policy: assertCompanyAccess; the body and idempotency key are required.

Evidence: `source-only` - [routes](../../server/src/routes/conversations.ts).

Verification: `not-run` - create a draft as an agent and confirm it stays in draft state.

Gaps: none.

## `send`

Review: `baseline`.

API: `present` - POST /api/messages/{id}/send.

Agent access: `available` - message_send and message_reply dispatch to this route. Under draft-only policy the send remains pending; under send-with-approval it waits for a decision; under send-direct it sends.

Policy: gateExternalAction with actionType email (email channel) or message (other channels). The key is message:<messageId>:<actor>. Board users send directly.

Evidence: `source-only` - [routes](../../server/src/routes/conversations.ts), [messages](../../server/src/services/conversations/messages.ts), [gate](../../server/src/services/external-action-gate.ts).

Verification: `not-run` - as an agent under draft-only, send and confirm no outbound delivery and a pending action; approve after granting approval and confirm one delivery.

Gaps: the approval-mode executor is held in process memory; a restart before approval loses the closure (see the gate's own note).

## `reconcile`

Review: `baseline`.

API: `present` - POST /api/messages/{id}/reconcile.

Agent access: `restricted` - a board user resolves an uncertain delivery by recording whether it was sent and the provider id; agents cannot resolve their own uncertain sends.

Policy: board-only resolution; the uncertain state is never resent automatically.

Evidence: `source-only` - [routes](../../server/src/routes/conversations.ts), [channel transports](../../server/src/services/conversations/transports/channels.test.ts).

Verification: `not-run` - simulate an uncertain provider response, confirm no automatic resend, and reconcile as a board user.

Gaps: the agent is not notified of the resolution by a dedicated event.

## `state`

Review: `baseline`.

API: `present` - PATCH /api/conversations/{id}/state.

Agent access: `available` - conversation_set_state dispatches to this route.

Policy: assertCompanyAccess; status values are open, waiting_us, waiting_them and closed.

Evidence: `source-only` - [routes](../../server/src/routes/conversations.ts).

Verification: `not-run` - set waiting_them as an agent and confirm the inbox filter reflects it.

Gaps: none.

## `assign`

Review: `baseline`.

API: `present` - POST /api/conversations/{id}/assign.

Agent access: `partial` - no dedicated assignment tool; REST with the agent key only.

Policy: assertCompanyAccess; the assignee must belong to the company.

Evidence: `source-only` - [routes](../../server/src/routes/conversations.ts).

Verification: `not-run` - assign to an agent of another company and confirm rejection.

Gaps: no dedicated agent tool.

## `link`

Review: `baseline`.

API: `present` - POST /api/conversations/{id}/link.

Agent access: `partial` - no dedicated link tool; REST with the agent key only.

Policy: assertCompanyAccess; customer and lead must belong to the company.

Evidence: `source-only` - [routes](../../server/src/routes/conversations.ts).

Verification: `not-run` - link to a customer of another company and confirm rejection.

Gaps: no dedicated agent tool.

## `email`

Review: `baseline`.

API: `not-applicable` - email threads are projected when the conversation list and detail are read; the projection has no route of its own.

Agent access: `not-applicable` - the projection is a read-side copy of existing email records; agents act on the projected conversation through the other operations.

Policy: the projection is rate-limited per company and copies messages only for the email provider.

Evidence: `source-only` - [projection](../../server/src/services/conversations/transports/email.ts).

Verification: `not-run` - read the inbox after an email arrives and confirm one projected conversation.

Gaps: projected conversations have no contact link.
