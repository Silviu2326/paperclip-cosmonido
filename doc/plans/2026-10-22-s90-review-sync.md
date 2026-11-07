# S90 — Revisión externa (pista I) y sincronización CRM (pista L)

Fecha: 2026-10-22. Entrega de **fuente únicamente**: no se ha ejecutado ningún test, typecheck, build, script, servidor ni migración, y no se hizo commit. Nada de lo de abajo está probado en ejecución; no se declara ≥ 90 % ni que funcione de punta a punta. Los puntos que dependen de archivos centrales están en «Ganchos pendientes».

Contexto leído: contrato y pistas S2, auditoría S80, `external-action-gate.ts`, `customer-portal.ts` (S80), `deliverable-reviews.ts` (S1), `calendar/google-calendar.ts` (patrón del invocador), `sprint2-tools.ts`, `crm-tools.ts`, reglas `rules/*.mdc` aplicables.

## I. Revisión externa de entregables

### Qué hace
- **Un enlace = un entregable en una versión.** Solo `work_product`. `target_version` es el `updatedAt` ISO del work product al crear el enlace y no cambia. El cliente se valida por `project.customerId` del work product (el proyecto debe tener cliente; si no, 422 accionable). El contacto opcional debe estar vinculado a ese cliente.
- **Token firmado, caducable, revocable.** Se deriva con `signPublicToken` (purpose `review_link`, subject = id del enlace) y no se guarda. Cada petición pública exige firma válida, expiración, estado `active` en BD, sin revocación y coincidencia exacta con el token derivado. TTL máximo 90 días.
- **Sin token en URLs ni logs.** La URL de navegador es `/review/{companyId}/{linkId}#token=…` (fragmento, igual que el portal S80); la API lo recibe solo en la cabecera `X-Paperclip-Review-Token`. No hay token en ruta ni query. El resultado guardado en `external_actions` lleva solo ids y fechas. Las respuestas llevan `Cache-Control: no-store` y `Referrer-Policy: no-referrer`.
- **Vista pública saneada** (`PublicReviewView`): nombre de empresa y cliente, título, resumen (máx. 4000), tipo, URL solo si es https público sin credenciales/query/fragmento/host local, versión, decisión, `revision`, permisos y comentarios del propio enlace. No hay adjuntos, metadata, ids internos, workspaces, otros entregables ni otros enlaces. Si el entregable cambió, el visitante solo ve el título registrado y `stale: true`; no puede responder.
- **Respuestas** (`POST …/responses`): `comment`, `accept`, `request_changes`.
  - `targetVersion` debe ser la del enlace y el work product se bloquea `FOR UPDATE` y se re-compara dentro de la transacción.
  - Las decisiones son compare-and-set sobre `expectedRevision` y solo con `decision = open`; una decisión sube `revision`. Aceptado = final; con cambios pedidos aún se puede comentar.
  - `idempotencyKey` (uuid) único por enlace: misma clave y mismo contenido repite el resultado (200, `replayed`); mismo key con otro contenido = 409.
  - Límite 20 respuestas/min por IP, cuerpo máx. 8 KB.
- **Revisión interna S1 intacta.** El cliente externo **no** suplanta a un usuario de la junta: no se llama a `deliverableReviewService.resolve`, no cambia `state`, `reviewerUserId`, `reason` ni `issueWorkProducts.reviewState`. Si existe una revisión `pending` de ese `work_product`+versión, solo se **añade** `evidence.externalReview` (decisión, comentario recortado, `authorVerified: false`, nota de que no es decisión de la junta). La resolución sigue siendo de un usuario de la junta.
- **Creación gobernada.**
  - Usuario de la junta: `gateExternalAction` (`actionType: "review_link"`, ejecuta directo, queda registrado). Respuesta 201 con la URL (única vez que se devuelve en la creación; `POST /review-links/:id/url` la vuelve a derivar para la junta y registra `review_link.url_revealed`).
  - Agente: **nunca** ejecuta. `review_link` no se puede conceder (`resolveAutonomyLevel` → `draft_only`) y un borrador del gate no crea aprobación, así que se crean las mismas filas que el gate (acción `mode: approval`, aprobación `external_action`) y el enlace queda `pending_approval` (202). Al aprobarse (`approvals` → `forwardExternalActionDecision`) el enlace pasa a `active` por `reconcile`, que lee el estado de la aprobación, sin depender de un cierre en memoria, así que un reinicio no lo deja varado. Rechazada/cancelada → `rejected`. El agente no recibe la URL: la libera la junta.
  - Contexto de la ejecución real: `projectToolContext(db, req.actor, write)` exige JWT de agente con run y tarea; el work product debe pertenecer al **proyecto de la tarea del run** y a la empresa del run. `review_status_get` solo ve enlaces de ese proyecto. Ni empresa, ni cliente, ni proyecto son argumentos de las herramientas.
  - Idempotencia: la clave del agente es `run:{runId}:{targetId}` por defecto.
- **Texto del cliente = dato no confiable.** `review_status_get` devuelve `customerFeedback.untrusted: true`.

### Archivos
- `server/src/services/public-surface/review-links.ts` — servicio.
- `server/src/services/public-surface/review-tools.ts` — herramientas de agente.
- `server/src/routes/public/review.ts` — `registerPublicReviewRoutes(router, db)` (ya enganchado por `public-surface.ts`) y `reviewLinkRoutes(db)` (nuevo, autenticado).
- `packages/db/src/schema/review_links.ts` — `reviewLinks`, `reviewLinkEvents`.
- UI: `ui/src/api/external-review.ts`, `ui/src/pages/ExternalReview.tsx` (vista de la junta), `ui/src/pages/PublicReview.tsx` (pública).

### Endpoints
Públicos (bajo `/api/p`): `GET /:companySlug/review/:linkId`, `POST /:companySlug/review/:linkId/responses`. Se cambia el `/:token` del contrato original por `:linkId` + cabecera, para que el secreto no entre en rutas ni logs.
Autenticados (bajo `/api`): `POST|GET /companies/:companyId/review-links`, `GET /review-links/:id`, `GET /review-links/:id/events`, `POST /review-links/:id/url`, `POST /review-links/:id/revoke`.

### No cubierto en I
- Solo `work_product` (no `document_revision` ni `company_file_version`); sin comentarios por zona (`document_annotation_*`); sin adjuntos al visitante.
- Sin notificación al contacto por su canal preferido (el envío es de la junta, que copia el enlace).
- No se reutiliza `customer_portal_feedback` (S80): son tablas distintas, sin tocar sus archivos.
- Sin identidad verificada del visitante: `authorName` es texto libre.
- La limitación por IP es en memoria (una instancia), como el resto de la superficie pública.

## L. Sincronización CRM (HubSpot, Pipedrive)

### Qué hace
- **Estado real.** `GET …/crm/sync/status` devuelve, por proveedor: configuración, conexión (existe/activa), vínculos por estado, trabajo abierto, último trabajo y última sincronización **realmente exitosa**, y `blockers` accionables («Elige la conexión de HubSpot…», «La conexión no está activa. Reconéctala…», «Este servidor no tiene conectado el invocador…»). No inventa éxito.
- **Trabajos duraderos.** `crm_sync_jobs` guarda cursor por tarea, estadísticas y errores (máx. 50, sin secretos). Se reanuda tras reinicio o lease vencido con `resumeJob`/`tick`. Presupuesto por ejecución: 20 páginas de 50 y 20 s; si no termina, queda `queued`.
- **Direccional.** La dirección del trabajo es la configurada (`import`, `export`, `both`). Importar → exportar, clientes antes que contactos.
- **IDs de origen y recibos.** `crm_sync_links` mapea registro local ↔ id del proveedor. Un vínculo se confirma solo si el proveedor devolvió un id (recibo); si el recibo trae el registro, el hash externo es el del eco del proveedor.
- **Escrituras inciertas.** Antes de crear en el proveedor se reserva el vínculo en `uncertain` (sin id externo). Si el resultado es desconocido (timeout, respuesta sin id), **no se repite** la creación: queda `uncertain` y se resuelve a mano (`retry_create` tras comprobar el proveedor, o `link_external` con el id). Un rechazo explícito del proveedor o un 422 del invocador (no se envió nada) borran la reserva.
- **Conflictos.** Hash de campos proyectados al proveedor en el último sync (local y externo). Cambian ambos (o primer enlace de un registro local que ya existía, hallado por dominio/email exactos y únicos) → `primarySystem`: `paperclip` gana el local, `external` gana el proveedor, `manual` deja `conflict` con ambas capturas. `resolveLink` con `keep_local`/`keep_external`; `keep_external` rechaza si el local cambió después de detectar el conflicto.
- **Desconectar.** `disconnect` desactiva, bloquea trabajos abiertos y conserva datos locales y vínculos; no borra nada local ni remoto.
- **Quién escribe en el proveedor.** Solo la junta inicia trabajos (o resuelve `keep_local`); los agentes solo leen el estado (`crm_sync_status`). Por eso no se usa `gateExternalAction`: no hay tipo en `EXTERNAL_ACTION_TYPES` para sync y el actor siempre es la junta; si se quisiera que un agente inicie exportaciones habría que añadir un tipo (`crm_sync`) al gate.

### Archivos
- `server/src/services/crm-sync/{types,providers,crm-sync,index}.ts`; `server/src/routes/crm-sync.ts`.
- `server/src/services/crm/crm-tools.ts` — `CRM_SYNC_TOOL_NAMES`, `crmSyncToolDefinitions()`, y `callCrmTool` enruta `crm_sync_status` (no se toca `CRM_A2_TOOL_NAMES`, que su test fija en 10).
- `server/src/services/crm/sync/{hubspot,pipedrive}.ts` — los stubs TODO ahora reexportan el servicio.
- `packages/db/src/schema/crm_sync.ts` — `crmSyncConfigs`, `crmSyncLinks`, `crmSyncJobs`.

### Endpoints (bajo `/api`)
`GET …/crm/sync/status`, `PUT …/crm/sync/:provider/config`, `POST …/crm/sync/:provider/disconnect`, `POST …/crm/sync/:provider/jobs`, `GET …/crm/sync/jobs[/:jobId]`, `POST …/crm/sync/jobs/:jobId/resume`, `GET …/crm/sync/attention`, `POST …/crm/sync/links/:linkId/resolve`.

### Límites declarados de L
- Solo clientes (organizaciones) y contactos. No oportunidades, actividades ni asociación empresa↔contacto. No se propagan borrados.
- **Nombres de herramientas upstream sin verificar** (`providers.ts`: HubSpot `hubspot-list-objects`/`hubspot-batch-create-objects`/`hubspot-batch-update-objects`; Pipedrive `get|add|update-organization|person`). Hay que contrastarlos con la lista viva de cada conexión o fijar `toolNames` por empresa (`list|create|update`). Un nombre erróneo hace fallar el trabajo con el error del proveedor, no un éxito falso.
- Pipedrive no sincroniza `domain` (la organización no tiene campo estándar).
- En empresas `export`, un registro que ya exista en el proveedor puede duplicarse (no hay lectura previa).
- El tiempo máximo de una llamada al conector lo impone el invocador; el presupuesto de 20 s se comprueba entre páginas.
- Sin UI de sincronización (ni sección en `Customers.tsx`): solo API.

## Ganchos pendientes (archivos centrales; no tocados)

1. **DB**: en `packages/db/src/schema/index.ts` añadir `export * from "./review_links.js"; export * from "./crm_sync.js";`. Migración: portar `2026-10-22-s90-review-sync.sql` (numeración y snapshot según `rules/database-migration-snapshots.mdc` y el journal). Hasta entonces ninguno de estos servicios compila contra `@paperclipai/db`.
2. **Montaje** (`server/src/app.ts` / `routes/index.ts`), bajo `/api` autenticado: `reviewLinkRoutes(db)` y `crmSyncRoutes(db, { invoke, service })`. `registerPublicReviewRoutes` ya está llamado desde `public-surface.ts`.
3. **Invocador de conectores** para CRM: `CrmConnectorInvoker = (call: { companyId, connectionId, toolName, arguments, authority: { kind: "crm_sync_job", jobId, requestedByUserId } }) => Promise<unknown>`; debe mapear esa autoridad a la del gateway de herramientas (como el invocador de Calendar, que sigue pendiente) y lanzar `unprocessable` (422) si la conexión no sirve. Sin él, todo trabajo se rechaza con el mensaje de bloqueo.
4. **Scheduler**: llamar `crmSyncService(db, { invoke }).tick()` periódicamente (comparte el mismo `service` que las rutas).
5. **Despachador S2** (`services/sprint2-tools.ts`): añadir `"crm_sync_status"` a `CRM_SPRINT2_TOOL_NAMES` (ya lo atiende `callCrmTool`), y un grupo `REVIEW_SPRINT2_TOOL_NAMES = ["review_link_create", "review_status_get"]` con `const { callReviewTool } = await import("./public-surface/review-tools.js"); return callReviewTool(input);` (import perezoso por el ciclo documentado en ese archivo), sumándolos a `SPRINT2_TOOL_NAMES`.
6. **Catálogo semántico / runner** (`CAPABILITY_SEMANTIC_TOOL_CATALOG`, `runner-api-catalog.ts`, `paperclip-runner-tool-authority.ts`, inventario Runner): `review_link_create` efecto `write` (modos `standard`, `skill_test`); `review_status_get` y `crm_sync_status` efecto `read`. Definiciones: `reviewToolDefinitions()` y `crmSyncToolDefinitions()`. **Actualizar** `server/src/__tests__/product-tool-catalog.test.ts`: hoy afirma que estos tres nombres no están registrados y que `crm_sync_status` es «Unknown»; ya no será cierto.
7. **Redacción de logs**: añadir la cabecera `x-paperclip-review-token` a la lista de `http-log-redaction.ts` (hoy la cabecera del portal ya recibe ese trato; confirmar para la nueva).
8. **UI**: ruta pública (fuera del guard de sesión) `/review/:companyId/:linkId` → `PublicReview`; montar `<ExternalReview companyId customerId deliverables />` en el detalle de cliente (`CustomerDetail.tsx`, no tocado) con los work products de los proyectos del cliente; claves i18n `publicReview.*` y `externalReview.*` (hoy con `defaultValue` en español); `pnpm check:token-gates` sobre los dos componentes.
9. **OpenAPI, mapas y OpenAPI-docs** (`routes/openapi.ts`, `maps/feature-map` y `maps/agent-access-map` de autonomous-sales, `node scripts/check-maps.mjs`): endpoints de arriba y las tres herramientas.
10. **Autonomía**: si se quiere que `review_link` sea concedible, habría que añadirlo a `AUTONOMY_ACTION_TYPES`; entonces `create` del agente debería pasar por `gateExternalAction` (hoy no, por lo explicado arriba).

## Contratos exactos

```ts
// review
reviewLinkService(db): { create, list, companyOf, status, reveal, revoke, events, publicGet, publicRespond }
registerPublicReviewRoutes(router: Router, db: Db): void
reviewLinkRoutes(db: Db): Router
callReviewTool({ name, arguments, apiUrl, token, companyId, fetchImpl? }): Promise<unknown>   // names: REVIEW_TOOL_NAMES
reviewToolDefinitions(): { name, description, inputSchema }[]

// crm sync
crmSyncService(db, { invoke?: CrmConnectorInvoker, now? }): { saveConfig, disconnect, status, startJob, resumeJob, tick, listJobs, getJob, listAttention, resolveLink }
crmSyncRoutes(db, { invoke?, service? }): Router
callCrmTool({ name: "crm_sync_status", arguments: { provider? }, apiUrl, token, companyId })   // GET /companies/:id/crm/sync/status
crmSyncToolDefinitions()
```

## Verificación pendiente (no ejecutada)
Tests propuestos para cuando se pueda ejecutar: token (firma, expiración, revocación, otro enlace/empresa), versión cambiada, CAS de `revision` con dos pestañas, idempotencia (mismo/otro contenido), aprobación de agente tras reinicio, que la revisión interna no cambie de estado, sync con invocador simulado con respuestas de recibo, sin id, timeout en create (queda `uncertain`), conflicto con cada `primarySystem` y reanudación tras lease vencido. Los mocks no prueban el comportamiento real de los conectores: hace falta un conector sandbox de HubSpot/Pipedrive.
