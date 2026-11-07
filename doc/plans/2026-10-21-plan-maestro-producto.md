# Plan maestro de producto: cuatro sprints

Fecha: 2026-10-21
Estado: plan de construcción aprobado por el propietario; alcance por sprint sujeto a ajuste tras cada demo
Alcance de producto: emprendedores, agencias y equipos comerciales
Objetivo: un producto que resuelva los tres guiones de principio a fin, usable por un cliente sin ayuda nuestra

## Decisión

Construimos primero. La validación con compradores reales se hace **sobre el producto**, no antes de él: cada sprint termina con uno de los tres guiones funcionando de verdad y con una demo grabada. El propietario usa el producto en su propio negocio desde el sprint 1.

Lo que no cambia: cada entidad nueva pertenece a una empresa, cada acción nueva de agente pasa por permisos, presupuesto y auditoría, y lo que ya funciona (tareas, checkout, aprobaciones, hard stop de presupuesto) se reutiliza. Eso no es burocracia; es lo que permite vender el producto a alguien que no somos nosotros.

Supuestos de planificación: sprints de dos semanas, un equipo técnico pequeño apoyado por agentes de Paperclip, y el propietario disponible para aceptar entregables. Si el equipo es menor, se recorta la columna "Ambición" de cada sprint, nunca la columna "Imprescindible".

## Qué hay hoy y qué falta

| Área | Existe en el repo | Falta para vender |
| --- | --- | --- |
| Ejecución | Agentes, tareas, checkout, aprobaciones, presupuestos, rutinas, decisiones, auditoría | Entrada por resultado, no por tarea |
| Entregables | Artefactos Entrada/Salida, documentos con revisiones, productos de trabajo | Revisión y aceptación del entregable como acto propio |
| Clientes y ventas | Nada propio. `cases` y `pipelines` genéricos y experimentales | CRM nativo, con API y herramientas de agente |
| Correo y agenda | Conector Google Workspace con scopes Gmail y Calendar; AgentMail con mensajes y envíos | Bandeja por contacto, envío con autoridad, reserva real |
| Conexiones | Catálogo amplio (HubSpot, Pipedrive, Salesforce, Notion, Airtable, Slack, GitHub…) | Conectar en dos clics y comprobar que funciona |
| Equipos y skills | Catálogos instalables (`content`, `communications`, `research`, `finance`, `browser`) | Equipos por guion y creación guiada de agentes |
| Inicio y métricas | Dashboard, actividad en vivo, status cards, costes | Qué se hace, para quién, qué falta, cuánto cuesta |
| Onboarding | Semilla con misión, agente y primera tarea; asistente en estado de laboratorio | Asistente por camino que deja el primer encargo en marcha |
| Medios | Nada | Estudio de medios propio: transcripción, cortes, subtítulos, clips, doblaje, stop motion; usado por agentes de forma autónoma |

## Caso de partida

El propietario vende [Peluguau](https://peluguau.com/), un SaaS en castellano para peluquerías caninas con planes de 19 a 99 €/mes y entrada comercial por prueba gratuita, demo, auditoría y WhatsApp. Es el caso del emprendedor (vídeos de captación, sprint 1) y el caso comercial (leads entrantes, sprint 3). Los guiones están en [F0](2026-10-21-producto/2026-10-21-f0-casos-y-evidencias.md).

## Los cuatro sprints y el siguiente

| Sprint | Nombre | Guion que queda funcionando | Demo final |
| --- | --- | --- | --- |
| S1 | El emprendedor entrega | Emprendedor | Una grabación de Peluguau se convierte en clips subtitulados, versión horizontal, un clip doblado y textos de publicación, aceptados por el propietario con su coste |
| S2 | Todo lo que toca al cliente | Agencia y atención al exterior | CRM con identidad entre canales, bandeja unificada (correo, WhatsApp, Messenger, Instagram, Telegram, chat web, teléfono), agenda con reserva pública, revisión externa, publicación en redes, memoria y compromisos por cliente. Subagentes en paralelo por pista |
| S3 | Vende y entrega solo | Comercial completo | Playbooks, autonomía ganada con modo sombra y banco de pruebas, secuencias multicanal, compromisos detectados, propuestas con firma y señal por Stripe que crean el proyecto, renovaciones, "por qué hizo esto" |
| S4 | Producto que se vende solo | Los tres, para terceros | Alta y cobro por Stripe, onboarding desde una URL, agentes y equipos por descripción con entorno de prueba, conexiones en dos clics, catálogo y marketplace, copiloto de configuración, agencia implantadora, portal de cliente, móvil, roles e idiomas |
| S5 | Se decide con los pilotos | El que más pague y retenga | No se planifica hasta tener el informe de los pilotos externos del S4; una o dos apuestas grandes, no mejoras sueltas |

Cada sprint tiene tres columnas: **Imprescindible** (sin esto el sprint no se cierra), **Ambición** (lo que hace el producto mejor que la competencia, se recorta si hay que recortar) y **Regla** (lo que no se puede saltar).

---

## Sprint 1: El emprendedor entrega

**Objetivo:** que el propietario pida un resultado de negocio, lo reciba y lo acepte, y vea cuánto le ha costado. Todo con pantallas que entiende alguien que no sabe qué es un heartbeat.

### Imprescindible

| Pieza | Capa | Detalle |
| --- | --- | --- |
| Encargos por resultado | shared, server, ui | Un "encargo" es un objetivo con criterio de aceptación, presupuesto, contexto y entregable esperado. Se modela sobre `goals` + `issues` sin tabla nueva: campos `acceptanceCriteria`, `expectedDeliverable`, `budgetCents` en el objetivo o en metadatos tipados. Crear encargo = crear objetivo + tarea raíz asignada al equipo. |
| Revisión y aceptación de entregables | db, shared, server, ui | Tabla `deliverable_reviews` (empresa, artefacto o documento, versión, estado `pending/accepted/changes_requested`, revisor, motivo, fecha). Botones Aceptar / Pedir cambios en Artefactos y en el detalle de tarea. Pedir cambios reabre trabajo con el motivo como comentario. Activity log y evento de run. |
| Contexto del negocio | server, ui | Vista `/context` sobre `company_files` y `documents`: carpetas Oferta, Marca, Procedimientos, Clientes. Cada archivo con audiencia (empresa, proyecto, cliente) y vigencia. Los agentes reciben el contexto de su encargo por herramienta `context_search` / `context_get`, no copiando todo. |
| Inicio orientado a resultado | server, ui | `/dashboard` responde cuatro preguntas: qué se está haciendo, para quién, qué necesita de mí, cuánto ha costado. Sección "Necesita tu decisión" agrupa aprobaciones, decisiones y revisiones pendientes con acción directa. Mantener `/dashboard/live` como vista técnica. |
| Estudio de medios, versión 1 | server, adapter-utils, teams-catalog | Ver la línea transversal más abajo. En S1: ingesta de vídeo, transcripción con marcas de tiempo, corte de silencios y muletillas, subtítulos quemados, exportación 9:16 y 16:9, doblaje de un clip con ElevenLabs. Todo como herramientas de agente con coste por operación. |
| Equipo "Contenido y vídeo" instalable | teams-catalog, skills-catalog | Equipo `entrepreneur-content` con Estratega de contenido, Editor de vídeo, Redactor y Revisor; skills de guion corto, edición por transcripción, subtítulos y textos de publicación. Se instala desde el catálogo con sus permisos y presupuesto. |
| Costes por encargo | server, ui | Coste de ejecución y de proveedores (transcripción, ElevenLabs) agregado por objetivo y por entregable en la ficha del encargo y en `/costs`. Sin atribuciones inventadas: lo no atribuible aparece como tal. |

### Ambición

| Pieza | Detalle |
| --- | --- |
| Onboarding por camino, versión 1 | Al crear empresa: elegir camino, describir negocio y oferta en lenguaje natural, elegir primer encargo de una lista corta. Sale un equipo instalado, contexto creado y encargo en marcha. Sustituye al laboratorio actual. |
| Plan visible antes de gastar | El equipo propone plan y presupuesto estimado; el propietario lo aprueba o ajusta antes de que empiece la ejecución. Reutiliza `issue_plan_decompositions` y aprobaciones. |
| Entregables con vista previa | Markdown, HTML, imágenes, PDF y vídeo se previsualizan en Artefactos sin descargar; el vídeo muestra transcripción y lista de cortes aplicados. |
| Clips virales | El editor detecta los mejores momentos de la grabación completa y propone clips verticales con portada, como hace Claude Cut; el propietario elige cuáles exportar. |

### Regla

- Nada de lo anterior crea tablas de CRM. El emprendedor no necesita cliente.
- Toda acción de agente nueva declara permiso, coste y evidencia; aceptar un entregable es un acto humano registrado.
- Piloto interno: el propietario ejecuta un encargo real de su negocio en la última semana del sprint y registra tiempo, coste, correcciones y fricción.

### Cierre

Demo: desde empresa vacía y una grabación de Peluguau hasta tres clips, una versión horizontal y un clip doblado aceptados, en menos de 60 minutos de reloj, con coste visible por pieza. Checks: `pnpm -r typecheck`, `pnpm test:run`, `pnpm build`, `pnpm check:token-gates`. Mapas actualizados.

---

## Sprint 2: Todo lo que toca al cliente

**Objetivo:** que Paperclip sea el único sitio donde vive la relación con el exterior: quién es cada persona en cualquier canal, qué se le ha dicho, qué se le ha prometido, qué se le ha entregado y qué toca ahora. Correo, WhatsApp, Messenger, Instagram, Telegram, chat web, teléfono, agenda, revisiones y publicación en redes, con la misma API para personas y agentes, y con contexto aislado por cliente. Al cerrar, una agencia lleva su cartera y entrega, y un negocio recibe, atiende y agenda desde aquí sin salir a otra herramienta.

Se ejecuta con **subagentes en paralelo por pista**. Días 1 y 2: contrato compartido (esquema, tipos, validators, nombres de herramientas, autonomía). Después cada pista avanza sola; un responsable de integración combina, y nadie crea su propia identidad de cliente, contacto o conversación.

### Contrato compartido (días 1 y 2, antes de abrir pistas)

| Pieza | Capa | Detalle |
| --- | --- | --- |
| Modelo CRM | db, shared | `customers` (empresa, tipo persona/organización, nombre, dominio, etiquetas, responsable, estado, salud, archivado), `contacts` (nombre, correos, teléfonos, handles por canal, cargo, idioma, canal preferido, consentimientos), `customer_contacts` (rol por relación), `opportunities` (cliente, etapa, importe, moneda, probabilidad, próxima acción, fecha, responsable, origen, versión), `leads` (origen, identificador de origen, payload, estado `new/triaged/qualified/converted/discarded`, contacto y oportunidad resultantes), `crm_activities` (sujeto polimórfico, tipo, actor, resumen, referencia externa). Identificadores externos en `external_objects`. |
| Identidad entre canales | db, shared, server | `contact_identities` (contacto, canal, identificador normalizado, verificado, fuente). Resolución: un correo, un teléfono o un handle de Instagram apuntan a la misma persona; si hay duda, se crea candidato de fusión, nunca un duplicado silencioso. |
| Conversaciones | db, shared | `conversations` (empresa, canal `email/whatsapp/messenger/instagram/telegram/webchat/voice/sms`, contacto, cliente, oportunidad, hilo externo, estado `open/waiting_us/waiting_them/closed`, prioridad, SLA) y `conversation_messages` (dirección, actor humano/agente/contacto, cuerpo, adjuntos, idioma detectado, estado de entrega `draft/queued/sent/delivered/read/failed/uncertain`, recibo de proveedor). Los transportes existentes (`emailMessages`, `chat_channels`, `chat_voice_*`) se proyectan aquí; no se duplica el transporte. |
| Compromisos | db, shared | `commitments` (empresa, conversación o propuesta de origen, quién promete, a quién, qué, fecha, estado `open/kept/missed/cancelled`, evidencia). Lo que decimos a un cliente queda como algo que hay que cumplir. |
| Etapas | db, shared | Pipeline `sales` por defecto en el motor de `pipelines` existente. Oportunidades con tabla propia; `pipelines` solo aporta etapas y transiciones. No se usan `cases`. |
| Autonomía por acción | shared, server | Tres niveles por empresa, por agente y por tipo de acción externa: `draft_only`, `send_with_approval`, `send_direct`. Por defecto `draft_only`. Un solo punto de decisión (`external-action-gate`) por el que pasan correo, mensajes, reservas, publicaciones y enlaces. |
| Nombres de herramientas | server | Lista cerrada de herramientas de agente de todas las pistas con sus esquemas, antes de implementarlas. |
| Superficie pública | server, ui | Un único router público `/p/:companySlug/...` con marca de empresa (logotipo, colores, idioma) para formularios, reserva, revisión, propuestas y chat. Tokens firmados, caducidad y revocación. Sin sesión de empresa. |

### Pistas en paralelo

| Pista | Imprescindible | Herramientas de agente |
| --- | --- | --- |
| **A. CRM** | Servicios y API `/customers`, `/contacts`, `/opportunities`, `/leads`, `/crm/activities`, `/commitments` con paginación, filtros, búsqueda, segmentos guardados y detección de duplicados que devuelve candidatos. Idempotencia en creación y conversión. Pantallas `/customers`, `/customers/:id` (Resumen, Contactos, Conversaciones, Oportunidades, Compromisos, Proyectos, Actividad, Contexto, Memoria), `/contacts`, `/opportunities` (tablero por etapas con arrastre + lista), `/leads` (cola de triaje). | `crm_search`, `crm_get_customer`, `crm_create_customer`, `crm_create_contact`, `crm_create_opportunity`, `crm_update_opportunity_stage`, `crm_set_next_action`, `crm_log_activity`, `lead_convert`, `commitment_create`, `commitment_resolve` |
| **B. Entrada y triaje** | Formulario público embebible en `/p/:company/form/:slug` con campos configurables; importación CSV con mapeo y revisión de duplicados; correo, WhatsApp, Messenger, Instagram, Telegram, chat web y llamada entrante crean lead y conversación. Triaje automático por agente: idioma, prioridad, cliente existente o nuevo, responsable sugerido. Repetir una entrada no crea dos leads. | `lead_get`, `lead_list`, `lead_triage` |
| **C. Bandeja unificada** | `/inbox` (reutiliza y amplía `attention` existente): todas las conversaciones de todos los canales en una sola bandeja con estado, prioridad, SLA, responsable y filtros por cliente, canal y etapa. Responder desde ahí por el canal original. Vista "Esperan respuesta" y "Vencidas". Redactar, responder y enviar según autonomía; recibo de proveedor; un envío incierto no se repite sin reconciliar. Adjuntar entregables y enlaces públicos. Respuesta en el idioma del contacto. | `conversation_list`, `conversation_get`, `message_draft`, `message_send`, `message_reply`, `conversation_set_state` |
| **D. Correo** | Gmail (conector Google Workspace existente) y AgentMail proyectados a conversaciones; hilos, etiquetas, adjuntos, firmas por agente; plantillas por idioma; seguimiento de apertura cuando el proveedor lo da. Buzón compartido de empresa y buzón por agente. | (usa herramientas de C) |
| **E. Meta: WhatsApp, Messenger e Instagram** | Meta Cloud API para los tres canales con una sola conexión: alta de número, verificación de negocio, plantillas aprobadas, ventana de 24 h respetada, opt-in registrado por contacto. Webhooks firmados. Telegram reutilizando `chat_channels`. SMS por Twilio como respaldo opcional. | (usa herramientas de C) |
| **F. Chat web** | Widget embebible (`<script>`) con marca de empresa, que abre conversación, identifica al visitante (correo o teléfono) y crea lead. Un agente responde en tiempo real con el contexto de oferta y procedimientos (`context_search`) y escala a persona cuando la política lo exige. Historial unificado con el resto de canales. | `webchat_handoff` |
| **G. Teléfono** | Sobre `chat_voice_*` y el equipo `speko-company-phone-agent` del catálogo: número de empresa, llamada entrante atendida por agente con transcripción, resumen y lead o actividad creados; devolución de llamada programada. Llamada saliente solo con autonomía concedida. | `call_summary_get`, `call_schedule` |
| **H. Agenda** | Google Calendar con los scopes ya presentes: disponibilidad, reserva con invitación, cambio, cancelación, recordatorios por el canal preferido del contacto. `/schedule` por cliente y oportunidad. Enlace público de reserva `/p/:company/book/:agent` con tipos de reunión y horarios. Reserva = evento confirmado por el proveedor; proponer horas es otro resultado. | `calendar_availability`, `calendar_book`, `calendar_reschedule`, `calendar_cancel` |
| **I. Revisión externa y entrega** | Enlace `/p/:company/review/:token` para que un contacto vea un entregable o documento en una versión concreta, comente por zona (reutiliza `document_annotation_*`), acepte o pida cambios. Sin cuenta. Evidencia en la revisión del S1 ("aceptado en nombre de"). Notificación al contacto por su canal preferido. | `review_link_create`, `review_status_get` |
| **J. Publicación en redes** | Los clips y textos del estudio se programan y publican en YouTube, Instagram, TikTok y LinkedIn por conector (directo o vía Buffer), con calendario editorial en `/publishing`, aprobación según autonomía, estado por plataforma y métricas básicas de vuelta (vistas, interacciones). Publicar es una acción externa más: pasa por el mismo gate. | `post_schedule`, `post_publish`, `post_metrics_get` |
| **K. Proyectos, contexto y memoria por cliente** | `projects.customerId`; audiencia `customer` en contexto; brief versionado; **memoria por cliente**: notas que los agentes mantienen (preferencias, tono, decisiones pasadas) con fuente y fecha, visibles y editables en la ficha. Prueba automática: un agente en un proyecto del cliente A no recibe nada del cliente B en contexto, conversaciones ni memoria. | `customer_memory_get`, `customer_memory_append` |
| **L. Sincronización CRM externo** | HubSpot y Pipedrive con los conectores existentes: importación inicial y sincronización en ambos sentidos de clientes, contactos, oportunidades y actividades. Sistema principal declarado por dato, identificador externo, conflictos y comportamiento al desconectar. | `crm_sync_status` |
| **M. Equipos** | `agency-content` (Gestor de cuenta, Redactor, Editor, Revisor), `sales-inbound` (SDR, Cualificador, Agendador) y `customer-care` (Atención, Escalado). Autonomía por defecto `draft_only`. Skills de triaje, respuesta por canal, reserva, revisión y publicación. | — |
| **N. Estudio de medios v2** | Mejores momentos y clips con portada, zoom progresivo, presets de subtítulos por marca, intro/cierre con logotipo, concatenación, versiones por plataforma (duración y formato). Proyectos de medios por cliente con aislamiento. | `media_find_highlights`, `media_zoom`, `media_concat`, `media_platform_variants` |

### Ambición

| Pieza | Detalle |
| --- | --- |
| Cronología unificada | En la ficha: actividades, conversaciones de todos los canales, llamadas, tareas, entregas, reuniones, publicaciones, compromisos y decisiones en una sola línea de tiempo con enlace al original. |
| Catálogo de servicios | `offerings` (nombre, alcance, precio orientativo, plantilla de proyecto, entregables tipo). Crear un encargo desde un servicio instala tareas y contexto. |
| Salud del cliente | Indicador por cliente: entregas tardías, revisiones por encargo, conversaciones sin respuesta, compromisos incumplidos. Alerta en Inicio cuando empeora. |
| Satisfacción | Encuesta corta por enlace tras una entrega o una reunión; resultado en la ficha y en métricas. |
| Costes por cliente | Coste de ejecución y de proveedores atribuido a cliente y proyecto, con "no atribuido" explícito. |
| Fusión asistida | Fusionar contactos o clientes duplicados conservando referencias e historial, con vista previa y deshacer. |
| Consentimiento y bajas | Registro de opt-in por canal, baja con un clic en correo y WhatsApp, y bloqueo de envío a quien se dio de baja. |
| Búsqueda global | Un buscador que devuelve clientes, contactos, conversaciones, compromisos y entregables distinguibles, con permisos aplicados. |

### Reglas

- Una sola fuente de verdad para identidad: nada de "cliente" en JSON de otra tabla.
- Un contacto nunca es miembro ni principal. No ve nada por ser contacto; un enlace público no es una cuenta.
- El texto de un cliente nunca otorga autoridad al agente. Los eventos entrantes se validan por firma y cuenta antes de crear nada.
- Borrador, enviado, entregado, leído, fallido e incierto son estados distintos y se ven distintos.
- Toda acción externa pasa por el mismo gate de autonomía. No hay atajos por canal.
- No se contacta a personas reales sin autorización explícita; en pruebas se usan buzones, números y cuentas propias. Las ventanas y plantillas de Meta se respetan siempre.

### Cierre

Demo en tres partes. **Agencia:** alta de cliente, brief, encargo con el equipo, entrega, revisión del cliente por enlace con comentarios, aceptación en su nombre; un segundo cliente no ve ni aporta nada al primero. **Exterior:** un formulario, un WhatsApp, un DM de Instagram y una llamada crean leads de la misma persona sin duplicarla; el triaje la prioriza; el agente responde por su canal preferido con aprobación y recibo; el contacto reserva por el enlace público; el compromiso "te envío la propuesta el jueves" queda registrado. **Publicación:** tres clips del estudio se programan y publican en dos redes con aprobación, y sus métricas vuelven a la ficha. Checks completos y migraciones en orden.

---

## Sprint 3: Vende y entrega solo

**Objetivo:** que los agentes lleven la relación completa con autonomía ganada, no regalada: cualifican, responden, hacen seguimiento, proponen, cobran la señal, cierran, transfieren a entrega, renuevan y avisan de riesgos, y el negocio solo decide excepciones. Es el sprint de la continuidad, la confianza medible y el gobierno.

### Imprescindible

| Pieza | Capa | Detalle |
| --- | --- | --- |
| Playbooks comerciales | db, shared, server, ui | `playbooks` versionados: secuencia de pasos (cualificar, responder, seguir, proponer, agendar, cerrar) con condiciones, canal, plazo, plantilla y nivel de autonomía por paso. Se ejecutan sobre rutinas y colas existentes. Un playbook por tipo de lead o servicio. Edición visual simple; copia desde el catálogo. |
| Cualificación con criterios y fuentes | server, teams-catalog | Criterios por empresa en contexto estructurado. `lead_qualify` devuelve puntuación, motivos y fuentes consultadas; el resultado queda en el lead y en la actividad. Enriquecimiento previo con Exa, Firecrawl y Tavily (dominio, tamaño, sector, señales públicas) con fuentes y coste. |
| Autonomía ganada | shared, server, ui | Pantalla por empresa, agente y acción para fijar `draft_only / send_with_approval / send_direct`. **Modo sombra:** el agente redacta durante N días y se mide cuántos borradores salieron sin cambios; cuando supera el umbral, Paperclip propone subir la autonomía y el propietario lo acepta en un clic. Subir o bajar es un acto registrado y revocable al instante. |
| Banco de pruebas antes de dar autonomía | server, ui | Reutiliza `decision_training_examples` y conversaciones pasadas: antes de conceder `send_direct` se reproduce al agente contra 20 conversaciones reales y se puntúa. Informe con fallos y ejemplos. Sin pasar el banco no se puede subir autonomía. |
| Cola de decisiones comerciales | server, ui | Sobre `decisions` y `decision_queues`: aprobar envío, aprobar propuesta, excepción de precio, descartar lead, escalado de cliente. Cada decisión con sujeto, versión, efecto y continuación; desde Inicio ("Necesita tu decisión"), desde la ficha y por WhatsApp o correo con respuesta en un toque. |
| Seguimientos y secuencias multicanal | server | Rutinas con origen `opportunity`, `conversation` y `commitment`. Disparadores: sin respuesta en N días, reunión celebrada, etapa cambiada, lead sin atender, compromiso a punto de vencer. Secuencia que combina correo, WhatsApp y llamada según respuesta y canal preferido, con tope de intentos y respeto de bajas. |
| Compromisos detectados | server | De cada conversación el agente extrae promesas nuestras y del cliente y las propone como `commitments`; las nuestras generan tarea o seguimiento; las del cliente generan recordatorio. Vencido = alerta en Inicio. |
| Propuestas, firma y señal | db, shared, server, ui | `proposals` (oportunidad, revisión, alcance, condiciones, precio, validez, estado `draft/sent/viewed/accepted/rejected/expired`, evidencia). Generadas desde oferta, contexto y conversación; enviadas por `/p/:company/proposal/:token` con vista, aceptación con nombre, correo, fecha e IP como firma ligera, y **enlace de pago Stripe** opcional para la señal. Una revisión enviada es inmutable; el cambio crea otra. |
| Transferencia venta → entrega | server | Propuesta aceptada o oportunidad ganada crea proyecto, encargo, equipo y brief con idempotencia; paquete de contexto para el gestor de cuenta; recibo estable; si una parte falla queda recuperable sin duplicar. Traspaso entre agentes (SDR → Gestor de cuenta) con resumen de todo lo hablado. |
| Recurrencia y renovaciones | db, server, ui | Servicios recurrentes: acuerdo con periodo, entregables por periodo y renovación. Aviso antes de vencer, propuesta de renovación generada, upsell sugerido a partir de conversaciones. Sin duplicar cliente ni propuesta. |
| Pipeline operativo y previsión honesta | ui, server | `/opportunities` con próximas acciones vencidas, "qué necesita de mí", filtro por responsable; previsión por etapa marcada como estimación con moneda y periodo; nunca sumada a ingresos. |
| "Por qué hizo esto" | server, ui | Vista por acción de agente: contexto usado, herramientas llamadas, gate aplicado, decisión humana si la hubo, resultado y recibo. Reutiliza el run log local. Es la base de la confianza para subir autonomía. |
| Resumen diario al propietario | server | Por WhatsApp o correo: qué se hizo, qué entró, qué necesita decisión, qué compromisos vencen, cuánto costó. Mismas fuentes que Inicio. |
| Estudio de medios v3 | packages, server | Stop motion desde secuencia de imágenes, traducción completa y doblaje multivoz, vídeos cortos de respuesta o demo por idioma para leads, generados desde el playbook (por ejemplo, demo personalizada tras cualificar). |

### Ambición

| Pieza | Detalle |
| --- | --- |
| Voz saliente | Llamadas de cualificación, recordatorio o confirmación con `chat_voice_*`, solo con autonomía concedida, transcripción en la conversación y detección de "quiere hablar con una persona". |
| Campañas con consentimiento | Envío a un segmento (correo o WhatsApp con plantilla aprobada) con límites por día, exclusión de bajas, prueba A/B de mensaje y medición de respuesta. Pasa por el gate como cualquier acción externa. |
| Precios y descuentos gobernados | Reglas de descuento máximo por agente y por servicio; por encima, decisión humana; registro de margen estimado con cobertura explícita. |
| Aprendizaje de decisiones | Cada aprobación, corrección o rechazo alimenta sugerencias al agente y propone cambios al playbook; el propietario acepta o descarta el cambio. |
| Salud y riesgo de cartera | Para agencias: clientes en riesgo por retrasos, revisiones, silencio o compromisos incumplidos; propuesta de acción por el gestor de cuenta. |
| Objeciones y preguntas frecuentes | Banco de objeciones con respuestas aprobadas que el agente reutiliza y que se alimenta de conversaciones reales. |
| Equipo comercial multiagente | Un agente coordinador reparte leads entre SDR por idioma, canal y carga, respetando la asignación única de cada tarea. |

### Reglas

- Una autorización permanente válida permite acciones repetidas de su alcance; no se pide confirmación por ejecución si la política no lo exige.
- Nadie recibe `send_direct` sin pasar el banco de pruebas y el modo sombra. Revocar es inmediato y corta lo que esté en cola.
- Reintentos con clave de operación; un resultado incierto se reconcilia antes de repetir.
- Una propuesta aceptada, un pago recibido y una entrega aceptada son hechos distintos y se registran por separado.
- Todo lo que un agente hace hacia fuera deja actor, contexto, resultado y recibo, y se puede explicar en "Por qué hizo esto".

### Cierre

Demo: un lead entra por Instagram, se enriquece y cualifica con motivos; el SDR responde en su idioma con `send_direct` ganado tras el banco de pruebas; sin respuesta en tres días sale el seguimiento por WhatsApp solo; el contacto reserva; tras la reunión el agente detecta el compromiso, genera la propuesta, se aprueba la excepción de precio desde el móvil, el contacto la acepta y paga la señal por Stripe, y aparece el proyecto con equipo, brief y traspaso al gestor de cuenta; a los tres meses salta la renovación. Pruebas de lead duplicado, envío incierto, revocación de autonomía a mitad de secuencia, baja del contacto y presupuesto agotado. "Por qué hizo esto" explica cada paso.

---

## Sprint 4: Producto que se vende solo

**Objetivo:** que cualquiera se dé de alta, pague, elija su camino, monte su equipo describiendo lo que quiere, conecte sus herramientas, lance su primer encargo y vuelva cada día porque Inicio le dice qué pasa. Y que una agencia pueda implantar Paperclip en sus clientes y gestionarlos desde una sola cuenta. Es el sprint de autoservicio, escala y cobro.

Se ejecuta con **subagentes en paralelo por pista**, como el S2. Días 1 y 2: contrato de cuentas, planes y límites; después cada pista avanza sola con un responsable de integración.

### Contrato compartido (días 1 y 2)

| Pieza | Capa | Detalle |
| --- | --- | --- |
| Cuentas y planes | db, shared | `accounts` (titular, empresas, plan, estado, Stripe customer), `plans` (límites: empresas, agentes, encargos al mes, minutos de vídeo, mensajes, conexiones), `usage_meters` (empresa, métrica, periodo, consumo), `account_invoices` (proyección de Stripe). Un titular puede tener varias empresas; una agencia implantadora tiene las de sus clientes bajo su cuenta. |
| Autoservicio y límites | server | Un único punto `plan-gate` que consulta límites antes de crear agente, encargo, conexión, trabajo de medios o envío. Límite alcanzado = mensaje claro con enlace a subir de plan; nunca error genérico. Las políticas de presupuesto existentes siguen mandando dentro del límite. |
| Paquetes | shared | Formato versionado de paquete instalable: equipo, skills, playbooks, plantillas de encargo, presets de marca, formularios, tipos de reunión. Sin secretos ni permisos. Es lo que exporta, importa y publica el catálogo. |
| API pública y webhooks | shared, server | Versionado `/api/v1` con claves por empresa y alcances, webhooks firmados por evento de negocio (lead creado, propuesta aceptada, entregable aceptado, conversación nueva), y OpenAPI publicado. Reutiliza `openapi.ts` y `board_api_keys`. |

### Pistas en paralelo

| Pista | Imprescindible |
| --- | --- |
| **A. Alta y cobro** | Registro con correo o Google, verificación, elección de plan, prueba gratuita con límites, pago por Stripe (suscripción, cambio de plan, cancelación, facturas), página de consumo por métrica frente a límite. Rutas públicas `/signup`, `/pricing`, `/billing`. Avisos al 80 % y al 100 % de cada límite. |
| **B. Onboarding por camino, versión 2** | Camino → negocio y oferta (pegar URL y Paperclip extrae oferta, marca y tono con Firecrawl) → contexto mínimo → conexiones del guion → equipo instalado → primer encargo en marcha, todo reanudable y en menos de 20 minutos. Importación inicial de contactos desde Gmail, CSV o HubSpot. Mide tiempo hasta primer encargo y hasta primer entregable aceptado. |
| **C. Creador de agentes y equipos por descripción** | `/agents/new` y `/teams/new` empiezan por "¿Qué quieres que haga?". Paperclip propone rol, skills, herramientas, conexiones necesarias, autonomía, presupuesto y playbook; crea un **entorno de prueba** donde el usuario conversa con el agente y lo ve usar herramientas en seco antes de activarlo; pasa el banco de pruebas del S3 cuando aplica. Vista avanzada para quien la quiera. Clonar, versionar y comparar configuraciones. |
| **D. Conexiones en dos clics** | Conectar = elegir app, autorizar, y Paperclip ejecuta una comprobación real y muestra el resultado. Tarjeta con cuatro estados: disponible, conectada, autorizada, comprobada. Si una herramienta necesita una conexión que no está, el agente lo pide con enlace directo. Salud de conexiones en Inicio y reconexión guiada cuando un token caduca. Zapier y Make como conectores genéricos por webhook. |
| **E. Catálogo y marketplace** | `/catalog` con equipos, skills, playbooks y plantillas de encargo por camino y sector, instalables en un clic como paquetes. Publicar un paquete propio en el catálogo de la cuenta y, con revisión, en el catálogo público. Valoraciones y uso. Lo publicado nunca lleva secretos, contactos ni permisos. |
| **F. Copiloto de configuración** | Un asistente dentro de la aplicación (sobre el chat de agentes existente) que configura por conversación: "quiero que me avise por WhatsApp cuando entre un lead de más de 500 €" → crea rutina, gate y canal, y enseña lo que ha hecho con enlace. Solo hace lo que el usuario podría hacer a mano con sus permisos. |
| **G. Agencia implantadora** | Una cuenta gestiona varias empresas cliente: crear empresa desde plantilla, instalar paquete, conexiones propiedad del cliente, consumo y coste por empresa, facturación agregada o separada, acceso del cliente a su empresa con rol limitado, marca blanca básica (logotipo, dominio, colores) en la superficie pública y en el correo. |
| **H. Portal de cliente** | Sobre el enlace de revisión del S2: un contacto, por enlace con token o cuenta ligera, ve sus entregables, propuestas, reuniones, compromisos y conversaciones con la empresa, acepta, comenta, paga una señal y sube archivos. Sin navegación por la empresa; caducidad y revocación. |
| **I. Inicio con métricas reales y resumen** | Por camino, con fuente, periodo y cobertura: emprendedor (entregables aceptados, tiempo hasta el primero, coste por resultado); agencia (entregas a tiempo, revisiones por encargo, salud de cartera, coste por cliente); comercial (tiempo de primera respuesta, leads atendidos, reuniones, propuestas, ganadas, previsión como estimación). Comparación con el periodo anterior. El resumen diario del S3 se configura desde aquí. |
| **J. Móvil y notificaciones** | PWA instalable: Inicio, bandeja, decisiones y revisiones usables desde el móvil; notificaciones push y por WhatsApp para "necesita tu decisión"; responder decisiones en un toque. |
| **K. Acceso y seguridad para terceros** | Segundo factor, roles por empresa (propietario, operador, revisor, solo lectura) sobre las membresías existentes, registro de sesiones, exportación completa de la empresa y borrado de cuenta. Política de retención de conversaciones y archivos por empresa. |
| **L. Idiomas** | Interfaz en español, inglés y portugués; agentes responden en el idioma del contacto; plantillas y superficie pública por idioma. |
| **M. Pulido para terceros** | Estados vacíos con acción, errores con causa y siguiente paso, textos sin jerga interna, token gates limpios, rendimiento en carteras y bandejas grandes (paginación de servidor en todo), accesibilidad por teclado en el recorrido completo. |
| **N. Estudio de medios v4** | Plantillas de encargo de vídeo (clips de un directo, demo, testimonio, tutorial, anuncio), presets de marca (fuente, colores, portada, voz, música con licencia), cola con prioridad y límites por plan, coste por minuto producido. |

### Ambición

| Pieza | Detalle |
| --- | --- |
| Servicio alojado | Alta multiempresa en infraestructura nuestra con aislamiento por cuenta, copias, restauración, estado del servicio y soporte dentro de la aplicación. Si no llega, el S4 vende instalación gestionada con el mismo cobro. |
| Enrutado inteligente de modelos | Elegir modelo por tarea y coste con la conexión de IA del usuario o la nuestra, con el ahorro visible en costes. Reutiliza la base de `ai_connection_routing`. |
| Referidos y programa de agencias | Enlace de referido, comisión por empresa implantada y panel para la agencia. |
| Plantillas por sector | Paquetes listos para los sectores que validen los pilotos: clínicas, estudios, consultoras, comercios con cita. |
| Economía del negocio, versión 1 | Ventas acordadas, señales cobradas por Stripe y costes atribuidos, separados y con moneda. Sin contabilidad. |
| Estado y confianza | Página pública de estado, registro de cambios dentro de la aplicación y tour de novedades por versión. |

### Reglas

- Nada se muestra como disponible si depende de un flag experimental sin calificar o de una conexión sin comprobar.
- Un paquete publicado nunca lleva secretos, contactos, conversaciones ni permisos; importar nunca concede autoridad.
- La agencia implantadora no ve lo que su cliente no le ha concedido; las conexiones son del cliente.
- Un límite de plan se explica y se puede subir; nunca pierde trabajo ni datos.
- Pilotos externos: un emprendedor, una agencia y un negocio comercial que no seamos nosotros, con registro de utilidad, tiempo hasta primer resultado, coste y voluntad de pago.

### Cierre

Demo: una persona ajena al equipo se registra, paga la prueba, pega la URL de su negocio, acepta la oferta extraída, instala un paquete del catálogo, prueba su agente en el entorno de prueba, conecta Gmail y Calendar con comprobación, y lanza su primer encargo en menos de 20 minutos; recibe en el móvil su primera decisión y la responde en un toque. Una agencia crea dos empresas cliente desde plantilla, les instala el paquete y ve consumo y coste separados. Se graban las dos. Se entregan las métricas de los tres pilotos externos y la factura de Stripe de cada uno.

---

## Sprint 5: Se decide con los pilotos

No se planifica ahora. Al cierre del S4 habrá, por primera vez, tres pilotos externos pagando, y el S5 se decide con sus datos y una sola pregunta: **qué es lo que más les hace pagar y quedarse**. No es un sprint de "mejoras pequeñas": después de cuatro sprints de construcción habrá deuda, pero se paga donde los pilotos duelen, no en general.

### Cómo se decide

Al cerrar el S4, con las métricas de los pilotos (tiempo hasta primer resultado, qué canal usan, dónde se atascan, qué decisiones les cansan, qué métrica no se creen, voluntad de pago) se eligen una o dos apuestas, nunca todas. Se escribe entonces con el mismo formato que los sprints anteriores: contrato compartido, pistas, ambición, reglas y demo.

### Tres bloques previsibles

| Bloque | Qué entra | Cómo se prioriza |
| --- | --- | --- |
| Lo que se recortó | Piezas de Ambición y pistas degradadas en S1 a S4: servicio alojado completo, campañas con consentimiento, voz saliente, fusión asistida, salud de cartera, aprendizaje de decisiones | Lo que los pilotos hayan echado de menos primero |
| Lo que digan los pilotos | Atascos de onboarding, canal real de uso, decisiones que cansan, métricas en las que no confían, integraciones que piden | Manda sobre cualquier idea nuestra |
| Una o dos apuestas grandes | De la lista siguiente | Según qué guion convierte y retiene más |

### Apuestas candidatas

| Apuesta | Qué es | Señal que la justifica |
| --- | --- | --- |
| Economía del negocio completa | Facturación del usuario a sus clientes, cobros, conciliación con Stripe y bancos, margen real por cliente y encargo | Los pilotos piden "cuánto gano" y no solo "cuánto gasto" |
| Agentes que aprenden de resultados | Qué mensajes convierten, qué entregables se aceptan a la primera, qué playbook gana; propuestas de mejora con evidencia | La venta automática es lo que retiene |
| Verticales | Paquetes profundos por sector con integraciones propias (reservas, TPV, Shopify, WooCommerce) | Varios pilotos del mismo sector o una agencia que los implanta |
| Marketplace con pagos | Terceros venden equipos, playbooks y plantillas; reparto de ingresos | Hay creadores de paquetes y demanda en el catálogo |
| Operación a escala | Multi-región, residencia de datos, cumplimiento formal, SLA y soporte 24/7 para el servicio alojado | Clientes que exigen contrato y garantías antes de pagar más |
| Agencia implantadora completa | Facturación a sus clientes desde Paperclip, marca blanca total, panel de cartera de implantaciones | Las agencias son quien más paga y quien más trae |
| Medios en producción | Avatares, vídeo desde texto, música y plantillas animadas; vídeo como canal comercial a escala | El contenido es lo que convierte y los usuarios lo producen a diario |

### Regla

El S5 no empieza sin el informe de los tres pilotos externos del S4. Si el informe no existe, el primer trabajo del S5 es conseguirlo.

---

## Línea transversal: Estudio de medios

Un editor de vídeo propio, sin línea de tiempo, que los agentes usan de forma autónoma. Funciona como Claude Cut: el agente trabaja sobre la transcripción y una lista de operaciones, y un servicio de render aplica los cambios con ffmpeg. Avanza una porción cada sprint, siempre dentro del guion que la necesita.

### Arquitectura

| Pieza | Detalle |
| --- | --- |
| Servicio de render | Proceso aparte (`packages/media-studio` o servicio en `server/`), con cola de trabajos, ffmpeg y almacenamiento en `assets`. Cada trabajo tiene empresa, encargo, entrada, lista de operaciones, salida, coste y estado `queued/running/done/failed`. Idempotente por clave de trabajo. |
| Transcripción | Proveedor por conexión (Whisper vía API o local, Deepgram o similar) con marcas de tiempo por palabra. Se guarda como documento del proyecto y se indexa para no releerla entera en cada paso. |
| Modelo de edición | Un "proyecto de medios" guarda entrada, transcripción, operaciones aplicadas y exportaciones. Las operaciones son datos (cortar rango, eliminar silencios con umbral, quitar muletillas, subtítulos con estilo, zoom en rango, recortar a 9:16 con seguimiento de rostro, insertar voz, concatenar), nunca comandos ffmpeg escritos por el agente. |
| Herramientas de agente | `media_ingest`, `media_transcribe`, `media_detect_silences`, `media_detect_fillers`, `media_cut`, `media_subtitle`, `media_zoom`, `media_export`, `media_find_highlights`, `media_dub`, `media_voiceover`, `media_stop_motion`. Cada una pasa por permisos, presupuesto y registro de coste. |
| Revisión | Cada exportación es un artefacto con versión, vista previa en la aplicación, transcripción y lista de cortes. Se acepta o se devuelve con motivo como cualquier entregable. |
| Proveedores de voz e imagen | ElevenLabs por conexión para voces, traducción y doblaje. Generación de imagen por conexión para fotogramas de stop motion y portadas. Coste de proveedor registrado por operación. |

### Por sprint

| Sprint | Entrega del estudio | Para qué guion |
| --- | --- | --- |
| S1 | Ingesta, transcripción, silencios, muletillas, subtítulos quemados, exportación 9:16 y 16:9, doblaje de un clip con ElevenLabs, coste por operación. Equipo con rol Editor de vídeo. | Emprendedor: vídeos de captación de Peluguau |
| S2 | Detección de mejores momentos y clips con portada, zoom progresivo, presets de subtítulos por marca, concatenación e intro/cierre con logotipo. Proyectos de medios por cliente con aislamiento. | Agencia: paquete de contenidos de vídeo para un cliente |
| S3 | Stop motion: secuencia de imágenes (subidas o generadas) a vídeo con cadencia, movimiento de cámara y voz en off; traducción completa y doblaje multivoz; vídeos cortos de respuesta o demo para leads. | Comercial: demo de Peluguau en vídeo y piezas por idioma |
| S4 | Plantillas de encargo de vídeo, presets de marca, cola con prioridad y límites por empresa, métricas de coste por minuto producido. | Terceros: producir sin configurar |

### Reglas del estudio

- El agente decide qué cortar; el servicio ejecuta. El agente nunca escribe comandos ffmpeg ni toca archivos a mano.
- Toda operación con proveedor externo (transcripción, voz, imagen) registra coste y recibo; un fallo deja el proyecto recuperable.
- Los archivos de un cliente no se usan en proyectos de otro cliente. La audiencia del artefacto manda.
- Un vídeo exportado es un entregable; publicarlo en una red es otra acción, con su propia autorización, que queda fuera de estos sprints salvo que un guion la pida.

## Reglas de todos los sprints

1. **Company scoping y permisos** en cada ruta, servicio, herramienta y proyección. Un agente nunca ve otra empresa; un contacto nunca es principal.
2. **Misma operación por cualquier entrada.** Persona, agente, rutina o integración usan el mismo servicio de dominio. La interfaz no decide permisos.
3. **Gobierno desde el primer día.** Toda acción externa de agente tiene nivel de autonomía, aprobación cuando toca, presupuesto y auditoría. No se deja para después.
4. **Resultados honestos.** Borrador, enviado, confirmado, fallido e incierto son estados distintos y se ven distintos. Un agente no certifica lo que el proveedor no ha confirmado.
5. **Reintentos sin duplicar.** Claves de idempotencia en creación, conversión, envío y reserva. Un resultado incierto se reconcilia antes de repetir.
6. **Contratos sincronizados** db → shared → server → ui en el mismo PR. Migraciones generadas y numeradas en orden. Mapas y docs actualizados cuando cambia el comportamiento.
7. **Diseño.** Tokens de `ui/src/index.css`, componentes compartidos, pie de formularios según DESIGN.md, `pnpm check:token-gates` antes de cada PR.
8. **Checks.** Verificación estrecha durante el sprint; `pnpm -r typecheck`, `pnpm test:run`, `pnpm build` antes de cerrar.
9. **Un responsable de integración** coordina schema, migraciones, shared, App.tsx, Sidebar y tokens. Trabajo paralelo por páginas, no por identidades duplicadas.

## Pilotos y validación

| Momento | Piloto | Qué se registra |
| --- | --- | --- |
| Fin S1 | Propietario, vídeos de captación de Peluguau | Tiempo, coste por pieza, correcciones, fricción; sesgo de constructor anotado |
| Fin S2 | Agencia real o Peluguau con dos clientes de prueba; formulario y WhatsApp propios | Entrega aceptada por enlace externo, aislamiento probado, leads sin duplicar, correo con recibo, reunión reservada |
| Fin S3 | Leads entrantes reales de Peluguau con autonomía concedida | Lead a propuesta aceptada y proyecto creado sin intervención salvo excepciones; revocación y presupuesto probados |
| S4 | Un emprendedor, una agencia y un comercial externos | Utilidad, tiempo hasta primer resultado, coste, voluntad de pago |

Los guiones de cada caso están en [F0](2026-10-21-producto/2026-10-21-f0-casos-y-evidencias.md). Se rellenan cuando se eligen los casos; no bloquean el inicio de los sprints. Las condiciones de aceptación por recorrido siguen en [Validación](2026-10-21-producto/2026-10-21-validacion-lanzamiento.md).

## Lo que queda fuera de estos cuatro sprints

- Editor de vídeo con línea de tiempo para personas. El estudio es para agentes; la persona revisa y acepta.
- Contabilidad y facturación propia del negocio hacia sus clientes. El enlace de pago Stripe del S3 cobra una señal; la facturación del S4 es la de Paperclip al usuario.
- Servicio alojado completo con garantías de disponibilidad. Es ambición del S4; si no llega, se vende instalación gestionada con el mismo cobro.
- Marketplace público con pagos entre usuarios. El catálogo del S4 publica paquetes gratuitos con revisión.

## Riesgos

| Riesgo | Cómo lo tratamos |
| --- | --- |
| Cuatro sprints con mucho alcance | Columnas Imprescindible y Ambición; se recorta Ambición, nunca el guion |
| S2 demasiado grande para un solo hilo | Subagentes por pista con contrato compartido cerrado los dos primeros días; un responsable de integración; nadie crea identidades propias |
| Alta en Meta (WhatsApp, Messenger, Instagram) y en las redes de publicación | Verificación de negocio, número, plantillas y apps de desarrollador se solicitan el día 1 del S2 porque tardan semanas; cada canal tiene plan B (Telegram, correo, Buffer) para no bloquear la demo |
| Dar autonomía antes de tiempo | Modo sombra y banco de pruebas obligatorios en el S3; `draft_only` por defecto siempre; revocación inmediata |
| Spam y cumplimiento | Consentimiento por canal, bajas con un clic, topes diarios y plantillas aprobadas de Meta; las campañas son ambición y pasan por el mismo gate |
| Cobrar y alojar a terceros sin aislamiento probado | Límites y aislamiento por cuenta se prueban con empresas de distintos titulares en el S4; el servicio alojado es ambición y se ofrece solo con copias, restauración y soporte en marcha |
| El copiloto y los paquetes amplían autoridad sin querer | El copiloto solo hace lo que el usuario podría hacer a mano; un paquete importado nunca trae secretos, contactos ni permisos |
| Correo y calendario dependen de proveedores | Google Workspace ya tiene scopes; la prueba real se hace en la primera semana del S3, no al final |
| Autonomía de envío mal calibrada | Por defecto borrador; subir autonomía es decisión explícita del propietario |
| Mezclar contexto entre clientes | Prueba automática de aislamiento desde el S2; audiencia obligatoria en contexto |
| Construir sin que nadie lo use | Piloto interno desde S1 y externos en S4; las métricas de Inicio son las del piloto |
| El estudio de medios se come el sprint 1 | S1 solo incluye lo que necesita el encargo de Peluguau; clips automáticos, zoom y stop motion van después. Si ffmpeg o la transcripción fallan la primera semana, se registra y se reduce el encargo antes de ampliar |
| Calidad de subtítulos y doblaje insuficiente para publicar | Prueba con la grabación real en la primera semana; el propietario fija el listón; ElevenLabs y transcripción se evalúan con muestras antes de integrarlos del todo |

## Documentos de apoyo

Siguen siendo referencia; el orden de trabajo lo marca este plan.

- [Estrategia de producto](2026-10-21-estrategia-producto-tres-caminos.md): compradores, propuesta de valor y monetización por validar.
- [Comparativa original frente a tras S5](2026-10-21-comparativa-paperclip-original-vs-sprint-5.md): qué se conserva del control plane y qué cambia por área y sprint.
- [F0 y guiones](2026-10-21-producto/2026-10-21-f0-casos-y-evidencias.md): casos reales y qué falta de cada uno.
- [Arquitectura global](2026-10-21-producto/2026-10-21-arquitectura-global.md) y [Contratos](2026-10-21-producto/2026-10-21-contratos-datos-acceso.md): principios de dominio que los sprints aplican.
- [Validación](2026-10-21-producto/2026-10-21-validacion-lanzamiento.md): aceptación por recorrido y casos transversales.
- [Regresión de superficies](2026-10-21-producto/2026-10-21-regresion-superficies.md): qué comprobar cuando un sprint toca una página existente.
- [Inventario de rutas](2026-10-21-producto/2026-10-21-inventario-rutas.md) y fichas de página en `2026-10-21-producto/paginas/`: detalle por pantalla cuando se implemente.
- [Backlog anterior por piloto](2026-10-21-producto/2026-10-21-backlog-fases.md): sustituido por los sprints; se conserva por las referencias G.

## Primer paso

Sprint 1 empieza con el encargo de vídeo de Peluguau. Falta: una grabación o demo de partida, logotipo y marca, cuánto cuesta hoy hacer esos vídeos y el presupuesto de agente y proveedores. Con eso se crea el encargo, se instala el equipo de contenido y se construye el estudio versión 1 y lo imprescindible del S1 sobre un caso real desde el primer día.
