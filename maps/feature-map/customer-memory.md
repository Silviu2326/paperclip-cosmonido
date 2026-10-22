---
navigation: {"section":"Customers and sales","sectionOrder":25,"order":90}
---

# Customer memory

Notes the company and its agents keep about one customer: preferences, commitments, context. Agents read and append notes only for customers linked to their run, through a retry-safe key, so repeated tool calls do not duplicate a note.

Implementation: [customer memory](../../ui/src/components/crm/CustomerMemory.tsx), [customer detail](../../ui/src/pages/crm/CustomerDetail.tsx), [memory routes](../../server/src/routes/crm-memory.ts).
Agent access: [companion](../agent-access-map/customer-memory.md).

## Sub-features

- `notes`: list, add and archive notes on a customer; archiving is board-only.
- `agent-memory`: an agent reads a customer's notes and appends one with an idempotency key.
- `isolation`: a run sees only the customers linked to its conversation.

## How to get to it (user POV)

### `memory-tab`

Open `/customers/:customerId` and the Memory tab. Add a note, or archive one with a reason.

## Driving it with Playwright and the Paperclip CLI

Preconditions: disposable company, one customer, one agent run linked to that customer's conversation, and one unlinked customer.

1. Add a note as a board user; reload and verify it persists.
2. Append a note as the agent twice with the same key; verify one note.
3. Read the linked customer's notes as the agent; then read the unlinked customer's notes and verify 403.
4. Archive a note as a board user; verify it is hidden from the default list and as an agent verify 403 on archive.

Targeted evidence: [memory service](../../server/src/services/crm/memory.test.ts), [memory routes](../../server/src/__tests__/crm-memory-routes.test.ts).

## Gotchas

- Archiving sets an archive time only; there is no separate archived flag.
- An expiry date is stored but does not hide a note yet; expired notes still show as active.
- A run without a linked conversation has no linked customer and receives 403.
