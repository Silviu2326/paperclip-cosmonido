# Customer memory - agent access

Product map: [customer-memory](../feature-map/customer-memory.md).

## `notes`

Review: `baseline`.

API: `present` - GET /api/customers/{id}/memory; POST /api/customers/{id}/memory; POST /api/customer-memory/{noteId}/archive.

Agent access: `partial` - reading and appending are available through the memory tools; archiving is restricted to board users.

Policy: assertCompanyAccess and linked-customer checks; a run without a linked conversation receives 403.

Evidence: `source-only` - [routes](../../server/src/routes/crm-memory.ts), [service](../../server/src/services/crm/memory.ts).

Verification: `not-run` - read notes of an unlinked customer as an agent and confirm 403.

Gaps: archive by an agent is refused; that is intentional but not separately tested live.

## `agent-memory`

Review: `baseline`.

API: `present` - GET /api/customers/{id}/memory; POST /api/customers/{id}/memory (with idempotency key).

Agent access: `available` - customer_memory_get and customer_memory_append dispatch to these routes through the native runner.

Policy: the linked customer comes from the run's conversation; the idempotency key prevents duplicate notes on retry.

Evidence: `source-only` - [memory tools](../../server/src/services/crm/memory-tools.ts), [tests](../../server/src/__tests__/crm-memory-routes.test.ts).

Verification: `not-run` - append twice with one key as an agent and confirm one note.

Gaps: the link to a customer for project-scoped runs waits for a customer field on projects.

## `isolation`

Review: `baseline`.

API: `not-applicable` - enforced inside the memory routes; no separate endpoint.

Agent access: `restricted` - a run sees only the customers linked to its own conversation; any other customer returns 403.

Policy: linked customers are read from the run snapshot's conversation and the conversation's customer.

Evidence: `source-only` - [service](../../server/src/services/crm/memory.ts), [tests](../../server/src/services/crm/memory.test.ts).

Verification: `not-run` - run in a conversation for customer A and read customer B; confirm 403.

Gaps: a run without a conversation id in its snapshot has no linked customer.
