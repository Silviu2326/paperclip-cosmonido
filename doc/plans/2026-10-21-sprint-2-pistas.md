# Sprint 2: encargos por pista

Fecha: 2026-10-21
Rama: `sprint-2` (worktree `paperclip-s2`). Contrato: [2026-10-21-sprint-2-contrato.md](2026-10-21-sprint-2-contrato.md). Lee el contrato entero antes de empezar; sus reglas mandan. Estado real tras el contrato: `:companySlug` en `/p/` es el id de empresa (no hay columna slug); la bandeja CRM vive en `/conversations`; la migración del contrato es `0358_heavy_blizzard.sql` y la renumera el integrador; los tests del servidor con base embebida tardan unos 3 minutos en arrancar, ejecuta solo los tuyos.

Cada pista posee solo los archivos que se listan en su sección (más sus tests y claves i18n nuevas en `ui/src/i18n/locales/*` con prefijo propio). No toques archivos de otra pista ni los de un solo propietario. Si necesitas algo fuera de tu pista, escríbelo en `2026-10-21-sprint-2-integracion.md` bajo tu pista.

Fase B (en paralelo): A1, A2, B, C, H, K, M. Fase C (tras C): D/E, F. Pospuestas a la integración con el S1: I (revisión externa, necesita `deliverable_reviews`), J (publicación), N (estudio v2), G (teléfono), L (sync externo, opcional).

---

## A1. Clientes, contactos e identidad

Archivos: `server/src/services/crm/customers.ts`, `contacts.ts`, `identity.ts` (ya tiene normalizadores), `server/src/routes/crm.ts` (solo las rutas de customers, contacts y duplicates; deja comentarios `// A2` donde van oportunidades, actividades y compromisos), `ui/src/api/crm.ts` (métodos de customers/contacts/duplicates), `ui/src/pages/crm/Customers.tsx`, `CustomerDetail.tsx`, `Contacts.tsx`, componentes nuevos en `ui/src/components/crm/`.

Entrega:
- `customerService`: `list(companyId, query)` con paginación por cursor, búsqueda `q` por nombre y dominio, filtro `status`; `getById`, `create` (idempotente por `idempotencyKey` usando una tabla o índice existente de idempotencia si lo hay; si no, por `(company_id, name, domain)` en la misma transacción), `update`, `archive`, `findDuplicates(input)` → candidatos por dominio, nombre normalizado y correo de contacto, nunca fusiona.
- `contactService`: `list`, `getById`, `create` (normaliza correo y teléfono con `identity.ts`, crea `contact_identities` para email y phone), `update`, `link(customerId, contactId, role, isPrimary)`, `unlink`, `findDuplicates` por identidad normalizada.
- `identityService.resolve(companyId, { email?, phone?, handle?, channel? })` → contacto existente o `null`, sin crear.
- Rutas con `assertCompanyAccess`, `validate`, `logActivity` (`customer.created`, `customer.updated`, `customer.archived`, `contact.created`, `contact.linked`...). Errores 404 fuera de empresa, 409 si `findDuplicates` devuelve candidatos y la creación no lleva `force: true`.
- UI: `/customers` lista con búsqueda, filtro de estado, alta en diálogo con aviso de duplicados; `/customers/:id` con pestañas Resumen, Contactos, Oportunidades (placeholder que consume `crmApi.opportunities.listByCustomer`, A2), Actividad (placeholder A2), Memoria (placeholder K); `/contacts` lista y alta. Estados cargando, vacío, error, sin permiso.
- Tests: scoping, duplicados, normalización, paginación.

## A2. Oportunidades, actividades, compromisos y herramientas de agente

Archivos: `server/src/services/crm/opportunities.ts`, `activities.ts`, `commitments.ts`, `crm-tools.ts`, rutas de oportunidades/actividades/compromisos en `server/src/routes/crm.ts` (añade bajo los comentarios `// A2`; coordina con A1 editando solo esas secciones), `ui/src/api/crm.ts` (métodos de opportunities/activities/commitments, añade sin tocar los de A1), `ui/src/pages/crm/Opportunities.tsx`, `ui/src/components/crm/OpportunityBoard.tsx`, `ActivityTimeline.tsx`, `CommitmentsList.tsx`.

Entrega:
- `opportunityService`: `ensureSalesPipeline(companyId)` crea el pipeline `sales` con sus etapas en `pipelines`/`pipeline_stages` existentes si no existe; `list` (filtros `status`, `stageKey`, `ownerId`, `customerId`, `nextActionBefore`), `getById`, `create`, `update` con `expectedVersion` (409 si difiere), `changeStage` (valida transición si el pipeline tiene `enforceTransitions`, incrementa `version`, registra `crm_activities` `stage_change`), `setNextAction`, `close(won|lost, reason)`.
- `activityService.log(...)` y `listBySubject` paginado; `commitmentService` `create`, `list`, `resolve(kept|missed|cancelled)`.
- Herramientas de agente en `crm-tools.ts` siguiendo `project-tools.ts`: `crm_search`, `crm_get_customer`, `crm_create_customer`, `crm_create_contact`, `crm_create_opportunity`, `crm_update_opportunity_stage`, `crm_set_next_action`, `crm_log_activity`, `commitment_create`, `commitment_resolve`. Cada una llama a la API autenticada; añade sus entradas al catálogo donde `project-tools.ts` obtiene las suyas (`CAPABILITY_SEMANTIC_TOOL_CATALOG` en `server/src/vendor/paperclip-runner/index.ts` o el mecanismo que encuentres) sin romper el resto. `crm_update_opportunity_stage` pasa por `gateExternalAction` con `actionType='stage_change'`.
- UI: `/opportunities` tablero por etapa con arrastre (usa la librería de drag que ya use el repo, si hay; si no, botones "mover a") y vista lista; tarjeta con importe, próxima acción, responsable; cambio de etapa con actividad.
- Tests: versión optimista, transición, tools con scoping.

## B. Entrada de leads

Archivos: `server/src/services/leads/leads.ts`, `intake.ts`, `csv-import.ts`, `lead-tools.ts`, `server/src/routes/leads.ts`, `server/src/routes/public/leads.ts`, `ui/src/api/leads.ts`, `ui/src/pages/crm/Leads.tsx`, `LeadDetail.tsx`, `ui/src/components/crm/LeadImportDialog.tsx`.

Entrega:
- `intakeService.ingest(companyId, { source, sourceRef, payload, identity: { email?, phone?, handle?, channel? }, language? })`: resuelve contacto con `identityService` (A1; si aún no existe, implementa un `resolve` local mínimo y anótalo), crea o actualiza lead, idempotente por `(source, sourceRef)`; repetir la misma entrada devuelve el lead existente. Crea actividad `system`.
- `leadService`: `list` (filtros `status`, `source`, `priority`, `assigned`), `getById`, `update`, `triage({ priority, language, assignedUserId|assignedAgentId })`, `convert(input)` idempotente por `idempotencyKey`: crea o enlaza customer/contact y, si se pide, oportunidad (llama a `opportunityService.create` de A2; si no existe aún, deja un adaptador con TODO), marca `converted`; `discard(reason)`.
- `csvImportService`: parseo sin dependencia nueva, mapeo de columnas, vista previa con duplicados, confirmación.
- Público: `POST /p/:companySlug/form/:formSlug` que acepta JSON o `application/x-www-form-urlencoded`, valida campos mínimos (nombre y correo o teléfono), honeypot, rate limit del router público, y llama a `intakeService` con `source='form'`, `sourceRef` = id generado por el cliente si viene o hash de (formSlug, email, minuto). Registra el formulario en una tabla pequeña `lead_forms` (`company_id`, `slug`, `name`, `fields jsonb`, `active`) que creas en `packages/db/src/schema/lead_forms.ts` y anotas en integración para el export y migración.
- Tools: `lead_get`, `lead_list`, `lead_triage`, `lead_convert`.
- UI: `/leads` cola con filtros y acciones triaje/convertir/descartar; `/leads/:id` detalle con payload, identidad resuelta, actividad; diálogo de importación CSV con mapeo y vista previa.
- Tests: idempotencia de entrada repetida, conversión idempotente, formulario público con rate limit.

## C. Bandeja unificada y mensajes

Archivos: `server/src/services/conversations/conversations.ts`, `messages.ts`, `inbound.ts` (nuevo: `recordInboundMessage` que las pistas D/E/F usarán), `message-tools.ts`, `transports/email.ts`, `server/src/routes/conversations.ts`, `ui/src/api/conversations.ts`, `ui/src/pages/ConversationInbox.tsx` (ruta `/conversations`; `/inbox` es la bandeja de tareas existente y no se toca), `ConversationDetail.tsx` (ruta `/conversations/:conversationId`), `ui/src/components/inbox/`.

Entrega:
- `conversationService`: `list` (filtros `status`, `channel`, `assigned`, `customerId`, `contactId`, `overdue`), `getById`, `create`, `setState`, `assign`, `link({ customerId?, opportunityId?, leadId? })`, SLA: `sla_due_at` = último inbound + SLA de empresa (constante configurable, por defecto 4 h) y vista "vencidas".
- `recordInboundMessage(companyId, { channel, externalThreadId, externalMessageId, from: { email?, phone?, handle? }, body, attachments?, occurredAt })`: resuelve contacto (A1), crea conversación si no existe (único por hilo), inserta mensaje `inbound` idempotente por `(provider, providerMessageId)`, actualiza `last_inbound_at`, estado `waiting_us`; si no hay lead ni cliente, crea lead vía `intakeService` (B; si no existe, TODO con adaptador).
- `messageService`: `draft(conversationId, body)` crea mensaje `draft`; `send(messageId | { conversationId, body }, actor)` pasa por `gateExternalAction` con `actionType='email'|'message'` según canal; `execute` llama al transporte del canal; estados `queued → sent|failed|uncertain` según recibo; un envío `uncertain` no se reintenta sin `reconcile(messageId)`.
- `transports/email.ts`: proyección de `emailMessages`/`emailSends` existentes (lee `packages/db/src/schema/email.ts` y `server/src/services/email-connections.ts`) hacia `conversations`/`conversation_messages`: importación inicial y escucha de nuevos mensajes si hay un hook; envío por el servicio de correo existente devolviendo `providerMessageId`. Interfaz común `ConversationTransport { send(message): Promise<{ providerMessageId?, status }> }` en `transports/types.ts` para que D/E/F la implementen.
- Tools: `conversation_list`, `conversation_get`, `message_draft`, `message_send`, `message_reply`, `conversation_set_state`.
- UI: `/conversations` con lista por estado/canal/responsable, "esperan respuesta" y "vencidas", y panel de conversación con hilo, redactor, estado de entrega por mensaje (borrador, en cola, enviado, entregado, leído, fallido, incierto) y acciones de estado/asignación. `/conversations/:conversationId` abre el mismo panel.
- Tests: idempotencia de inbound, gate por nivel, incierto no se repite.

## H. Agenda

Archivos: `server/src/services/calendar/google-calendar.ts`, `booking.ts`, `calendar-tools.ts`, `server/src/routes/calendar.ts`, `server/src/routes/public/booking.ts`, `ui/src/api/calendar.ts`, `ui/src/pages/Schedule.tsx`, `ui/src/components/schedule/`, esquema `packages/db/src/schema/calendar.ts` (`booking_types`: empresa, slug, nombre, duración, agente o usuario anfitrión, horario semanal jsonb, buffer; `calendar_events`: empresa, proveedor, id externo, tipo, anfitrión, contacto, cliente, oportunidad, inicio, fin, estado `proposed|confirmed|cancelled`, enlace, recibo) — anótalo en integración para el export y migración.

Entrega:
- `googleCalendarService` sobre el conector Google Workspace existente (lee `packages/shared/src/google-workspace-connectors.ts`, `doc/connections/GOOGLE-WORKSPACE.md` y cómo otros servicios llaman a herramientas de conexión, por ejemplo `server/src/services/tool-gateway.ts`): `freeBusy(connectionId, range)`, `createEvent`, `updateEvent`, `cancelEvent`, devolviendo el id del proveedor y el estado confirmado por él. Sin recibo del proveedor, el evento queda `proposed`.
- `bookingService`: `availability(bookingTypeId, range)` combina horario del tipo y freeBusy; `book(...)` pasa por `gateExternalAction` con `actionType='booking'`; `reschedule`, `cancel`; recordatorio como actividad (el envío por canal lo hará el playbook del S3).
- Público: `GET /p/:companySlug/book/:slug` (JSON de huecos) y `POST` (reserva con nombre, correo, teléfono, idempotente por `(slug, email, inicio)`); resuelve o crea contacto por `identityService`.
- Tools: `calendar_availability`, `calendar_book`, `calendar_reschedule`, `calendar_cancel`.
- UI: `/schedule` con próximas reuniones por cliente y oportunidad, tipos de reserva y su enlace público, estados `proposed`/`confirmed`.
- Tests: huecos respetan buffer y freeBusy; reserva sin recibo queda `proposed`; idempotencia.

## K. Memoria por cliente

Archivos: `server/src/services/crm/memory.ts`, ruta `/customers/:id/memory` dentro de `server/src/routes/crm-memory.ts` (archivo propio; anótalo en integración para montarlo), esquema `packages/db/src/schema/customer_memory.ts` (`customer_memory_notes`: empresa, cliente, clave, contenido, fuente `user|agent|detected`, agente, run, vigente hasta, archivado), `ui/src/components/crm/CustomerMemory.tsx` y su uso en la pestaña Memoria de `CustomerDetail.tsx` (coordina con A1: solo importas tu componente en esa pestaña).

Entrega: `get(customerId)` ordenado por clave y fecha, `append(customerId, { key, content, source })` sin sobrescribir (histórico), `archive(noteId)`; tools `customer_memory_get`, `customer_memory_append`; aislamiento: un agente solo puede leer la memoria del cliente del proyecto o conversación de su ejecución (comprueba contra `projects.customerId` si A1 lo añadió, o contra la conversación). Tests de aislamiento.

## M. Equipos y skills del S2

Archivos: `packages/teams-catalog/catalog/optional/sales/sales-inbound/**`, `packages/teams-catalog/catalog/optional/content/agency-content/**`, `packages/teams-catalog/catalog/optional/customer-care/customer-care/**`, skills en `packages/skills-catalog/catalog/optional/sales/{lead-triage,channel-reply,booking-etiquette}/SKILL.md` y `packages/skills-catalog/catalog/optional/content/{client-brief-intake,delivery-review}/SKILL.md`.

Entrega: sigue exactamente el formato de `content-machine` (TEAM.md, agentes con AGENTS.md y frontmatter, proyecto y tarea plantilla) y de `release-announcement/SKILL.md`. Los agentes declaran las herramientas del contrato que usan (`crm_*`, `lead_*`, `message_*`, `calendar_*`) en su AGENTS.md. Autonomía por defecto `draft_only` explicada en el texto. Regenera catálogos con los scripts de cada paquete y pasa sus tests.

## D/E. Canales: Meta (WhatsApp, Messenger, Instagram), Telegram, Twilio

Archivos: `server/src/services/conversations/transports/meta.ts`, `telegram.ts`, `twilio.ts`, `server/src/routes/channels-inbound.ts`, `ui/src/api/channels.ts`, `ui/src/pages/ChannelsSettings.tsx`, esquema `packages/db/src/schema/customer_channels.ts` (`customer_channel_accounts`: empresa, proveedor `meta|telegram|twilio`, cuenta/número/página id, secreto de verificación referenciado por `company_secrets`, estado, plantillas aprobadas jsonb) — anótalo en integración.

Entrega: webhooks firmados (`POST /webhooks/meta/:companyId` con verificación `X-Hub-Signature-256` y reto GET; `POST /webhooks/twilio/:companyId` con firma Twilio) que llaman a `recordInboundMessage` (C); transportes que implementan `ConversationTransport.send` (Meta Cloud API para los tres canales, con ventana de 24 h: fuera de ventana solo plantilla aprobada; Telegram reutilizando `chat_channels` existentes; Twilio SMS); estados de entrega desde los callbacks de estado del proveedor. Página de ajustes para dar de alta cuenta, secretos (vía `company_secrets`) y ver estado. Tests con firmas válidas e inválidas y ventana de 24 h.

## F. Chat web

Archivos: `server/src/services/conversations/transports/webchat.ts`, `server/src/routes/public/chat.ts`, `server/src/public/widget.js` (servido en `GET /p/:companySlug/widget.js`), `ui/src/pages/WebchatSettings.tsx`, `ui/src/api/webchat.ts`.

Entrega: sesión anónima con token, identificación opcional (correo o teléfono) que crea lead vía intake y contacto vía identidad; mensajes entrantes por `recordInboundMessage` con `channel='webchat'`; respuesta del agente asignado por `messageService.send` (gate `message`); escalado a persona con `webchat_handoff`; widget embebible de un `<script>` con marca de empresa (logotipo y color desde ajustes de empresa), sin dependencias externas. Tests de sesión y rate limit.
