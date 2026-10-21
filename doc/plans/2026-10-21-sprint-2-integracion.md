# Sprint 2: notas de integración

Fecha: 2026-10-21
Uso: cada pista anota aquí, bajo su encabezado, lo que necesita en archivos de un solo propietario (schema/index, migraciones, shared/index, app.ts, services/index, routes/index, App.tsx, Sidebar, queryKeys) y cualquier desviación del contrato. El responsable de integración aplica y tacha.

## A1 Clientes, contactos e identidad

## A2 Oportunidades, actividades, compromisos, tools

## B Entrada de leads

## C Bandeja y mensajes

## H Agenda

## K Memoria por cliente

Archivos propios: `packages/db/src/schema/customer_memory.ts`, `server/src/services/crm/memory.ts` (rellena el stub), `server/src/services/crm/memory-tools.ts` (definiciones y llamada de `customer_memory_get` / `customer_memory_append`), `server/src/routes/crm-memory.ts`, `server/src/__tests__/crm-memory-routes.test.ts`, `server/src/services/crm/memory.test.ts`, `ui/src/api/crm-memory.ts`, `ui/src/components/crm/CustomerMemory.tsx`, claves `crm.memory.*` en los 40 locales.

Pendiente de integración (no hecho por K):
- `packages/db/src/schema/index.ts`: añadir `export * from "./customer_memory.js"`. Después, `pnpm db:generate` (la migración del contrato debe incluir `customer_memory_notes`) y `pnpm --filter @paperclipai/db prune:snapshots`, según la regla de snapshots. La tabla tiene una columna extra `idempotency_key` nullable con índice único parcial `(company_id, idempotency_key)`, para que los reintentos del agente no dupliquen notas. Sin la migración, las rutas fallan en tiempo de ejecución.
- `server/src/app.ts`: `api.use(crmMemoryRoutes(db))` (importar desde `./routes/crm-memory.js`). `server/src/routes/index.ts`: `export { crmMemoryRoutes } from "./crm-memory.js"`.
- `server/src/services/index.ts` (opcional): exportar `customerMemoryService`. El código lo importa directamente desde `services/crm/memory.js`.
- `projects.customerId` no existe en `packages/db/src/schema/projects.ts`. Mientras falte, el aislamiento usa solo la conversación: `linkedCustomerIdsForRun` lee `contextSnapshot.conversationId` y `conversations.customer_id`. Un run sin `conversationId` en su snapshot no tiene cliente vinculado y recibe 403. Quien lance runs de conversación (pista C o chat) debe poner `conversationId` en el snapshot, o añadir el vínculo issue-conversación. Cuando exista `projects.customerId`, añadirlo en `linkedCustomerIdsForRun`.
- Herramientas de agente: `customer_memory_get` y `customer_memory_append` están definidas y llaman a la API (`memory-tools.ts`), pero no registradas en la ruta de herramientas de run (patrón de `routes/project-tools.ts`). Los nombres ya están en `CRM_TOOL_NAMES` del contrato.
- `ui/src/pages/crm/CustomerDetail.tsx` (A1): importar `CustomerMemory` desde `@/components/crm/CustomerMemory` y renderizar `<CustomerMemory customerId={customer.id} />` en la pestaña Memoria. El componente usa la clave de caché local `["crm-memory", customerId]`, así que no necesita entrada en `queryKeys.ts`.
- Mapas: las rutas nuevas (`/customers/:id/memory`, `/customer-memory/:noteId/archive`) deben reflejarse en `maps/agent-access-map` según AGENTS.md; luego `node scripts/check-maps.mjs`.

Desviaciones respecto al contrato (decididas por K):
- Los esquemas de validación de memoria están en la ruta y en `memory-tools.ts`, no en `packages/shared/src/validators/crm.ts`, para no tocar shared.
- No existe columna `archived` booleana: el archivado es solo `archived_at`.
- `archive` es solo de board; un agente recibe 403.
- `validUntil` se guarda pero no filtra `get`: las notas caducadas siguen apareciendo como activas.

## M Equipos y skills

## D/E Canales

## F Chat web
