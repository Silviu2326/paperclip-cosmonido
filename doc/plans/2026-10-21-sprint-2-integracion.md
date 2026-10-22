# Sprint 2: notas de integración

Fecha: 2026-10-21
Uso: cada pista anota aquí, bajo su encabezado, lo que necesita en archivos de un solo propietario (schema/index, migraciones, shared/index, app.ts, services/index, routes/index, App.tsx, Sidebar, queryKeys) y cualquier desviación del contrato. El responsable de integración aplica y tacha.

## Estado de integración fase B (2026-10-22)

Hecho por el integrador: exports de `lead_forms`, `calendar` y `customer_memory` en `schema/index.ts`; migración única regenerada `0358_dapper_natasha_romanoff.sql` (16 tablas; al fusionar con S1 renumerar a 0361 y quitar los `ALTER TABLE company_files`); `crmMemoryRoutes` montada y exportada; `conversationRoutes(db, emailChannels)`; adaptadores de B/C/H sustituidos por `identityService`, `contactService`, `customerService`, `opportunityService` e `intake` (`leads/adapters.ts` eliminado). Verificado: db typecheck, servidor sin errores propios (solo `instrumentation.ts` preexistente), UI sin errores propios (solo Artefactos del commit base), locales 7/7, token gates sin violaciones en archivos S2, Vitest 14 archivos / 109 tests.

Pendiente para la integración S1→S2→S3: registrar las herramientas `crm_*`, `lead_*`, `conversation_*`, `message_*`, `calendar_*`, `customer_memory_*` en el catálogo del runner (`packages/paperclip-runner/src/protocol-actions/`, mismo mecanismo que el S3) y en `paperclip-runner-tool-authority.ts`; `approveExternalAction` desde la ruta de aprobaciones; invocador real de Google Calendar en `calendarRoutes(db, { calendar })`; `projects.customerId`; etiqueta `nav.conversations` en el sidebar; mapas `maps/` y `check-maps`; crear oportunidad desde la UI; índice único para idempotencia por `external_ref` si se confirma que no colisiona entre fuentes.

## Estado de integración fase C (2026-10-22)

Hecho por el integrador: exports de `customer_channels` y `webchat_settings`; migración única regenerada `0358_colorful_dracula.sql` (18 tablas); `registerChannelTransports(db)` y `registerWebchatTransport()` en `app.ts`; `customerChannelRoutes` y `webchatRoutes` montadas y exportadas; rutas `channels-settings` y `webchat-settings` en `App.tsx`; copia de `src/public` al build del servidor; `.gitignore` permite `server/src/public/**/*.js`. Verificado: db typecheck, servidor y UI sin errores propios, locales 7/7, token gates sin violaciones en archivos S2, Vitest 16 archivos / 136 tests. Los puentes SQL `create table if not exists` de los tests de D/E y F se dejan: son inocuos con la migración aplicada.

Sprint 2 cerrado en esta rama. Pendiente solo lo listado en "Pendiente para la integración S1→S2→S3" más: enlaces de sidebar a canales y chat web, `express.json({ limit })` previo para el chat público, `TRUST_PROXY` para firmas de Twilio, configuración externa de webhooks (Meta verify token y App Secret, Twilio StatusCallback, Telegram setWebhook).

## A1 Clientes, contactos e identidad

## A2 Oportunidades, actividades, compromisos, tools

Archivos propios: `server/src/services/crm/opportunities.ts`, `activities.ts`, `commitments.ts`, `crm-tools.ts`, `crm-tools.test.ts`, `opportunities.test.ts`; bloques `// A2 begin/end` en `server/src/routes/crm.ts` y `ui/src/api/crm.ts`; `ui/src/pages/crm/Opportunities.tsx`, `ui/src/components/crm/{OpportunityBoard,ActivityTimeline,CommitmentsList}.tsx`; claves `crm.opportunities.*`, `crm.activities.*`, `crm.commitments.*` en los 40 locales (fusionadas dentro del objeto `crm`).

Pendiente de integración (no hecho por A2):
- Registro de herramientas en el runner: `crmToolDefinitions()` y `callCrmTool({ name, arguments, apiUrl, token, companyId })` existen en `services/crm/crm-tools.ts`, pero NO están en `CAPABILITY_SEMANTIC_TOOL_CATALOG`. Ese catálogo es una unión cerrada (`PaperclipSemanticActionId` en `packages/paperclip-runner/src/catalog/semantic-action-types.ts`) con reconciliación contra `protocol-actions` y `generated/semantic-action-catalog.json` regenerado desde `dist`. Añadirlo exige cambios en el paquete del runner y su build; no se hizo. Falta también una ruta MCP (`/api/mcp/crm-tools`, patrón de `routes/project-tools.ts`) montada en `app.ts`, o el cableado en `native-runtime/paperclip-runner-tool-authority.ts`.
- `packages/db`: sin cambios de esquema por A2 (usa `opportunities`, `crm_activities`, `commitments`, `pipelines`, `pipeline_stages`, `pipeline_transitions` del contrato). Depende de que la migración del contrato exista (`0358` ya contiene las tres tablas).
- `services/index.ts` (propietario): exportar `opportunityService`, `crmActivityService`, `commitmentService` si se quiere desde el índice. El código las importa desde `services/crm/*.js`.
- `services/leads/adapters.ts` (B): sustituir el TODO(A2) por `opportunityService(db).create(companyId, input, actor)`. Requiere `customerId` existente en la empresa; el pipeline `sales` se crea perezosamente con `ensureSalesPipeline`.
- `routes/crm.ts`: las rutas A2 están en el bloque `// A2 begin/end`. Endpoints añadidos fuera de la lista del contrato: `POST /opportunities/:id/close`, `POST /opportunities/:id/next-action`, `GET /opportunities/:id` y `PATCH` (ya en la lista). `GET /companies/:companyId/crm/activities` exige `subjectKind` y `subjectId`.
- Cambios de etapa: `POST /opportunities/:id/stage` y `/close` pasan por `gateExternalAction` con `actionType: 'stage_change'` y clave `stage_change:<id>:<expectedVersion>:<stageKey>`. Board: ejecución directa (200). Agente: según autonomía; `draft_only` por defecto devuelve 202 con la acción pendiente y NO cambia la etapa. La aprobación de `approval` la gestiona `approveExternalAction`, que necesita el ejecutor en memoria del proceso (ver el propio gate); no hay ruta de aprobación específica para estas acciones.
- Pipeline `sales`: `enforceTransitions = false` y sin aristas por defecto (cualquier movimiento válido). Las aristas se validan solo si alguien activa `enforceTransitions` y añade `pipeline_transitions`.
- Idempotencia sin columna nueva: las creaciones con `idempotencyKey` guardan una referencia `idem:<ámbito>:<clave>` en `crm_activities.external_ref`. No hay índice único sobre esa columna: dos peticiones concurrentes con la misma clave pueden crear dos filas. Un índice único parcial sobre `(company_id, external_ref) where external_ref like 'idem:%'` lo cerraría (migración aditiva, pendiente).
- Validadores locales (no en `packages/shared/src/validators/crm.ts`): `setNextActionSchema` y `closeOpportunitySchema` en `services/crm/opportunities.ts`.
- Herramientas `crm_search`, `crm_get_customer`, `crm_create_customer` y `crm_create_contact` se llaman sobre la API de A1 (`/customers`, `/contacts`); dependen de sus rutas.
- Locales: `crm.opportunities.*`, `crm.activities.*`, `crm.commitments.*` en los 40 locales (es en español, resto en inglés), fusionados con el objeto `crm` existente sin tocar otras claves. Conflicto potencial en `ui/src/i18n/locales/*.json`: integrar en orden o fusionar `crm`.
- Creación de oportunidades desde la UI: no implementada (la página lista y mueve; crear se hace por API o agente).
- Vista de compromisos y actividad: `CommitmentsList` y `ActivityTimeline` se abren desde el panel lateral de cada tarjeta/fila; no hay pestañas en `CustomerDetail.tsx` (eso es A1).

Desviaciones del contrato:
- `crm-tools.ts` exporta `crmToolDefinitions` / `callCrmTool` (patrón de `project-tools.ts`), no `crmAgentTools(db)`. Las llamadas van por la API autenticada como se pidió, no por servicios directos.
- Se añaden `findById` (sin company) en `opportunityService` y `commitmentService` solo para comprobar acceso en rutas.
- Las consultas por cursor comparan `date_trunc('milliseconds', ...)` con parámetros texto + `::timestamptz`: el driver de la base embebida no acepta `Date` en SQL crudo.

## B Entrada de leads
- Esquema: añadir `export * from "./lead_forms.js"` en `packages/db/src/schema/index.ts` y regenerar la migración (`pnpm db:generate`). Hasta entonces `server/src/routes/public/leads.ts` no compila (`leadForms` no exportada) y el test de formulario público devuelve 500. El test crea la tabla con SQL puente (`create table if not exists lead_forms`); quitarlo al migrar.
- Formularios: no hay UI ni endpoint para crear `lead_forms`; se siembran por SQL hasta que exista un constructor.
- Contactos, identidades, clientes y oportunidades: `services/leads/adapters.ts` es un adaptador local con TODO(A1)/TODO(A2). Sustituir por `identityService`, `contactService`, `customerService` y `opportunityService.create` (este último asigna pipeline y etapa `sales`).
- Tools de agente: `services/leads/lead-tools.ts` define `lead_get`, `lead_list`, `lead_triage`, `lead_convert` y las llama directamente. No están cableadas en el catálogo del runner vendorizado (`server/src/vendor/paperclip-runner`); integración decide si se añaden allí.
- Validadores locales: `leadListQuerySchema`, `triageLeadSchema`, `discardLeadSchema` (`services/leads/leads.ts`) y `csvImportBodySchema` (`services/leads/csv-import.ts`). Podrían moverse a `packages/shared/src/validators/crm.ts` si el responsable del contrato lo prefiere.
- Bug en `services/crm/common.ts` (pista A1): `likeContains` anida una plantilla dentro de otra y el reemplazo produce el texto literal `${ch}` en lugar de escapar `%` y `_`. Esta pista no lo usa (escapa LIKE en `leads.ts`); A1 debe corregirlo.
- Rutas nuevas de B: `GET /leads/:id/activity`, `POST /leads/:id/triage`, `POST /companies/:companyId/leads/import/preview`. El import ya no es solo confirmación: el preview es paso previo.
- Locales: `crm.leads.*` añadido en los 40 locales (es en español, resto en inglés) dentro del objeto `crm` existente, sin tocar las claves de otras pistas.
- Conflicto en la rama: `ui/src/i18n/locales/*.json` lo editan varias pistas; integrar en orden o fusionar el objeto `crm`.
- Router público: la ruta se registra como `/:companySlug/form/:formSlug` porque `publicSurfaceRoutes` solo usa `/:companySlug` como middleware. Otras pistas públicas (chat, reserva, revisión) deben hacer lo mismo.
- `publicRateLimit` se importa de `routes/public-surface.ts`, y ese archivo importa `public/leads.ts`: dependencia circular benigna (solo se usa en tiempo de ejecución).

## C Bandeja y mensajes

Estado: servicios, rutas, cliente API, páginas, componentes, claves i18n y tests (7, en verde) hechos. Pendiente de integración (archivos de un solo propietario, no tocados):

- `server/src/app.ts` (línea ~876): cambiar `conversationRoutes(db)` por `conversationRoutes(db, emailChannels)`. Sin el segundo argumento, el envío por correo responde "no disponible" y el canal email no se registra. Ver también `registerConversationTransport` en `services/conversations/messages.ts`.
- `server/src/routes/index.ts` ya exporta `conversationRoutes`; no hace falta más.
- Herramientas de agente: `services/conversations/message-tools.ts` exporta `conversationToolDefinitions()` y `callConversationTool({ name, arguments, apiUrl, token, companyId })`, siguiendo `project-tools.ts`. Falta registrarlas en el catálogo del runner (`server/src/vendor/paperclip-runner/index.ts` y el despacho en `services/native-runtime/paperclip-runner-tool-authority.ts`, como hace `callProjectTool`). No lo he hecho: esos archivos no son míos. Mismo punto que la pista A2.
- `ui/src/App.tsx`: las rutas `conversations` y `conversations/:conversationId` ya apuntan a las páginas nuevas. No hay cambios.
- Sidebar: el enlace "Conversaciones" a `/conversations` debe existir en `ui/src/components/Sidebar.tsx` (grupo Negocio). No lo he añadido.
- Migración: no añado tablas. Las tablas `conversations` y `conversation_messages` vienen del contrato. Sin columnas nuevas.
- Dependencias de A1 y B: `services/conversations/adapters.ts` tiene dos adaptadores con TODO. `resolveContactForInbound` (sustituir por `identityService.resolve`) y `ensureLeadForInbound` (sustituir por `intakeService.ingest`). Ambos se borran al integrar. `identity.ts` y `leads/intake.ts` aún son stubs.
- Proyección de correo: `transports/email.ts` `projectEmailConversations(db, companyId)` copia `chat_conversations` y `email_messages` (provider `agentmail`), con limitador de 15 s por empresa, y se llama desde el listado y el detalle. No hay hook en `email-channels.ts`; si se añade, puede llamar a la misma función.
- Límite conocido: la proyección no enlaza contacto (contactId queda null para correo proyectado).
- Gate: el envío de mensajes usa `actionType` `email` (canal correo) o `message` (resto). `idempotencyKey` = `message:<messageId>:<actor>`. Para aprobación (`send_with_approval`) el ejecutor queda en memoria del proceso; `approveExternalAction` debe llamarse desde la ruta de aprobaciones existente (no añadida).
- Validadores de `packages/shared` (contrato): la lista de conversaciones usa un esquema local `conversationListQuerySchema` (en `services/conversations/conversations.ts`), y las rutas `assign`, `link` y `reconcile` tienen esquemas locales en `routes/conversations.ts`. Si el contrato quiere moverlos a shared, hay que avisar.
- SLA: constante `CONVERSATION_SLA_HOURS = 4` en `services/conversations/conversations.ts`; no hay ajuste por empresa todavía.
- Cambio de firma a notar: `recordInboundMessage(db, companyId, input)` (db primero, como el resto de servicios). Las pistas D/E/F importan `recordInboundMessage` desde `services/conversations/inbound.ts`.

## H Agenda

- Esquema: añadir `export * from "./calendar.js";` en `packages/db/src/schema/index.ts` y regenerar migración con `pnpm db:generate` (tablas `booking_types`, `calendar_events`; FKs a `tool_connections`, `contacts`, `customers`, `opportunities`, `agents`). Renumerar si choca con S1. Los tests con base de datos no corren hasta que exista la migración.
- Montaje de rutas: `calendarRoutes(db, { calendar })` en `routes/index.ts` / `app.ts`. Sin `calendar` se usa un invocador sin conectar que responde 422: hay que inyectar uno real (por ejemplo sobre `toolGateway.executeTestCall` con un agente o usuario de la empresa) antes de usar Google Calendar en producción.
- Herramientas de agente: `calendarAgentTools(db).definitions` y `.call(name, args, { companyId, agentId })` deben registrarse en `services/native-runtime/paperclip-runner-tool-authority.ts` para `calendar_availability`, `calendar_book`, `calendar_reschedule`, `calendar_cancel`. Yo no toqué ese archivo.
- Público: `registerPublicBookingRoutes` ya lo llama `public-surface.ts`; la empresa se lee de `res.locals.publicCompanyId` (literal, para evitar ciclo de import).
- Nombres de herramientas upstream de Google Calendar (`list-events`, `create_event`, `update_event`, `delete_event`) y sus argumentos son supuestos: verificar contra el MCP vivo. El recibo se considera confirmado solo si el proveedor devuelve id y `status: confirmed`.
- Shared: los esquemas de entrada (`services/calendar/schemas.ts`) y los DTOs de UI (`ui/src/api/calendar.ts`) son locales; si se quieren en `packages/shared`, moverlos al integrar.
- El formulario de tipo de reserva no tiene selector de conexión de Google Calendar: hoy el tipo se crea sin `connectionId` y reservar devuelve 422 claro hasta que se asigne.
- Claves i18n `schedule.*` añadidas en los 40 locales (es en español, resto en inglés).
- La query key de tipos de reserva es `["calendar", companyId, "booking-types"]`, local a la página; `queryKeys.calendar` no la tiene.
- Pendiente de decisión: doble reserva entre dos visitantes en el mismo hueco no tiene bloqueo transaccional (se verifica el hueco y luego se inserta).

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

Estado: hecho en `paperclip-s2` (sin commit). Transportes Meta (WhatsApp, Messenger, Instagram), Telegram y Twilio con `fetch`; webhooks firmados; cuentas de canal (esquema, servicio, rutas privadas); página de ajustes y cliente API; claves `channels.*` en los 40 locales (es en español, resto en inglés). Verificado: 16 tests en verde (`channels.test.ts`), `locale-validation` 7/7, typecheck servidor solo con `instrumentation.ts(483)` preexistente, typecheck UI solo con los 3 errores de Artefactos, token gates sin violaciones en mis archivos.

Archivos propios: `packages/db/src/schema/customer_channels.ts`; `server/src/services/customer-channels/accounts.ts`; `server/src/services/conversations/transports/{meta,telegram,twilio,register,delivery-status,shared}.ts` (sustituyen los stubs `*TransportService`, que no tenían importadores); `server/src/routes/channels-inbound.ts` (stub, ya montado en `app.ts` bajo `/api`); `server/src/routes/customer-channels.ts`; `server/src/services/conversations/transports/channels.test.ts`; `ui/src/api/channels.ts`; `ui/src/pages/ChannelsSettings.tsx`; `ui/src/i18n/locales/*.json` (solo inserción del objeto `channels`).

Pendiente de integración (archivos de un solo propietario, no tocados):
- `packages/db/src/schema/index.ts`: añadir `export * from "./customer_channels.js";`. Después `pnpm db:generate` para que la migración del contrato incluya `customer_channel_accounts` (columnas: `provider`, `kind`, `label`, `external_account_id`, `provider_account_sid`, `verify_secret_name`, `challenge_secret_name`, `token_secret_name`, `status`, `approved_templates` jsonb, `last_tested_at`, `last_test_error`, timestamps; único `(company_id, provider, external_account_id)`; checks de proveedor, tipo y estado). Tabla nueva y aditiva, sin columnas tocadas en el contrato.
- Al tener la migración, quitar en `channels.test.ts` el puente SQL del `beforeAll` (`create table if not exists customer_channel_accounts` y su índice). Ese test no corre sin la migración o el puente.
- Importaciones: los servicios y rutas usan la ruta profunda `@paperclipai/db/schema/customer_channels`, el mismo patrón que `services/crm/memory.ts` (pista K). Si se exporta desde el índice, puede cambiarse a la importación raíz.
- `server/src/app.ts`:
  - Tras crear `db`: `import { registerChannelTransports } from "./services/conversations/transports/register.js"; registerChannelTransports(db);` una sola vez. Sin esta llamada, los envíos por WhatsApp, Messenger, Instagram, Telegram y SMS responden "No hay transporte activo".
  - Montar `customerChannelRoutes(db)` junto a `conversationRoutes`: `api.use(customerChannelRoutes(db));`. Importar desde `./routes/customer-channels.js`.
  - `channelInboundRoutes(db)` ya está montado (línea ~879). Las rutas quedan en `/api/webhooks/meta/:companyId` (GET reto y POST), `/api/webhooks/twilio/:companyId` y `/api/webhooks/telegram/:companyId` (esta última no estaba en el contrato).
- `server/src/routes/index.ts` (opcional): exportar `customerChannelRoutes` y `channelInboundRoutes`.
- `ui/src/App.tsx` y navegación: `ChannelsSettings` no está enrutada. Falta decidir la entrada (por ejemplo, un apartado de ajustes). `ui/src/api/channels.ts` no expone `remove`; la ruta `DELETE /customer-channels/:id` existe, pero la UI no la usa.
- Configuración externa (no es código): Meta necesita la URL del webhook `https://<host>/api/webhooks/meta/<companyId>` con el token de verificación (secreto de `challengeSecretName`) y el App Secret (secreto de `verifySecretName`). Twilio: webhook entrante y de estado apuntando a `/api/webhooks/twilio/<companyId>`; el envío no pasa `StatusCallback`, así que el callback de estado depende de la configuración del número o servicio en Twilio. Telegram: `setWebhook` con `secret_token` igual al valor de `verifySecretName` y URL `/api/webhooks/telegram/<companyId>`.
- Logs HTTP: `middleware/http-log-policy.ts` solo trata como privadas las rutas `/api/chat-webhooks`, `/api/voice-webhooks` y `/api/routine-triggers/public`. Decidir si `/api/webhooks` entra en esa lista. Los cuerpos no se registran; la URL contiene solo el id de empresa.
- Mapas: las rutas nuevas (`/api/webhooks/*`, `/companies/:companyId/customer-channels`, `/customer-channels/:id`, `/customer-channels/:id/test`) deben reflejarse en `maps/agent-access-map` según AGENTS.md (son solo de board o públicas firmadas). Después `node scripts/check-maps.mjs`.
- Herramientas de agente: no hay tools de canal en el runner; el envío sigue el camino de `conversationMessageService`, como el resto de canales.

Desviaciones del contrato (decididas por D/E):
- Messenger e Instagram fuera de la ventana de 24 h se rechazan con `TransportRejectedError`. Las plantillas aprobadas solo se usan para WhatsApp. Meta tiene reglas de etiquetas de mensaje distintas que no implementé.
- Plantillas de WhatsApp: se envía la primera aprobada de la cuenta, sin variables. Un selector de plantilla y variables queda para más adelante.
- Telegram: implementación mínima propia sobre la Bot API, no reutiliza `chat-channels/telegram`, porque ese código está acoplado a conversaciones de agente, incidencias y publicaciones.
- Cuenta de Twilio: el identificador externo es el número E.164 (clave de enrutado del entrante); el SID va en `provider_account_sid`. Columna adicional, nullable, dentro de la tabla propia.
- `customer_channel_accounts` tiene dos columnas más que el contrato pedía de forma implícita: `challenge_secret_name` (token de verificación de Meta, distinto del App Secret) y `last_tested_at` / `last_test_error`.
- Los estados de entrega de Meta solo llegan por callbacks; la lectura de Messenger/Instagram (`read`) no se mapea porque el evento trae un watermark, no un id de mensaje.
- Los webhooks responden 401 sin detalle a cualquier fallo de firma, también en el reto GET de Meta (no 403).

Riesgos y puntos a revisar:
- El parseo JSON de Meta y Telegram lo hace el middleware global de `app.ts` antes de la verificación. La firma se comprueba sobre los bytes crudos (`req.rawBody`) antes de usar cualquier campo. Twilio parsea el formulario en la ruta; la firma se comprueba antes de usar ningún valor.
- Twilio construye la URL firmada con `req.protocol` y `Host`. Detrás de un proxy, `TRUST_PROXY` debe estar configurado; si no, la firma no coincide.
- Varios secretos por cuenta: el webhook de Meta prueba la firma con cada cuenta activa de la empresa; cuentas que comparten App Secret se distinguen por el id de número, página o cuenta. Dos cuentas activas del mismo tipo: el envío usa la más antigua.
- Envíos inciertos (5xx, timeout): quedan `uncertain` y no se reenvían. Solo un usuario de board puede resolverlos a mano (`reconcile` con `resolution`), mediante el `resolveManually` de cada transporte.


## F Chat web

Estado: hecho en `paperclip-s2` (sin commit). Sesiones anónimas firmadas (24 h), identificación opcional que crea lead y contacto una sola vez, mensajes entrantes con `recordInboundMessage`, respuestas salientes visibles para el widget solo cuando están enviadas, handoff a persona, widget embebible sin dependencias, ajustes en la UI. Verificado: 11 tests de ruta en verde (`routes/public/chat.test.ts`), `locale-validation` 7/7, typecheck servidor solo con `instrumentation.ts(483)` preexistente, typecheck UI solo con los 3 errores de Artefactos, token gates sin violaciones en mis archivos. Prueba de humo del widget en jsdom (22 comprobaciones, fuera del repo): en verde.

Archivos propios: `server/src/services/conversations/transports/webchat.ts` (sustituye el stub `webchatTransportService`), `transports/register-webchat.ts`, `services/conversations/webchat-constants.ts`, `services/conversations/webchat-settings.ts`, `services/conversations/webchat-tools.ts`, `server/src/routes/public/chat.ts` (sustituye el stub), `server/src/routes/public/chat.test.ts`, `server/src/routes/webchat.ts`, `server/src/public/widget.js`, `packages/db/src/schema/webchat_settings.ts`, `ui/src/pages/WebchatSettings.tsx`, `ui/src/api/webchat.ts`, bloque `webchat` en los 40 locales (solo inserción).

Pendiente de integración (archivos de un solo propietario, no tocados):
- `packages/db/src/schema/index.ts`: `export * from "./webchat_settings.js";` y `pnpm db:generate` (tabla `webchat_settings`: `company_id` único, `active`, `greeting`, `brand_color`, timestamps). Después de migrar, quitar en `routes/public/chat.test.ts` el puente `create table if not exists webchat_settings`. El servicio de ajustes usa SQL crudo hasta entonces; se puede cambiar a Drizzle al exportar.
- `server/src/app.ts`:
  - Importar una vez `./services/conversations/transports/register-webchat.js` (registra el transporte `webchat` al cargar el módulo). Sin esto, responder a una conversación de chat web da "No hay transporte activo".
  - Montar `webchatRoutes(db)` de `./routes/webchat.js`: ajustes (`GET/PUT /companies/:companyId/webchat/settings`) y handoff (`POST /conversations/:conversationId/webchat-handoff`).
  - Límite de 4 KB: el middleware JSON global de `app.ts` (`DEFAULT_JSON_BODY_LIMIT`, 10 MB) lee el cuerpo antes que las rutas de chat. Las rutas rechazan con 413 cuando el cuerpo pasa de 4096 bytes, pero no antes de parsearlo. Para cortar antes, montar `express.json({ limit: "4kb" })` sobre `/api/p/:companySlug/chat` antes del parser global.
- `server/src/routes/index.ts` (opcional): exportar `webchatRoutes`.
- `server/package.json` (script `build`): copiar `src/public/` a `dist/public/` (`cp -R src/public/. dist/public/`). La ruta `GET /p/:companySlug/widget.js` lee `public/widget.js` relativo a `routes/public/chat.js` compilado. Sin la copia, responde 500.
- Herramienta de agente `webchat_handoff`: `webchatToolDefinitions()` y `callWebchatTool({ name, arguments, apiUrl, token })` en `services/conversations/webchat-tools.ts`, siguiendo `project-tools.ts`. Registrar en el catálogo del runner y en `paperclip-runner-tool-authority.ts`, como el resto de pistas. Llama a `POST /api/conversations/:id/webchat-handoff`.
- `ui/src/App.tsx`: ruta `webchat-settings` → `WebchatSettings` de `./pages/WebchatSettings`. Enlace en el sidebar si se quiere (no lo añadí).
- Mapas: las rutas nuevas (`/api/p/:companySlug/chat/*`, `/api/p/:companySlug/widget.js`, `/companies/:companyId/webchat/settings`, `/conversations/:id/webchat-handoff`) deben reflejarse en `maps/agent-access-map` según AGENTS.md. Después `node scripts/check-maps.mjs`.
- Dirección de la URL pública: la página de ajustes muestra `<script src="{origen actual}/api/p/{companyId}/widget.js">`. Si el sitio público vive en otro host, ajustar esa URL.
- Contrato: `doc/plans/2026-10-21-sprint-2-contrato.md` dice `/p/:companySlug/chat`. Implementé las rutas de la petición de la pista: `/api/p/:companySlug/chat/session`, `/chat/:sessionId/identify`, `/chat/:sessionId/messages` (GET y POST), `/chat/config`, `/chat/logo` y `/widget.js`. Alinear el contrato.

Desviaciones del brief y del contrato (decididas por F):
- `after` es un desplazamiento (offset) sobre los mensajes visibles, ordenados por `created_at, id`, no un número de secuencia. Un borrador enviado después puede desplazar posiciones; el widget descarta duplicados por id, así que no se pierde ningún mensaje.
- `seq` (contador del widget por sesión) forma el id externo `${sessionId}:${seq}`. Un reintento con el mismo `seq` devuelve 200 y no guarda nada nuevo. Sin esto, una recarga reiniciaría el contador y un mensaje nuevo se descartaría como duplicado.
- La identificación responde 200 `{ ok: true }` siempre, con o sin lead nuevo, para no revelar si ya existía.
- El handoff es una ruta nueva `routes/webchat.ts` y no una ruta de `routes/conversations.ts` (archivo de C).
- Color y saludo viven en `webchat_settings`: `companies` no tiene color de marca. El logotipo sale de `company_logos` y solo se sirve (`/chat/logo`) cuando el chat está activo, y solo para PNG, JPEG, WebP y GIF (SVG excluido).
- Token de sesión: firmado sin estado, caduca a las 24 h, no se revoca. Si se filtra, da acceso a esa sesión anónima y nada más.
- Contacto: si el primer mensaje ya creó el lead sin contacto, la identificación completa el lead con su contacto (busca por identidad o crea uno). Así el contacto se crea una sola vez aunque el orden sea mensaje primero.
- Salientes: el transporte no envía nada fuera del proceso. `messageService.send` guarda la respuesta y pasa por `gateExternalAction` como cualquier canal, y el widget la ve cuando está en `sent`; al descargarla pasa a `delivered`.
- Límite por sesión (30 mensajes/min) y por IP en sesiones (20/min) en memoria del proceso, igual que el resto de la superficie pública.
- Actividad registrada: `webchat.settings_updated` (ajustes), `conversation.webchat_handoff` (handoff, además del `conversation.state_changed` de `setState`).
- Widget: DOM en shadow root; texto solo con `textContent`; color validado con regex antes de usarlo; sondeo cada 3 s solo con el panel abierto; teclado (Escape cierra, foco al lanzador, `aria-live` en el registro); textos en español si el idioma de la página es `es`, en inglés en el resto.
- No probado en navegador real: la prueba de humo fue jsdom con `fetch` simulado. Revisar la apariencia y el comportamiento en un sitio de prueba antes de producción.
- El agente que responde automáticamente queda fuera (depende del contexto de negocio del S1).
