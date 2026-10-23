# S95 web-chat automatic agent reply dispatch

## Behavior

Automatic web-chat task dispatch is opt-in per company. A board user selects one company-owned agent and an explicit active company user responsible for the work. The public widget must also remain enabled. The service never infers responsibility from the first administrator. Configuration changes are audited and disabling the policy cancels queued work.

An accepted inbound web-chat message writes one idempotent `conversation_agent_dispatches` row in the same transaction as the inbound message. This is an outbox only; it performs no outbound send in the request path. `conversationAgentDispatchService.processNext(workerId, heartbeat.wakeup)` claims a durable expiring lease, rechecks the current company policy, widget state, agent company/status, and responsible user's membership, then creates an ordinary task assigned to that agent. Task admission reserves `jobs_per_month` and commits the reservation in the same transaction as the task. A stable issue idempotency key recovers a worker crash between task creation and outbox update.

The service resolves language at dispatch time using current `contact.language` first, then `conversation.language`; it stores both the selected value and source. It places this instruction and the conversation/message identifiers in the issue description and wake context. The task asks the agent to load the current conversation through `conversation_get`, so message text is not copied into a second durable record and conversation privacy purge remains authoritative. With neither preference present, it asks the agent to use the language evident in the conversation without claiming a translation. The task tells the agent to use normal conversation tools and the existing external-action gate. The dispatcher never drafts or sends a provider message itself. Standard heartbeat authorization, agent budget, autonomy, external-action approval, and message quota checks remain responsible for execution and delivery.

## Integration point

The only inbound hook is in `recordInboundMessage`: after the unique inbound row exists and while its transaction remains open, it inserts an outbox row only for web chat when the explicit automation and webchat activation settings are both enabled. Workers cannot see the row before commit. Platform message handling and direct response behavior remain outside the dispatcher. The root tick/wiring owner must instantiate the service and invoke `processNext` with the regular heartbeat wakeup callback.

Routes in `server/src/routes/conversations.ts` expose company-scoped read and board-only update for the dispatch policy. Updating requires a company-owned, non-paused agent and an explicit active company membership for the responsible user. This is the stored consent boundary for automatic task creation; it does not grant a send exception.

## Schema fragment

`2026-10-22-s95-conversation.sql` adds one company policy row and the durable per-message inbox. The outbox pins the source message, company, agent, responsible principal, task/wakeup receipts, language provenance, attempts and lease fence. Source uniqueness is `(company_id, source_message_id)`. The migration is manual and must be consolidated by the root schema owner; no migration generator or database was run here.

## Remaining boundary

Task creation and wakeup are implemented as separate recoverable steps because heartbeat wakeup owns its own transaction and admission gates. A failed or uncertain wakeup remains idempotent under one durable wake key. Outbound messages still follow existing `message_reply` or `message_draft`/`message_send` actions. The feature does not claim an automatic message was delivered until the provider acknowledgement and the normal outbound state transition confirm it.

No provider, server, migration, build, typecheck, or test was run by this workstream. Root owns tick wiring, DB barrel export and the consolidated migration.


## Estado posterior de integración

El integrador montó las rutas, páginas, workers y contratos aplicables de esta ficha en el worktree aislado. Las instrucciones anteriores de montaje describen el handoff original. La evidencia ejecutada y los límites finales se registran en [el corte S95](2026-10-22-sprints-95.md); las comprobaciones de fuente no equivalen a verificación de proveedores ni a aceptación de los cuatro sprints.
