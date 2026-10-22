# Sprint 3: guía para el agente que lo construye

Fecha: 2026-10-21
Destinatario: agente de programación que ejecuta el Sprint 3 mientras el Sprint 1 y el Sprint 2 siguen en curso o acaban de cerrar
Plan de referencia: [plan maestro](2026-10-21-plan-maestro-producto.md), sección "Sprint 3: Vende y entrega solo" y línea transversal Estudio de medios
Alcance: solo código, migraciones, catálogos y tests. Nada de pilotos ni documentación de producto.

## Situación que te vas a encontrar

Trabajas en paralelo con otros agentes. El S1 (encargos, revisiones, contexto, costes, Inicio, estudio v1) y el S2 (CRM, conversaciones, gate de autonomía, agenda, superficie pública, estudio v2) pueden estar a medias cuando empieces. Esta guía te dice qué construir, de qué dependes, qué no puedes tocar y cómo avanzar sin esperar.

Reglas de convivencia:

1. **Trabaja en tu propia rama y worktree** (`git worktree add ../paperclip-s3 -b sprint-3`). Nunca edites el árbol de trabajo donde corre el S1.
2. **Rebasa sobre la rama del S2 cada día.** Lo que el S2 haya cerrado es tu contrato; lo que aún no exista, lo preparas detrás de una interfaz y lo conectas cuando llegue.
3. **No modifiques tablas que posee otro sprint.** Si necesitas una columna en `leads`, `opportunities`, `conversations`, `commitments` o `goals`, crea una migración **aditiva** (columna nullable o tabla nueva con clave foránea) y nómbrala con prefijo `s3_` en el nombre de archivo que genera `pnpm db:generate` solo si el repositorio lo permite; en cualquier caso, nunca renombres ni borres columnas ajenas.
4. **Archivos de un solo propietario:** `packages/db/src/schema/index.ts`, migraciones, `ui/src/App.tsx`, `ui/src/components/Sidebar.tsx`, `packages/shared/src/index.ts`. Haz cambios mínimos y aditivos en ellos y resuelve conflictos al rebasar; no los reorganices.
5. **Nombres del contrato.** Usa exactamente los nombres de tablas, rutas y herramientas que fija el plan maestro para el S2 (`leads`, `opportunities`, `conversations`, `conversation_messages`, `commitments`, `contact_identities`, gate `external-action-gate`, niveles `draft_only | send_with_approval | send_direct`, herramientas `crm_*`, `message_*`, `calendar_*`). Si el S2 cambió un nombre, sigue el código, no la guía, y anótalo en tu PR.
6. Antes de tocar nada, lee `AGENTS.md`, `doc/SPEC-implementation.md`, `doc/DEVELOPING.md`, `doc/DATABASE.md`, `DESIGN.md` y las reglas de `rules/*.mdc` que coincidan con tus archivos. Para heartbeat lee `rules/heartbeat-execution-boundaries.mdc`.
7. Patrones obligatorios: rutas como `server/src/routes/goals.ts` (`assertCompanyAccess`, `validate`, `logActivity`), herramientas de agente como `server/src/services/project-tools.ts` y el catálogo `CAPABILITY_SEMANTIC_TOOL_CATALOG` en `server/src/vendor/paperclip-runner/index.ts`, UI con tokens de `ui/src/index.css` y `useTranslation`.
8. Un PR por paquete de trabajo con el template de `.github/PULL_REQUEST_TEMPLATE.md` completo. Antes de cada PR: `pnpm -r typecheck`, `pnpm test:run`, `pnpm build`, `pnpm check:token-gates`.

## Objetivo del sprint

Que los agentes lleven la relación completa con **autonomía ganada, no regalada**: cualifican, responden, hacen seguimiento, proponen, cobran la señal, cierran, transfieren a entrega, renuevan y avisan de riesgos; el negocio solo decide excepciones y puede ver por qué el agente hizo cada cosa.

## Mapa de dependencias

| Paquete | Depende del S1 | Depende del S2 | Puedes empezar sin esperar |
| --- | --- | --- | --- |
| WP1 Playbooks | — | `opportunities`, `conversations` (solo como sujeto) | Sí: motor y tablas propias sobre `routines` |
| WP2 Cualificación y enriquecimiento | contexto (`context_search`) | `leads`, `lead_convert` | Parcial: enriquecimiento y herramienta sin lead; conectar al final |
| WP3 Autonomía ganada | — | gate `external-action-gate` y sus registros | Parcial: tablas, pantalla y métricas; el enganche al gate al final |
| WP4 Banco de pruebas | — | `conversations`, `conversation_messages` | Parcial: motor de reproducción con fixtures; datos reales al final |
| WP5 Decisiones comerciales | Inicio ("Necesita tu decisión") | gate | Sí: sobre `decisions` existente |
| WP6 Seguimientos y secuencias | — | `opportunities`, `conversations`, `commitments`, `message_*` | Parcial: rutinas con origen nuevo; disparadores al final |
| WP7 Compromisos detectados | — | `commitments`, `conversations` | Parcial: extractor y herramienta; persistencia al final |
| WP8 Propuestas, firma y señal | revisiones (`deliverable_reviews`) | superficie pública `/p/`, `opportunities` | Parcial: tabla, servicio y render; enlace público al final |
| WP9 Transferencia venta → entrega | encargos (`assignments`), equipos | `opportunities`, `proposals` (WP8) | Parcial: servicio idempotente con interfaz |
| WP10 Recurrencia | encargos | `customers`, `proposals` | Parcial |
| WP11 Pipeline operativo y previsión | — | `/opportunities` del S2 | No: amplía la pantalla del S2; hazlo al final |
| WP12 "Por qué hizo esto" | — | — | Sí: sobre `heartbeat_run_events`, `activity_log`, `tool_action_deliveries` |
| WP13 Resumen diario | Inicio, costes | `message_send` | Parcial: generador; envío por canal al final |
| WP14 Estudio de medios v3 | estudio v1 (`packages/media-studio`) | estudio v2 | Parcial: stop motion y doblaje multivoz como operaciones nuevas |

Orden sugerido: WP12, WP1, WP4 (motor), WP8 (tabla y servicio), WP3 (tablas y pantalla), WP14, WP5; luego, cuando el S2 cierre, WP2, WP6, WP7, WP9, WP10, WP11, WP13 y los enganches pendientes.

---

## WP1: Playbooks

Secuencia versionada de pasos comerciales que se ejecuta sobre rutinas.

- **db:** `playbooks` (empresa, clave, nombre, versión, estado `draft/active/archived`, ámbito `lead_type | offering | customer_segment`, `steps jsonb`, creado por), `playbook_runs` (empresa, playbook y versión, sujeto polimórfico `lead | opportunity | conversation | customer`, paso actual, estado `running/waiting/paused/done/failed/cancelled`, siguiente acción en, última acción, clave de idempotencia). Índices por empresa+sujeto y por `next_action_at`.
- **shared:** tipo `PlaybookStep` = `{ key, kind: 'qualify'|'respond'|'follow_up'|'propose'|'book'|'close'|'handoff'|'wait', channel?, delayHours?, condition?, templateKey?, autonomy: 'draft_only'|'send_with_approval'|'send_direct', maxAttempts? }`. Validators con zod. Un paso `send_direct` en un playbook nunca sube la autonomía efectiva por encima de la concedida al agente (se aplica `min`).
- **server:** `playbookService` (`create`, `publishVersion`, `start(subject)`, `advance(runId)`, `pause`, `cancel`). `advance` crea la tarea o rutina del paso usando `routines` con `origin_kind='playbook'` y `origin_id=playbook_run_id`; no inventes un scheduler nuevo: usa `routine_triggers` para el `delayHours`.
- **catálogo:** dos playbooks de ejemplo en `packages/teams-catalog` (lead entrante B2B; renovación de servicio).
- **ui:** `/playbooks` (lista, estado, uso) y `/playbooks/:id` (editor por pasos: lista ordenada, formulario por paso, versión activa frente a borrador, publicar). Sin constructor visual de grafos.
- **tools:** `playbook_start`, `playbook_get_run`, `playbook_advance` (solo el paso actual; el agente no salta pasos).
- **tests:** publicar no altera runs en curso; `advance` idempotente; autonomía efectiva = `min(playbook, agente)`.

## WP2: Cualificación con criterios y enriquecimiento

- **db:** `lead_qualifications` (empresa, lead, versión de criterios, puntuación 0-100, motivos `jsonb`, fuentes `jsonb`, agente, run, creado). Columna aditiva `leads.qualification_id` nullable.
- **server:** criterios de cualificación como documento de contexto con rol `procedure` y clave `qualification-criteria` (S1 WP3). `leadQualificationService.qualify(leadId)` lee criterios, enriquecimiento y conversación y guarda resultado. Enriquecimiento con los conectores existentes de Exa, Firecrawl y Tavily (`packages/shared/src/remote-mcp-connectors.ts` y rutas de conexión): `enrichmentService.enrich(domainOrEmail)` devuelve `{ company, size, sector, signals[], sources[], costCents }` y registra `cost_events` con `usage_kind='enrichment'`.
- **tools:** `lead_qualify`, `lead_enrich`. El agente aporta el razonamiento; el servicio guarda, puntúa contra criterios y registra fuentes.
- **ui:** en la ficha de lead del S2: bloque "Cualificación" con puntuación, motivos, fuentes y botón "Recualificar".
- **tests:** sin criterios → 422 accionable; coste registrado; lead de otra empresa → 404.

## WP3: Autonomía ganada

- **db:** `autonomy_policies` (empresa, agente nullable, tipo de acción `email|message|booking|stage_change|proposal|publish|call`, nivel, concedido por, concedido en, motivo, revocado en). `autonomy_shadow_stats` (empresa, agente, tipo de acción, periodo, borradores, enviados sin cambios, editados, rechazados). Histórico, nunca sobrescribir.
- **server:** `autonomyService.effectiveLevel(companyId, agentId, actionType)` que el gate del S2 consulta (si el S2 ya tiene su propia tabla de niveles, **no dupliques**: amplía la suya con `granted_by`, `reason`, `revoked_at` y pon aquí solo las estadísticas). `recordShadowOutcome(...)` llamado cuando una decisión aprueba, edita o rechaza un borrador. `proposeRaise()` evalúa umbrales (p. ej. 20 borradores, ≥ 90 % sin cambios en 14 días) y crea una decisión (WP5) "Subir autonomía de X para Y".
- **Revocación:** `revoke()` escribe `revoked_at` y cancela lo que esté en cola para ese agente y tipo (`routine_triggers` pendientes y mensajes `queued`); prueba obligatoria.
- **ui:** `/autonomy`: matriz agente × tipo de acción con nivel, estadísticas del modo sombra, botón "Subir" (solo si pasó el banco de pruebas, WP4) y "Revocar" inmediato con motivo. Historial por celda.
- **tests:** nivel efectivo = `min(empresa, agente, playbook)`; revocar cancela la cola; subir sin banco → 409.

## WP4: Banco de pruebas de autonomía

- **server:** `autonomyBench.run(companyId, agentId, actionType, { sampleSize: 20 })`: toma conversaciones reales cerradas (S2) o fixtures, reproduce al agente desde el punto anterior a nuestra respuesta (reutiliza `decision_training_examples` y su `snapshot` como formato de caso), compara con la respuesta humana o aprobada y puntúa (adecuación, tono, hechos, acción propuesta) con un modelo juez configurado por conexión de IA de la empresa. Resultado en `autonomy_bench_runs` (empresa, agente, tipo, muestra, puntuación, fallos `jsonb`, coste, estado). Reutiliza las ideas de `doc/plans/2026-03-13-agent-evals-framework.md`; no construyas un framework general.
- **ui:** en `/autonomy`: "Ejecutar banco de pruebas", informe con ejemplos de fallo y botón "Subir" habilitado solo con puntuación ≥ umbral de empresa.
- **tests:** con fixtures deterministas; coste registrado; un banco en curso no permite otro igual.

## WP5: Cola de decisiones comerciales

- **server:** sobre `decisions`, `decision_bundles` y `decision_queues` existentes: tipos de decisión `approve_send`, `approve_proposal`, `price_exception`, `discard_lead`, `escalate_customer`, `raise_autonomy`. Cada una con `subject` (tipo e id), `version` del sujeto, `effect` declarado y `continuation` (qué playbook run o mensaje continúa). Resolver aplica el efecto por el servicio de dominio correspondiente y llama a `recordShadowOutcome` cuando procede.
- **Respuesta remota:** endpoint firmado para resolver una decisión desde un enlace de correo o un mensaje de WhatsApp (`POST /api/public/decisions/:token/resolve` con opción elegida); el token caduca y solo resuelve esa decisión.
- **ui:** en Inicio ("Necesita tu decisión") y en fichas: tarjeta con sujeto, versión, opciones y efecto; conflicto si la versión del sujeto cambió.
- **tests:** resolver dos veces → una sola aplicación; versión obsoleta → 409; token caducado → 410.

## WP6: Seguimientos y secuencias multicanal

- **server:** nuevos `origin_kind` de rutinas: `opportunity`, `conversation`, `commitment`. Disparadores de dominio (servicio `commercialTriggers`): sin respuesta en N días, reunión celebrada, etapa cambiada, lead sin atender, compromiso a punto de vencer; cada uno busca playbook runs en espera y los avanza. Secuencia = pasos `follow_up` consecutivos del playbook con canal; si el contacto responde, la secuencia se detiene. Topes: `maxAttempts` por secuencia y respeto de bajas (`contacts.consents` del S2).
- **tests:** respuesta del contacto detiene la secuencia; baja impide envío; tope respetado.

## WP7: Compromisos detectados

- **server:** `commitmentExtractor` como herramienta `commitments_extract(conversationId)` que devuelve candidatos `{ who: 'us'|'them', what, dueAt, confidence }` propuestos por el agente a partir de los mensajes; el servicio persiste en `commitments` (S2) con `source='detected'` y estado `proposed` hasta que una persona o un playbook los confirme. Los nuestros generan tarea o seguimiento; los del cliente, recordatorio. Vencido → alerta en Inicio.
- **ui:** en ficha de cliente y conversación: lista de compromisos con confirmar/descartar.
- **tests:** idempotencia por conversación+hash del texto; vencimiento genera alerta una sola vez.

## WP8: Propuestas, firma ligera y señal

- **db:** `proposals` (empresa, oportunidad, cliente, revisión, título, alcance `jsonb`, condiciones, precio, moneda, validez, estado `draft/sent/viewed/accepted/rejected/expired`, documento asociado, token público, evidencia de aceptación `jsonb` con nombre, correo, fecha, IP y agente de usuario, Stripe payment link y estado de pago). Una revisión `sent` es inmutable: cambiar = nueva fila con `revision + 1`.
- **server:** `proposalService` (`createFromOpportunity`, `send` por `message_send` o enlace, `markViewed`, `accept`, `reject`, `expire`). Render de propuesta como documento (reutiliza `documents` con formato markdown y una plantilla). Stripe: crear Payment Link para la señal cuando la empresa tenga clave en secretos; webhook firmado que marca `paid`; pago y aceptación son hechos distintos.
- **público:** `/p/:company/proposal/:token` sobre el router público del S2: vista, aceptar con nombre y correo, pagar señal.
- **tools:** `proposal_create`, `proposal_send`, `proposal_get`.
- **ui:** `/proposals` y en la ficha de oportunidad: revisiones, estado, evidencia, pago.
- **tests:** editar `sent` → nueva revisión; aceptar revisión distinta de la enviada → 409; webhook sin firma → 401.

## WP9: Transferencia venta → entrega

- **server:** `handoffService.fromProposal(proposalId)` y `fromOpportunity(opportunityId)`: en transacción, crea proyecto con `customerId`, encargo (S1 `assignments`) con criterio desde el alcance, instala el equipo del servicio (catálogo) y carga el brief como documento del proyecto; recibo `handoff_receipts` (empresa, origen, proyecto, encargo, estado `partial/complete`, pasos hechos). Idempotente por origen; si una parte falla queda `partial` y reintentar completa sin duplicar. Paquete de traspaso: resumen de conversaciones y compromisos como comentario inicial del encargo para el gestor de cuenta.
- **tools:** `handoff_to_delivery`.
- **tests:** dos llamadas → un proyecto; fallo en el paso 3 → `partial` recuperable.

## WP10: Recurrencia y renovaciones

- **db:** `service_agreements` (empresa, cliente, propuesta, periodo, inicio, fin, entregables por periodo `jsonb`, estado, renovación automática, aviso en días). `agreement_periods` (acuerdo, periodo, encargo creado, estado).
- **server:** al empezar un periodo se crea el encargo del periodo (WP9); X días antes de vencer, disparador (WP6) genera propuesta de renovación (WP8) y decisión (WP5). Upsell: el agente propone con `commitments_extract`-like `upsell_suggest` a partir de conversaciones; solo sugerencia.
- **tests:** un encargo por periodo; renovación no duplica cliente ni propuesta.

## WP11: Pipeline operativo y previsión honesta

- **ui:** amplía `/opportunities` del S2: próximas acciones vencidas, "qué necesita de mí", filtro por responsable, cambio de etapa desde la tarjeta con actividad; previsión por etapa = suma ponderada por probabilidad **marcada "estimación"**, con moneda y periodo, nunca mezclada con ingresos ni sumando monedas distintas.
- **server:** `GET /companies/:id/opportunities/forecast` con `{ currency, period, byStage[], coverage }`.

## WP12: "Por qué hizo esto"

- **server:** `GET /companies/:id/agent-actions/:actionId/explain` que compone, para una acción externa o decisión: contexto usado (lecturas de `company_file_reads` y `context_get` del run), herramientas llamadas (`tool_action_deliveries`, run log `heartbeat_run_events`), gate aplicado y nivel de autonomía vigente en ese momento (WP3), decisión humana si la hubo (WP5), resultado y recibo (`conversation_messages`, `calendar`, `proposals`). Solo lectura; no toques el path de escritura del run log.
- **ui:** panel "Por qué hizo esto" en conversación, propuesta, reserva y decisión; cronología vertical con enlaces.
- **tests:** acción de otra empresa → 404; acción sin run → explica lo disponible sin fallar.

## WP13: Resumen diario al propietario

- **server:** rutina de empresa `daily-brief` que compone desde las mismas fuentes que Inicio (S1 WP5): hecho, entrado, necesita decisión (con enlaces de WP5 respondibles), compromisos que vencen, coste. Envío por `message_send` (WhatsApp) o correo según preferencia de usuario; hora y zona configurables.
- **ui:** en preferencias personales: canal, hora, activar.

## WP14: Estudio de medios v3

- **packages/media-studio:** operaciones nuevas como datos: `stop_motion` (secuencia de imágenes → vídeo con cadencia, movimiento de cámara `pan|zoom|none`, duración por fotograma), `dub_multivoice` (segmentos con `voiceId` por hablante, traducción aportada por el agente), `voiceover` (pista de voz sobre vídeo con ducking). Imágenes generadas por conexión de imagen cuando el agente las pide; coste registrado.
- **server:** jobs `stop_motion`, `dub_multivoice`, `voiceover`; herramientas `media_stop_motion`, `media_dub_multivoice`, `media_voiceover`. Plantilla de playbook: "demo personalizada tras cualificar" que genera un vídeo corto por idioma desde el contexto del lead.
- **tests:** fixtures de imágenes generadas en el test; duración resultante = fotogramas × cadencia; coste con `goal_id`.

---

## Opcionales si queda tiempo, en este orden

1. **Voz saliente** sobre `chat_voice_*`: llamada de recordatorio o cualificación con autonomía `call`, transcripción en la conversación, detección de "quiere hablar con una persona".
2. **Campañas con consentimiento**: envío a segmento con tope diario, exclusión de bajas, A/B de plantilla, medición de respuesta; pasa por el gate.
3. **Descuentos gobernados**: regla de descuento máximo por agente y servicio; por encima, decisión `price_exception`.
4. **Aprendizaje de decisiones**: cada resolución alimenta `decision_training_examples` y propone un cambio concreto al playbook como decisión.
5. **Riesgo de cartera** para agencias: indicador por cliente y propuesta de acción del gestor de cuenta.
6. **Banco de objeciones** reutilizable por el agente, alimentado desde conversaciones.

## Fuera de este sprint

Alta y cobro de Paperclip, planes, creador de agentes guiado, conexiones en dos clics, onboarding, catálogo público, copiloto, agencia implantadora, portal con cuenta, móvil, roles, idiomas, API pública. Todo eso es S4. No crees tablas ni rutas para nada de ello.

## Definición de hecho

- Flujo completo demostrable en local con PGlite y proveedores en modo prueba: lead entra → `lead_enrich` + `lead_qualify` → playbook responde con la autonomía efectiva → sin respuesta, seguimiento automático → reserva → `commitments_extract` → propuesta → decisión de excepción de precio → aceptación y señal (Stripe test) → `handoff_to_delivery` crea proyecto, encargo y equipo → "Por qué hizo esto" explica cada paso.
- Pruebas de: lead duplicado, envío incierto, revocación de autonomía a mitad de secuencia, baja del contacto, presupuesto agotado, versión obsoleta de propuesta.
- `pnpm -r typecheck`, `pnpm test:run`, `pnpm build`, `pnpm check:token-gates` en verde en tu rama rebasada sobre S2.
- Mapas de `maps/` actualizados y `node scripts/check-maps.mjs` en verde.
- Un PR por WP con el template completo, y en cada PR una sección "Dependencias del S2 asumidas" con los nombres reales que encontraste.
