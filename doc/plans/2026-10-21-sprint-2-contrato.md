# Sprint 2: contrato compartido

Fecha: 2026-10-21
Rama: `sprint-2` (worktree `paperclip-s2`). Plan: [plan maestro](2026-10-21-plan-maestro-producto.md), sección Sprint 2.
Estado: contrato que todas las pistas del S2 consumen. Cambiarlo requiere avisar a las demás pistas.

## Reglas para todas las pistas

1. Trabaja solo en `paperclip-s2`. Nunca en `paperclip` (ahí corre el S1).
2. **No hagas `git commit`.** El responsable de integración commitea por pista.
3. **Archivos de un solo propietario**, ya preparados por el contrato; no los edites: `packages/db/src/schema/index.ts`, `packages/db/src/migrations/*`, `packages/shared/src/index.ts`, `server/src/app.ts`, `server/src/services/index.ts`, `server/src/routes/index.ts`, `ui/src/App.tsx`, `ui/src/components/Sidebar.tsx`, `ui/src/lib/queryKeys.ts`. Si necesitas algo en ellos, escríbelo en `doc/plans/2026-10-21-sprint-2-integracion.md` bajo tu pista y sigue.
4. Si necesitas una columna nueva en una tabla del contrato, añádela en el archivo de esquema de tu pista como migración aditiva (nullable) y anótalo en el documento de integración. No renombres ni borres nada del contrato.
5. Patrones obligatorios: rutas como `server/src/routes/goals.ts` (`assertCompanyAccess`, `getAccessibleResource`, `validate`, `logActivity`), servicios como `server/src/services/goals.ts`, herramientas de agente como `server/src/services/project-tools.ts`, páginas como `ui/src/pages/Goals.tsx` (`useCompany`, `useBreadcrumbs`, `useQuery`, `PageSkeleton`, `EmptyState`), textos con `useTranslation` y claves en `ui/src/i18n/locales`.
6. UI solo con tokens de `ui/src/index.css` y componentes de `ui/src/components/ui`. `pnpm check:token-gates` antes de terminar.
7. Tests con Vitest junto al código; ejecuta solo los tuyos (`pnpm --filter <paquete> test -- <ruta>`), y al final `pnpm -r typecheck`.
8. Toda acción externa (correo, mensaje, reserva, publicación, enlace) pasa por `gateExternalAction` de `server/src/services/external-action-gate.ts`. Sin excepciones por canal.

## Tablas (packages/db/src/schema)

Todas con `id uuid pk defaultRandom`, `company_id uuid not null references companies (cascade)`, `created_at`, `updated_at` con timezone y defaultNow, índice `(company_id, updated_at)`.

| Archivo | Tabla | Columnas específicas |
| --- | --- | --- |
| `customers.ts` | `customers` | `kind text` (`person`/`organization`), `name text not null`, `domain text`, `tags jsonb string[] default []`, `owner_user_id text`, `owner_agent_id uuid → agents (set null)`, `status text default 'active'` (`active`/`archived`), `health text` (`good`/`watch`/`risk`/null), `notes text`, `archived_at`. Índices: `(company_id, status)`, `(company_id, domain)`, trigram en `name` si `pg_trgm` ya se usa en el repo. |
| `contacts.ts` | `contacts` | `first_name text`, `last_name text`, `display_name text not null`, `primary_email text`, `primary_phone text`, `title text`, `language text` (ISO 639-1), `preferred_channel text`, `consents jsonb` `{ email?: boolean, whatsapp?: boolean, sms?: boolean, updatedAt?: string }` default `{}`, `status text default 'active'`, `archived_at`. Índices: `(company_id, primary_email)`, `(company_id, primary_phone)`. |
| `contacts.ts` | `customer_contacts` | `customer_id → customers (cascade)`, `contact_id → contacts (cascade)`, `role text`, `is_primary boolean default false`. Único `(customer_id, contact_id)`. |
| `contacts.ts` | `contact_identities` | `contact_id → contacts (cascade)`, `channel text` (`email`/`phone`/`whatsapp`/`messenger`/`instagram`/`telegram`/`webchat`), `identifier text not null` (normalizado: minúsculas, E.164 para teléfonos), `verified boolean default false`, `source text`. Único `(company_id, channel, identifier)`. |
| `leads.ts` | `leads` | `source text not null` (`form`/`csv`/`email`/`whatsapp`/`messenger`/`instagram`/`telegram`/`webchat`/`voice`/`manual`/`api`), `source_ref text` (identificador de origen), `payload jsonb` default `{}`, `status text default 'new'` (`new`/`triaged`/`qualified`/`converted`/`discarded`), `priority text` (`low`/`normal`/`high`), `language text`, `contact_id → contacts (set null)`, `customer_id → customers (set null)`, `opportunity_id uuid` (sin FK para evitar ciclo; se valida en servicio), `conversation_id uuid`, `assigned_user_id text`, `assigned_agent_id uuid → agents (set null)`, `discard_reason text`, `converted_at`. Único `(company_id, source, source_ref)` cuando `source_ref` no es nulo (índice único parcial). |
| `opportunities.ts` | `opportunities` | `customer_id → customers (cascade)`, `primary_contact_id → contacts (set null)`, `title text not null`, `pipeline_id uuid → pipelines (set null)`, `stage_id uuid → pipeline_stages (set null)`, `stage_key text` (copia para lectura), `amount_cents integer`, `currency text` (ISO 4217), `probability integer` (0-100), `expected_close_at timestamptz`, `next_action text`, `next_action_at timestamptz`, `owner_user_id text`, `owner_agent_id uuid → agents (set null)`, `source text`, `status text default 'open'` (`open`/`won`/`lost`), `lost_reason text`, `closed_at`, `version integer not null default 1`. Índices: `(company_id, status)`, `(company_id, customer_id)`, `(company_id, next_action_at)`. |
| `crm_activities.ts` | `crm_activities` | `subject_kind text not null` (`customer`/`contact`/`lead`/`opportunity`/`conversation`/`commitment`), `subject_id uuid not null`, `kind text not null` (`note`/`call`/`email`/`message`/`meeting`/`stage_change`/`status_change`/`task`/`system`), `actor_user_id text`, `actor_agent_id uuid → agents (set null)`, `summary text not null`, `payload jsonb`, `external_ref text`, `occurred_at timestamptz default now`. Índice `(company_id, subject_kind, subject_id, occurred_at)`. |
| `commitments.ts` | `commitments` | `who text not null` (`us`/`them`), `what text not null`, `due_at timestamptz`, `status text default 'open'` (`proposed`/`open`/`kept`/`missed`/`cancelled`), `source text default 'manual'` (`manual`/`detected`), `customer_id → customers (set null)`, `contact_id → contacts (set null)`, `opportunity_id → opportunities (set null)`, `conversation_id uuid`, `evidence jsonb`, `resolved_at`. Índice `(company_id, status, due_at)`. |
| `conversations.ts` | `conversations` | `channel text not null` (`email`/`whatsapp`/`messenger`/`instagram`/`telegram`/`webchat`/`voice`/`sms`), `contact_id → contacts (set null)`, `customer_id → customers (set null)`, `opportunity_id → opportunities (set null)`, `lead_id → leads (set null)`, `external_thread_id text`, `subject text`, `status text default 'open'` (`open`/`waiting_us`/`waiting_them`/`closed`), `priority text default 'normal'`, `sla_due_at timestamptz`, `assigned_user_id text`, `assigned_agent_id uuid → agents (set null)`, `last_message_at timestamptz`, `last_inbound_at timestamptz`, `last_outbound_at timestamptz`, `language text`. Único `(company_id, channel, external_thread_id)` parcial. Índices `(company_id, status, last_message_at)`, `(company_id, contact_id)`. |
| `conversations.ts` | `conversation_messages` | `conversation_id → conversations (cascade)`, `direction text not null` (`inbound`/`outbound`), `actor_kind text not null` (`contact`/`user`/`agent`/`system`), `actor_user_id text`, `actor_agent_id uuid → agents (set null)`, `body text not null`, `attachments jsonb` default `[]`, `language text`, `delivery_status text default 'draft'` (`draft`/`queued`/`sent`/`delivered`/`read`/`failed`/`uncertain`), `provider text`, `provider_message_id text`, `provider_receipt jsonb`, `external_action_id uuid`, `sent_at timestamptz`. Único `(company_id, provider, provider_message_id)` parcial. Índice `(conversation_id, created_at)`. |
| `autonomy.ts` | `autonomy_policies` | `agent_id uuid → agents (cascade)` nullable (nulo = política de empresa), `action_type text not null` (`email`/`message`/`booking`/`stage_change`/`proposal`/`publish`/`call`/`review_link`), `level text not null` (`draft_only`/`send_with_approval`/`send_direct`), `granted_by_user_id text`, `reason text`, `revoked_at timestamptz`. Índice `(company_id, agent_id, action_type, revoked_at)`. |
| `autonomy.ts` | `external_actions` | `action_type text not null`, `actor_agent_id uuid → agents (set null)`, `actor_user_id text`, `subject_kind text`, `subject_id uuid`, `level_applied text not null`, `mode text not null` (`draft`/`approval`/`direct`), `approval_id uuid`, `decision_id uuid`, `payload_hash text`, `idempotency_key text`, `status text default 'pending'` (`pending`/`approved`/`rejected`/`executed`/`failed`/`uncertain`), `result jsonb`, `executed_at timestamptz`. Único `(company_id, idempotency_key)` parcial. |

Etapas de oportunidad: pipeline `sales` por defecto en `pipelines` existente (`key='sales'`, etapas `new`, `qualified`, `proposal`, `negotiation`, `won`, `lost`). Se crea perezosamente por `ensureSalesPipeline(companyId)` en el servicio de oportunidades. Las oportunidades no usan `cases`.

## Shared (packages/shared/src)

- `constants/crm.ts`: todos los enums anteriores como arrays `as const` (`CUSTOMER_KINDS`, `LEAD_SOURCES`, `LEAD_STATUSES`, `CONVERSATION_CHANNELS`, `CONVERSATION_STATUSES`, `DELIVERY_STATUSES`, `AUTONOMY_LEVELS`, `EXTERNAL_ACTION_TYPES`, `COMMITMENT_STATUSES`, `CRM_ACTIVITY_KINDS`, `SALES_STAGE_KEYS`).
- `types/crm.ts`: interfaces `Customer`, `Contact`, `CustomerContact`, `ContactIdentity`, `Lead`, `Opportunity`, `CrmActivity`, `Commitment`, `Conversation`, `ConversationMessage`, `AutonomyPolicy`, `ExternalAction`, con los campos en camelCase y fechas como `string`.
- `validators/crm.ts`: `createCustomerSchema`, `updateCustomerSchema`, `createContactSchema`, `updateContactSchema`, `createLeadSchema`, `updateLeadSchema`, `convertLeadSchema` (`{ customerId?, contactId?, createOpportunity?: boolean, opportunityTitle?, idempotencyKey }`), `createOpportunitySchema`, `updateOpportunitySchema` (incluye `expectedVersion`), `changeOpportunityStageSchema` (`{ stageKey, expectedVersion, reason? }`), `createCrmActivitySchema`, `createCommitmentSchema`, `resolveCommitmentSchema`, `createConversationSchema`, `createConversationMessageSchema` (`{ body, attachments?, idempotencyKey }`), `setConversationStateSchema`, `upsertAutonomyPolicySchema`, `crmListQuerySchema` (`{ q?, status?, cursor?, limit (1-100, default 25) }`). Todos con `idempotencyKey` opcional donde se crea algo.
- `crm-tools.ts`: `export const CRM_TOOL_NAMES = [...]` con la lista cerrada de herramientas de agente del S2 y sus descripciones de una línea:
  `crm_search`, `crm_get_customer`, `crm_create_customer`, `crm_create_contact`, `crm_create_opportunity`, `crm_update_opportunity_stage`, `crm_set_next_action`, `crm_log_activity`, `lead_convert`, `lead_get`, `lead_list`, `lead_triage`, `commitment_create`, `commitment_resolve`, `conversation_list`, `conversation_get`, `message_draft`, `message_send`, `message_reply`, `conversation_set_state`, `calendar_availability`, `calendar_book`, `calendar_reschedule`, `calendar_cancel`, `review_link_create`, `review_status_get`, `customer_memory_get`, `customer_memory_append`, `webchat_handoff`, `crm_sync_status`.
- Exportar todo desde `packages/shared/src/index.ts`.

## Server

### Gate de acciones externas (implementado por el contrato)

`server/src/services/external-action-gate.ts`:

```ts
resolveAutonomyLevel(db, { companyId, agentId?, actionType }) → AutonomyLevel
  // política de agente vigente > política de empresa vigente > 'draft_only'; vigente = revoked_at null
gateExternalAction(db, {
  companyId, actionType, actor: { userId? , agentId? }, subjectKind?, subjectId?,
  payload, idempotencyKey, execute: () => Promise<ExternalActionResult>
}) → { action: ExternalAction, mode: 'draft'|'approval'|'direct', result? }
  // usuario board → direct. Agente: según nivel. draft → guarda external_action status 'pending', no ejecuta.
  // approval → crea approval con el mecanismo existente (approvals) y status 'pending'; approveExternalAction(id) ejecuta.
  // direct → ejecuta, guarda result y status 'executed' | 'failed' | 'uncertain'.
  // idempotencyKey repetida → devuelve la acción existente sin ejecutar otra vez.
approveExternalAction(db, { actionId, approverUserId }) / rejectExternalAction(...)
```

Activity log en cada transición. Tests en `external-action-gate.test.ts`.

### Rutas y servicios (preparados como stubs por el contrato; cada pista los rellena)

| Pista | Rutas (archivo) | Servicio (archivo) | Páginas UI | Cliente API |
| --- | --- | --- | --- | --- |
| A CRM | `routes/crm.ts` → `/companies/:companyId/customers`, `/customers/:id`, `/companies/:companyId/contacts`, `/contacts/:id`, `/companies/:companyId/opportunities`, `/opportunities/:id`, `/opportunities/:id/stage`, `/companies/:companyId/crm/activities`, `/companies/:companyId/commitments`, `/commitments/:id/resolve`, `/companies/:companyId/crm/duplicates` | `services/crm/customers.ts`, `contacts.ts`, `opportunities.ts`, `activities.ts`, `commitments.ts`, `identity.ts` (normalización y resolución), `crm-tools.ts` | `pages/crm/Customers.tsx`, `CustomerDetail.tsx`, `Contacts.tsx`, `Opportunities.tsx` | `api/crm.ts` |
| B Leads | `routes/leads.ts` → `/companies/:companyId/leads`, `/leads/:id`, `/leads/:id/convert`, `/leads/:id/discard`, `/companies/:companyId/leads/import` (CSV), público `POST /p/:companySlug/form/:formSlug` | `services/leads/leads.ts`, `intake.ts` (normaliza entradas de cualquier canal), `csv-import.ts`, `lead-tools.ts` | `pages/crm/Leads.tsx`, `LeadDetail.tsx` | `api/leads.ts` |
| C Bandeja | `routes/conversations.ts` → `/companies/:companyId/conversations`, `/conversations/:id`, `/conversations/:id/messages`, `/conversations/:id/state`, `/conversations/:id/assign` | `services/conversations/conversations.ts`, `messages.ts`, `transports/email.ts` (proyección de `emailMessages`), `message-tools.ts` | `pages/Inbox.tsx`, `pages/ConversationDetail.tsx` | `api/conversations.ts` |
| D/E Canales | `routes/channels-inbound.ts` → webhooks firmados `POST /webhooks/meta/:companyId`, `POST /webhooks/twilio/:companyId` | `services/conversations/transports/meta.ts`, `telegram.ts`, `twilio.ts` | ajustes en `pages/ChannelsSettings.tsx` | `api/channels.ts` |
| F Chat web | público `POST /p/:companySlug/chat`, `GET /p/:companySlug/chat/:sessionId/messages`, `GET /p/:companySlug/widget.js` | `services/conversations/transports/webchat.ts` | — | — |
| H Agenda | `routes/calendar.ts` → `/companies/:companyId/calendar/availability`, `/companies/:companyId/calendar/events`, `/calendar/events/:id`, público `GET/POST /p/:companySlug/book/:slug` | `services/calendar/google-calendar.ts`, `booking.ts`, `calendar-tools.ts` | `pages/Schedule.tsx` | `api/calendar.ts` |
| I Revisión externa | público `GET/POST /p/:companySlug/review/:token` | `services/public-surface/review-links.ts` | — | — |
| K Memoria por cliente | `/customers/:id/memory` | `services/crm/memory.ts` | pestaña en `CustomerDetail.tsx` | en `api/crm.ts` |
| L Sync externo | `/companies/:companyId/crm/sync` | `services/crm/sync/hubspot.ts`, `pipedrive.ts` | sección en `Customers.tsx` | en `api/crm.ts` |
| M Equipos | — | — | — | `packages/teams-catalog/catalog/optional/...` |

Superficie pública: `server/src/routes/public-surface.ts` monta `/p/:companySlug` sin sesión de empresa; resuelve `companySlug` a empresa (campo `slug` de `companies` si existe; si no, `id`). Tokens firmados con `PAPERCLIP_PUBLIC_TOKEN_SECRET` (HMAC, caducidad). Rate limit básico por IP. Las pistas añaden sus subrutas en sus propios archivos y las exportan como `registerPublicXRoutes(router, db)`; el contrato las llama.

## UI

- Grupo "Negocio" en `Sidebar.tsx` con `/customers`, `/contacts`, `/leads`, `/opportunities`, `/inbox`, `/schedule`. Claves i18n `nav.customers`, etc., en `ui/src/i18n/locales/*`.
- Rutas en `App.tsx`: `customers`, `customers/:customerId`, `contacts`, `leads`, `leads/:leadId`, `opportunities`, `inbox`, `inbox/:conversationId`, `schedule`.
- `queryKeys.ts`: `customers`, `contacts`, `leads`, `opportunities`, `conversations`, `commitments`, `calendar`.

## Migración

Una sola migración del contrato generada con `pnpm db:generate`. Si choca en número con una migración del S1 al integrar, el responsable de integración la renumera.
