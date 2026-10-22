---
navigation: {"section":"Customers and sales","sectionOrder":25,"order":50}
---

# Customer conversations inbox

One inbox for conversations with customers across channels. A conversation has a status (open, waiting for us, waiting for them, closed), an assignee, an SLA, and a thread of inbound and outbound messages. Sending a message passes the external action gate, so an agent's send may wait for approval.

Implementation: [inbox](../../ui/src/pages/ConversationInbox.tsx), [conversation detail](../../ui/src/pages/ConversationDetail.tsx), [customer conversations tab](../../ui/src/components/crm/LinkedConversations.tsx).
Agent access: [companion](../agent-access-map/conversations.md).

## Sub-features

- `inbox`: list conversations filtered by status, channel, assignee and overdue SLA.
- `thread`: a conversation with its messages in order.
- `draft`: write a message draft in a conversation.
- `send`: send a draft; the gate applies draft-only, approval or direct mode. Delivery states are draft, queued, sent, delivered, read, failed and uncertain.
- `reconcile`: a board user resolves an uncertain delivery by recording whether it was sent and the provider id.
- `state`: change status and priority.
- `assign`: assign a conversation to a user or an agent.
- `link`: link a conversation to a customer, lead or opportunity.
- `email`: email threads from the email provider appear as conversations with a copied message history.

## How to get to it (user POV)

### `inbox-list`

Open `/conversations`. Use the status, channel, assignee and overdue filters. Open a row to read the thread.

### `thread-send`

On `/conversations/:conversationId`, write a reply and send it. A notice says when it is waiting for approval. An uncertain send asks a board user to reconcile it.

### `customer-conversations`

On a customer's Conversations tab or a lead's Conversations section, the linked conversations open the same thread page.

## Driving it with Playwright and the Paperclip CLI

Preconditions: disposable company, one customer with a conversation on the webchat or a test channel, one agent. Provider sends use a fake transport.

1. Filter the inbox by channel and by overdue; verify the rows match and survive reload.
2. Open a thread, send a reply as a board user; verify delivery moves to sent or delivered.
3. As an agent under draft-only autonomy, send a reply; verify a pending action and no outbound delivery.
4. Link the conversation to the customer and verify it appears on the customer's Conversations tab and links back.
5. Simulate an uncertain provider response and verify it is not resent automatically and can be reconciled by a board user.

Targeted evidence: [conversations service](../../server/src/services/conversations/conversations.test.ts), [external action gate](../../server/src/services/external-action-gate.test.ts), [channel transports](../../server/src/services/conversations/transports/channels.test.ts).

## Gotchas

- The old Inbox page lists issues and approvals; the customer inbox is at `/conversations`.
- The first-response SLA is a fixed four hours; there is no per-company setting yet.
- Projected email conversations have no contact link, so they will not appear on a customer's tab until linked.
- A message that is sent but not yet delivered is not a delivered message; check its delivery state.
