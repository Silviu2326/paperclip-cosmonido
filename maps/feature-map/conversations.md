---
navigation: {"section":"Customers and sales","sectionOrder":25,"order":50}
---

# Customer conversations inbox

One inbox for conversations with customers across channels. A conversation has a status (open, waiting for us, waiting for them, closed), an assignee, an SLA, and a thread of inbound and outbound messages. Sending a message passes the external action gate, so an agent's send may wait for approval.

Implementation: [inbox](../../ui/src/pages/ConversationInbox.tsx), [conversation detail](../../ui/src/pages/ConversationDetail.tsx), [customer conversations tab](../../ui/src/components/crm/LinkedConversations.tsx).
Agent access: [companion](../agent-access-map/conversations.md).

## Sub-features

- `inbox`: company-scoped channel setup and conversations filtered by status, channel, assignee and overdue SLA. Cursor pages have no 100-conversation UI cap.
- `thread`: opens the latest 50 messages in chronological order; Load older messages traverses all earlier pages without a 500-message cutoff.
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

With no configured channel, setup expands automatically. Choose web chat, email,
WhatsApp, Messenger, Instagram, Telegram or SMS. Web chat and customer-channel
settings open inside the inbox; email uses its existing resumable setup. Existing
company settings determine readiness after reload. Provider cards distinguish
enabled accounts, verified credentials, pending setup and failed status reads.
The embedded web-chat test uses the real public widget and creates real messages;
it can trigger configured automatic agent replies. Provider credential probes do
not certify webhook delivery. Inbox and thread queries refresh on conversation
and message activity events. The untouched empty inbox explains how to receive
the first message; empty filtered results retain their separate message.

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
6. Load 125 conversations in five pages; change a filter and verify its first page.
7. Open a 550-message thread: see the newest messages immediately, then load all older messages. Insert a new arrival between pages and verify older message cursors neither skip nor duplicate existing messages.
8. Start with no connections, activate web chat, send a visitor message using the embedded widget and reply from the inbox. Repeat after reload and switch companies to verify isolation.

Targeted evidence: [conversations service](../../server/src/services/conversations/conversations.test.ts), [external action gate](../../server/src/services/external-action-gate.test.ts), [channel transports](../../server/src/services/conversations/transports/channels.test.ts).

## Gotchas

- The old Inbox page lists issues and approvals; the customer inbox is at `/conversations`.
- The first-response SLA is a fixed four hours; there is no per-company setting yet.
- Projected email conversations have no contact link, so they will not appear on a customer's tab until linked.
- A message that is sent but not yet delivered is not a delivered message; check its delivery state.
