# Sprint 1: encargo de programación

Fecha: 2026-10-21
Destinatario: agente de programación (Codex) trabajando en este repositorio
Plan de referencia: [plan maestro](2026-10-21-plan-maestro-producto.md), sección Sprint 1 y línea transversal Estudio de medios
Alcance: solo código, migraciones, catálogos y tests. Nada de pilotos, clientes ni documentación de producto.

## Antes de tocar nada

1. Lee en este orden: `AGENTS.md`, `doc/GOAL.md`, `doc/PRODUCT.md`, `doc/SPEC-implementation.md`, `doc/DEVELOPING.md`, `doc/DATABASE.md`, `DESIGN.md`.
2. Lee las reglas de `rules/*.mdc` cuyo `globs` coincida con los archivos que vayas a tocar. Para heartbeat lee `rules/heartbeat-execution-boundaries.mdc` aunque solo vayas a leer esos archivos.
3. Cambios de esquema: edita `packages/db/src/schema/*.ts`, exporta en `packages/db/src/schema/index.ts`, ejecuta `pnpm db:generate`, no edites migraciones a mano, numera en orden.
4. Cada cambio de contrato se sincroniza en el mismo PR: `packages/db` → `packages/shared` (tipos, validators zod, constantes) → `server` (rutas y servicios) → `ui` (cliente API y páginas).
5. Toda ruta nueva: `assertCompanyAccess` o `getAccessibleResource` de `server/src/routes/authz.ts`, `validate(schema)` de `server/src/middleware/validate.js`, `logActivity` de `server/src/services/activity-log.ts` en cada mutación, errores `400/401/403/404/409/422/500`. Copia el patrón de `server/src/routes/goals.ts`.
6. UI: solo tokens de `ui/src/index.css`, componentes compartidos existentes, pie de formularios con Cancelar a la izquierda y acción principal a la derecha. `pnpm check:token-gates` antes de cada PR. Textos vía `useTranslation`.
7. Verificación estrecha mientras trabajas; antes de cada PR: `pnpm -r typecheck`, `pnpm test:run`, `pnpm build`, `pnpm check:token-gates`. Si algo no se puede ejecutar, dilo en el PR.
8. Un PR por paquete de trabajo, con el [template de PR](../../.github/PULL_REQUEST_TEMPLATE.md) completo, incluido "Model Used".
9. Las herramientas de agente se exponen por el camino existente: definiciones estilo `server/src/services/project-tools.ts` (definición + `call*Tool` que llama a la API autenticada), y el catálogo `CAPABILITY_SEMANTIC_TOOL_CATALOG` en `server/src/vendor/paperclip-runner/index.ts`. Mira `server/src/services/native-runtime/assigned-mcp-tools.ts` para cómo llegan al runtime. No crees un segundo mecanismo.
10. No actives ni dependas de flags experimentales nuevos. Nada de telemetría nueva (`packages/shared/src/telemetry/`).

## Objetivo del sprint

Que un usuario pueda **crear un encargo con criterio de aceptación y presupuesto, que un equipo de agentes lo ejecute usando el contexto del negocio y un estudio de vídeo propio, publique el resultado, y el usuario lo acepte o lo devuelva** viendo en Inicio qué se está haciendo, qué necesita de él y cuánto ha costado.

Siete paquetes de trabajo. WP1 a WP6 van en orden de dependencia; WP7 (estudio de medios) es independiente y puede empezar el primer día en paralelo.

---

## WP1: Encargos

Un encargo es un objetivo con criterio de aceptación, entregable esperado y presupuesto, que al crearse deja una tarea raíz en marcha.

### db

- `goals`: añadir columnas nullable `kind text default 'goal'` (`'goal' | 'assignment'`), `acceptance_criteria text`, `expected_deliverable text`, `budget_cents integer`, `project_id uuid references projects` (set null), `assignee_agent_id uuid references agents` (set null), `root_issue_id uuid references issues` (set null). Índice `(company_id, kind, status)`.
- Verifica si `issues` ya tiene `goal_id`; si no, añádelo (set null) con índice. Verifica también `project_goals` y respétalo.

### shared

- Tipos `Goal` ampliados; `createAssignmentSchema` (título, descripción, acceptanceCriteria obligatorio, expectedDeliverable, budgetCents ≥ 0, projectId opcional, assigneeAgentId obligatorio, idempotencyKey obligatorio), `updateAssignmentSchema`.
- Estado derivado `AssignmentStatus`: `planned | in_progress | awaiting_review | changes_requested | accepted | cancelled`, calculado en servidor a partir del goal, la tarea raíz y las revisiones (WP2).

### server

- `assignmentService(db)`: `create` en transacción: inserta goal `kind='assignment'`, crea issue raíz vía `issueService` (reutiliza `issue_create_idempotency_keys`), enlaza `root_issue_id`, aplica presupuesto con el mecanismo vigente de `budget_policies` si existe por objetivo, si no, guarda `budget_cents` y expónlo (no inventes un enforcement nuevo). `list(companyId, {status, cursor, limit})`, `getById`, `update`, `cancel`.
- Rutas: `GET/POST /companies/:companyId/assignments`, `GET/PATCH /assignments/:id`, `POST /assignments/:id/cancel`. Activity log `assignment.created|updated|cancelled`.
- Herramienta de agente `get_assignment` (devuelve criterio, entregable esperado, presupuesto restante, contexto enlazado). Añade al catálogo y a `project-tools` o a un `assignment-tools.ts` con el mismo patrón.

### ui

- `ui/src/api/assignments.ts`.
- Página `/assignments` (lista con estado, responsable, coste, acción "Nuevo encargo") y `/assignments/:id` (criterio, entregable esperado, presupuesto y gasto, tarea raíz y subtareas, entregables con su estado de revisión, contexto usado). Alta en diálogo con el pie de formulario estándar.
- Entrada en `Sidebar.tsx` bajo Trabajo. Ruta en `App.tsx`.

### Tests

- Servicio: creación idempotente, company scoping (crear con `assigneeAgentId` de otra empresa → 403/404), estado derivado.
- Ruta: validación 422, actor agente no puede crear encargo si no tiene permiso de board.

---

## WP2: Revisión y aceptación de entregables

Aceptar o devolver un entregable es un acto propio, con actor, motivo y versión.

### db

- Tabla `deliverable_reviews`: `id`, `company_id`, `goal_id` (nullable), `issue_id` (nullable), `target_kind text` (`'work_product' | 'company_file_version' | 'document_revision'`), `target_id uuid`, `target_version text` (número de versión o revisión), `state text` (`'pending' | 'accepted' | 'changes_requested'`), `reviewer_user_id text`, `reviewer_agent_id uuid` nullable, `reason text`, `evidence jsonb`, `reviewed_at`, `created_at`, `updated_at`. Índices `(company_id, target_kind, target_id)`, `(company_id, goal_id, state)`. Unicidad lógica: un `pending` por target+version.

### shared

- Tipos y `createDeliverableReviewSchema`, `resolveDeliverableReviewSchema` (`state` ∈ accepted|changes_requested, `reason` obligatorio en changes_requested).

### server

- `deliverableReviewService`: `submit` (crea pending; idempotente por target+version), `resolve` (solo usuario board o permiso explícito; un agente no acepta), `listByGoal`, `listByIssue`, `listPendingForCompany`.
- Efecto de `changes_requested`: comentario en la issue con el motivo (reutiliza `issue_comments`) y, si la issue estaba `done`/`in_review`, vuelve a `todo` con el mecanismo existente de transición; nunca saltes el checkout.
- Efecto de `accepted`: marca `issue_work_products.review_state` del target si aplica (comprueba los valores admitidos en shared antes de escribir).
- Rutas: `POST /companies/:companyId/deliverable-reviews` (submit), `POST /deliverable-reviews/:id/resolve`, `GET /goals/:id/deliverable-reviews`, `GET /issues/:id/deliverable-reviews`, `GET /companies/:companyId/deliverable-reviews?state=pending`. Activity log `deliverable.submitted|accepted|changes_requested`.
- Herramienta de agente `submit_deliverable_for_review` (target_kind, target_id, version, summary). Un agente no puede llamar a resolve.

### ui

- En `ui/src/pages/artifacts/ArtifactsExplorer.tsx` y en el detalle de tarea (sección de productos de trabajo): badge de estado y botones **Aceptar** / **Pedir cambios** (diálogo con motivo obligatorio). Estados: cargando, sin permiso, conflicto si ya resuelto.
- En `/assignments/:id`: lista de entregables con estado y acceso directo.

### Tests

- Doble submit no duplica. Resolve por agente → 403. Changes_requested reabre la tarea y deja comentario. Accept no toca otras versiones.

---

## WP3: Contexto del negocio

Vista de archivos de empresa organizada como contexto, con audiencia y vigencia, y herramientas de agente que solo devuelven lo que corresponde.

### db

- `company_files`: añadir `audience_kind text default 'company'` (`'company' | 'project'`; deja el enum abierto a `'customer'` sin crearlo aún), `audience_id uuid` nullable, `valid_until timestamptz` nullable, `context_role text` nullable (`'offer' | 'brand' | 'procedure' | 'customer' | 'other'`). Índice `(company_id, audience_kind, audience_id)`.
- `folders`: usa `system_key` para crear al vuelo las carpetas `context.offer`, `context.brand`, `context.procedures`, `context.customers` si no existen (servicio, no migración de datos).

### shared

- Ampliar tipos de `CompanyFile`, `updateCompanyFileSchema` con audiencia, vigencia y rol. Schemas de `contextSearchSchema` (query, roles[], limit) y `contextGetSchema` (fileId).

### server

- `contextService`: `ensureSystemFolders(companyId)`, `search(companyId, {query, roles, projectId, limit})` que filtra por audiencia (`company` + `project = projectId de la issue`) y vigencia, y `get(fileId, scope)` que registra lectura en `company_file_reads`. Reutiliza búsqueda trigram existente si la hay para files; si no, `ILIKE` sobre nombre y, para texto/markdown, sobre contenido de la versión actual.
- Rutas: `GET /companies/:companyId/context` (árbol por rol con contadores), `PATCH /company-files/:id` ya existe: extiéndelo con los campos nuevos y valida que `audience_id` pertenece a la empresa.
- Herramientas de agente `context_search` y `context_get`. El scope (companyId, projectId de la issue) lo pone el servidor desde la ejecución, nunca lo elige el agente.

### ui

- Página `/context`: cuatro secciones (Oferta, Marca, Procedimientos, Clientes) sobre `ArtifactsExplorer` o un componente compartido; subir archivo con rol, audiencia y vigencia; aviso de caducado. Enlace desde `/assignments/:id` al contexto usado (lecturas registradas por la tarea raíz y descendientes).
- Sidebar y App.tsx.

### Tests

- Un agente en proyecto A no recibe archivos con audiencia proyecto B. Archivo caducado no aparece en `context_search` salvo flag `includeExpired`. Lectura queda registrada.

---

## WP4: Costes por encargo

### server

- `cost_events` ya tiene `goal_id`. Asegura que las ejecuciones de la tarea raíz y descendientes de un encargo escriben `goal_id` (busca dónde se construye el cost event en heartbeat y propaga el goal de la issue; respeta `rules/heartbeat-execution-boundaries.mdc`).
- Rutas: `GET /companies/:companyId/costs/by-goal` y `GET /goals/:id/cost-summary` (total, por agente, por proveedor, por entregable si el evento tiene issue con work product, y **no atribuido** explícito). Añade proveedores de medios de WP7 (`usage_kind='media'`).

### ui

- En `/assignments/:id`: gasto frente a presupuesto, desglose, no atribuido. En `/costs`: pestaña o sección "Por encargo".

### Tests

- Suma correcta con eventos de subtareas; evento sin goal cuenta como no atribuido; otra empresa no aparece.

---

## WP5: Inicio orientado a resultado

### server

- Ampliar `GET /companies/:companyId/dashboard` (`server/src/routes/dashboard.ts`) con: `activeAssignments` (hasta 10: título, estado, responsable, gasto/presupuesto, último evento), `needsYou` (aprobaciones pendientes, decisiones pendientes, `deliverable_reviews` pending, cada uno con enlace de acción), `costsToday` y `costsThisWeek` con cobertura. Reutiliza los servicios existentes; una sección que falle devuelve `error` en esa clave sin tumbar la respuesta.

### ui

- `Dashboard.tsx`: bloque superior con cuatro tarjetas: Qué se está haciendo, Necesita tu decisión, Entregables para revisar, Coste. Cada elemento enlaza a su acción. Carga parcial por sección. Conserva el resto del dashboard y `/dashboard/live` intacto.

### Tests

- Render con una sección en error. Enlaces correctos. Sin datos → estado vacío con acción "Crear encargo".

---

## WP6: Equipo y skills "Contenido y vídeo"

### teams-catalog

- `packages/teams-catalog/catalog/optional/content/content-and-video/` siguiendo `content-machine`: `TEAM.md`, agentes `content-strategist`, `video-editor`, `copywriter`, `reviewer` con `AGENTS.md` (role, reportsTo, skills), un proyecto `content-production` con una tarea plantilla `produce-video-series`.
- El `video-editor` declara las herramientas de WP7 y `context_search`/`context_get`; el `reviewer` declara `submit_deliverable_for_review`.

### skills-catalog

- `packages/skills-catalog/catalog/optional/content/`: `short-video-script`, `transcript-based-editing` (cómo usar silencios, muletillas, cortes y exportación con el estudio), `burned-subtitles-style`, `social-post-copy`. Frontmatter como `release-announcement/SKILL.md`.
- Regenera los catálogos con los scripts del paquete y pasa sus tests.

---

## WP7: Estudio de medios, versión 1

Editor sin línea de tiempo para agentes: el agente decide operaciones sobre la transcripción; un servicio aplica con ffmpeg. Independiente del resto; empieza en paralelo.

### Paquete

- `packages/media-studio/`: TypeScript, sin dependencias de `server`. Expone `MediaStudio` con operaciones puras sobre un `MediaProject` y un `Renderer` que ejecuta ffmpeg (`ffmpeg-static` o binario del sistema por env `FFMPEG_PATH`; falla claro si no está). Tests con un vídeo de fixture corto generado por ffmpeg en el propio test.

### db

- `media_projects`: `id`, `company_id`, `goal_id` nullable, `issue_id` nullable, `source_asset_id` → `assets`, `transcript_document_id` → `documents` nullable, `operations jsonb` (lista ordenada), `status`, `created_by_agent_id`, `created_by_user_id`, timestamps.
- `media_jobs`: `id`, `company_id`, `project_id` → `media_projects`, `kind text` (`transcribe | render | dub`), `idempotency_key text`, `input jsonb`, `output_asset_id` nullable, `status text` (`queued | running | done | failed`), `error text`, `cost_cents numeric`, `provider text`, `started_at`, `finished_at`, timestamps. Único `(company_id, idempotency_key)`.

### Operaciones (datos, nunca comandos)

```
{ type: "cut_ranges", ranges: [{start, end}] }                 // elimina rangos
{ type: "remove_silences", thresholdDb: -35, minDurationMs: 800 }
{ type: "remove_fillers", words: ["eh","este","o sea"] }      // por transcripción
{ type: "burn_subtitles", style: { font, size, color, highlightColor, position } }
{ type: "export", aspect: "9:16" | "16:9", cropMode: "center" }
{ type: "replace_audio", assetId }                             // para doblaje
```

### Servicios en server

- `mediaStudioService`: `createProject(companyId, assetId, {goalId, issueId})`, `transcribe(projectId)` → job con proveedor Whisper por API (clave en secretos de empresa, `company_secrets`; si falta, error accionable), guarda transcripción con marcas por palabra como `document` (formato `json`) y la enlaza; `detectSilences(projectId, params)` (ffmpeg `silencedetect`), `detectFillers(projectId, words)` (sobre transcripción), `applyOperations(projectId, ops)` (valida y añade), `render(projectId, exportOp)` → job que produce asset y `issue_work_products` de tipo `media` con `is_primary` según pida el agente; `dub(projectId, {language, voiceId, translatedSegments})` → job que llama a ElevenLabs (TTS por segmento, concatena, reemplaza pista) y produce un nuevo asset. La traducción la aporta el agente en `translatedSegments`; el servicio no traduce.
- Cola: reutiliza el mecanismo de trabajos existente si hay uno genérico; si no, un worker en proceso con concurrencia 1 por empresa y recuperación de `running` huérfanos al arrancar.
- Costes: cada job con proveedor escribe `cost_events` con `usage_kind='media'`, `provider` (`openai_whisper`, `elevenlabs`), `goal_id` e `issue_id` del proyecto, `idempotency_key` del job.
- Rutas: `POST /companies/:companyId/media-projects`, `GET /media-projects/:id`, `POST /media-projects/:id/transcribe`, `POST /media-projects/:id/detect-silences`, `POST /media-projects/:id/detect-fillers`, `POST /media-projects/:id/operations`, `POST /media-projects/:id/render`, `POST /media-projects/:id/dub`, `GET /media-jobs/:id`. Activity log en cada mutación. Company scoping en asset y proyecto.

### Herramientas de agente

`media_ingest` (desde asset o archivo de empresa), `media_transcribe`, `media_detect_silences`, `media_detect_fillers`, `media_cut`, `media_subtitle`, `media_export`, `media_dub`, `media_get_project`, `media_get_job`. Todas devuelven ids y estados; las que lanzan trabajos devuelven `jobId` y el agente consulta `media_get_job`. Entran por el catálogo y la política de acceso de herramientas.

### ui

- En `ArtifactsExplorer`: vista previa HTML5 de vídeo para work products y archivos de tipo vídeo, con pestañas Transcripción y Operaciones aplicadas cuando el asset proviene de un `media_project`.
- En `/assignments/:id`: estado de jobs en curso del encargo.

### Tests

- Paquete: `remove_silences` sobre fixture con silencio insertado reduce duración; `burn_subtitles` produce archivo válido; `export 9:16` da dimensiones correctas.
- Server: job idempotente; proveedor sin clave → 422 con mensaje; coste registrado con goal; proyecto de otra empresa → 404.

---

## Opcionales si queda tiempo, en este orden

1. **Plan antes de gastar**: al crear un encargo, la tarea raíz nace en modo planificación; el agente propone plan y estimación (reutiliza `issue_plan_decompositions`) y el usuario aprueba desde `/assignments/:id` antes de ejecutar.
2. **Mejores momentos**: `media_find_highlights` devuelve candidatos (rango, motivo, gancho) a partir de la transcripción; el render de clips con portada reutiliza `export` + fotograma.
3. **Vista previa de documentos**: markdown, HTML, imágenes y PDF en `ArtifactsExplorer`.
4. **Onboarding v1**: un paso "¿Qué quieres conseguir?" que crea el primer encargo e instala `content-and-video`.

## Fuera de este sprint

CRM, clientes, contactos, leads, oportunidades, correo, calendario, propuestas, portal, publicación en redes, stop motion, zoom, facturación. No crees tablas ni rutas para nada de esto.

## Orden sugerido y paralelismo

- Día 1: WP7 (paquete y esquema) y WP1 en paralelo.
- WP2 tras WP1. WP3 independiente de WP2. WP4 tras WP1. WP5 tras WP2 y WP4. WP6 tras tener los nombres de herramientas de WP3 y WP7 fijados.
- Un solo responsable toca `packages/db/src/schema/index.ts`, migraciones, `App.tsx` y `Sidebar.tsx`; el resto coordina con él.

## Definición de hecho del sprint

- Flujo completo demostrable en local con PGlite: crear encargo → equipo instalado → agente usa `context_search`, el estudio y `submit_deliverable_for_review` → usuario acepta desde Artefactos → `/assignments/:id` muestra aceptado y coste → Inicio lo refleja.
- `pnpm -r typecheck`, `pnpm test:run`, `pnpm build`, `pnpm check:token-gates` en verde.
- Mapas de `maps/` actualizados para las capacidades nuevas y `node scripts/check-maps.mjs` en verde.
- Un PR por WP con el template completo.
