# Capacidades y especialidad de los agentes al crearlos

Estado: propuesta en implementación. Fecha de actualización: 2026-10-27.

## Objetivo

Al crear un agente hay que decir para qué sirve y qué puede hacer. Hay agentes que solo crean y editan vídeo, otros que solo escriben código y otros que hablan con personas. Hoy el asistente de creación (`/agents/new`) no pregunta nada de eso: solo envía nombre, adaptador, modelo, esfuerzo y entorno, y el rol sale solo (`ceo` o `general`).

Además hay que revisar que las listas de modelos estén completas.

## Lo que ya existe y se reutiliza

| Pieza | Dónde | Sirve para |
| --- | --- | --- |
| Permisos por agente (JSON libre) | `agents.permissions`, `PATCH /agents/:id/permissions` (solo tablero, con registro de actividad) | Guardar el perfil sin migración inicial |
| Permisos de empresa por agente | tabla `principal_permission_grants`, claves en `PERMISSION_KEYS` (`packages/shared/src/constants.ts`) | Conceder o quitar una capacidad con trazabilidad |
| Puerta de acciones externas | `external-action-gate.ts`, `autonomy_policies` (por agente y tipo de acción: email, message, call, booking…) | Niveles borrador / con aprobación / directo |
| Llamadas | `server/src/services/voice/` (Speko), herramienta `call_my_phone` solo si el agente tiene un endpoint asignado | Llamar al responsable (no a clientes) |
| Medios y vídeo | `media-tools.ts`, filtrado hoy por modo de trabajo de la tarea, no por agente | Cortar, subtitular, exportar, doblar |
| Perfiles de herramientas | `tool_profile_bindings` con `targetType: "agent"` | Permitir o denegar herramientas externas por agente |
| Catálogos de equipos y habilidades | `packages/teams-catalog`, `packages/skills-catalog` | Plantillas por tipo de agente |

## Lo que falta

- Un paso de «¿Para qué sirve?» en el asistente y que el alta envíe permisos y habilidades.
- Una especialidad por agente. `AGENT_ROLES` es un enum cerrado (ceo, cto, engineer…) y no hay concepto de sector.
- Poder decir «este agente **no** puede escribir a nadie». Hoy el nivel por defecto es «solo borrador», pero no existe «apagado».
- Que el vídeo se controle por agente (hoy lo ve cualquier agente con una ejecución).
- Llamadas a clientes: hoy solo se llama al responsable y no hay quien use el tipo de acción `call`.
- Un panel de capacidades en la ficha del agente (`updateAgentSchema` prohíbe `permissions`).

## Diseño propuesto

1. **Especialidad (presets).** Constantes compartidas con plantillas: Atención al cliente, Ventas, Vídeo y contenido, Código y desarrollo, Operaciones, Personalizado. Cada una fija capacidades por defecto, habilidades sugeridas y modelo sugerido. Se guarda en `agents.metadata.profile` (`specialty`, `sectors[]`) y no ensancha `AGENT_ROLES`.
2. **Capacidades (interruptores en el asistente).**
   - Escribir a personas y clientes (email, WhatsApp, chat, SMS): apagado / borrador / con aprobación / directo. Se traduce a la puerta existente (acciones `message` y `email`).
   - Llamar por teléfono: apagado / con aprobación / directo (acción `call`).
   - Generar y editar vídeo y medios: sí / no.
   - Trabajar con código y repositorios: sí / no.
3. **Dónde se guarda.** Como permisos de empresa por agente (`channels:message`, `channels:call`, `media:generate`, `code:write`) en `principal_permission_grants`. El nivel de aprobación sigue en `autonomy_policies`. El asistente los crea al contratar.
4. **Dónde se hace cumplir (servidor, no en el prompt).**
   - Mensajes: servicio de conversaciones, antes de la puerta de acciones externas.
   - Llamadas: listado de herramientas de voz y un nuevo paso de puerta para `call`.
   - Vídeo: filtro de `mediaToolDefinitions` y rutas de `media-studio`.
   - Un agente con clave propia puede llamar a REST directamente, así que la comprobación va en el servicio y no solo en el listado de herramientas.
5. **Agentes existentes.** Se conservan sus capacidades actuales (migración que concede lo que hoy pueden hacer) para no romper nada. Solo los nuevos arrancan según el preset.
6. **Editar después.** Panel «Capacidades» en la ficha del agente, con `PATCH /agents/:id/permissions` (solo tablero) y registro de actividad.

## Fases

| Fase | Contenido | Despliegue |
| --- | --- | --- |
| 0 | Modelos: Haiku 5.5 en el selector (hecho en local), Bedrock, respaldos de Cursor y OpenCode, pruebas y auditoría | Solo interfaz y adaptador |
| 1 | Claves de permiso, comprobaciones en servidor, migración de agentes existentes, pruebas | Con servidor (despliegue completo) |
| 2 | Paso «¿Para qué sirve?», presets y panel de capacidades en la ficha | Interfaz |
| 3 | Sectores en catálogos y llamadas salientes a clientes | Aparte; hay que decidir proveedor y consentimientos |

## Modelos: auditoría

- **Claude directo:** añadido `claude-haiku-5-5`. Mythos 5 cae en el esfuerzo por defecto (`low|medium|high`); falta confirmar qué admite. No hay versión mínima de Claude Code para Haiku 5.5.
- **Claude en Bedrock:** faltan Haiku 5.5 y Mythos 5; no se conoce el identificador regional de Haiku 5.5.
- **Cursor y OpenCode (listas de respaldo):** faltan `claude-sonnet-5-5`, `claude-haiku-5-5` y `claude-opus-5`; las listas reales se completan con lo que devuelve la CLI, así que solo afecta cuando no hay CLI.
- **Codex, Gemini, Grok y Kimi:** no se puede comprobar contra el catálogo del proveedor sin consultarlo; hay que confirmarlo con el usuario o con una búsqueda.
- **Pruebas y doc:** añadir Haiku 5.5 en `server/src/__tests__/adapter-models.test.ts` y `claude-local/src/index.test.ts`, y una fila en la auditoría de modelos.

## Cumplimiento del repositorio

Esquema o permisos compartidos en `packages/shared`, servidor, interfaz y clientes de API sincronizados; registro de actividad en cada cambio; mapas `maps/feature-map` y `maps/agent-access-map` (agentes, acciones externas, canales); `pnpm check:token-gates`, `node scripts/check-maps.mjs` y la verificación completa antes de entregar.

## Decisiones tomadas (2026-10-24)

1. Las capacidades viven como permisos de empresa por agente (`principal_permission_grants`); el nivel de aprobación sigue en `autonomy_policies`.
2. «Escribir a personas y clientes» tiene cuatro niveles: apagado, solo borrador, con aprobación y directo.
3. Los agentes existentes conservan lo que pueden hacer hoy; solo los nuevos arrancan según su especialidad.
4. «Llamar» en la primera entrega es el interruptor más las llamadas al responsable. Las llamadas a clientes quedan para la fase 3.

## Orden de trabajo

1. Fase 0 (modelos), sin desplegar hasta que lo indiques.
2. Fase 1 (permisos y cumplimiento en servidor) con pruebas y migración de agentes existentes.
3. Fase 2 (asistente de creación y panel de capacidades).

## Primera entrega de mensajes por canal (2026-10-27)

- `agents.metadata.profile.messageChannels` guarda una allowlist opcional para los canales de conversación saliente con transporte en Paperclip: email, WhatsApp, Messenger, Instagram, Telegram, webchat y SMS. Voz queda bajo el permiso de llamadas.
- Los presets iniciales permiten email, WhatsApp y webchat para atención al cliente; email y WhatsApp para ventas; las demás especialidades empiezan sin canales de mensajería.
- El envío comprueba la allowlist antes de crear una acción pendiente y justo antes de entregar. Una aprobación o reintento no conserva un permiso que el tablero haya revocado.
- Si el campo no existe, el agente conserva el comportamiento anterior. Una lista vacía deniega todos los canales de conversación.
- El primer agente, el alta normal y el panel de capacidades comparten el selector; los textos nuevos se mantienen en inglés y español.
- Esta entrega cubre el servicio de conversaciones CRM. Los conectores nativos de chat siguen ligados al agente asignado al endpoint y no forman parte de esta allowlist.

## Medios por acción y Motor Video (2026-10-27)

- Los permisos de medios se separan en `media:analyze`, `media:edit` y `media:create_video`; la interfaz los guarda como `mediaAnalyze`, `mediaEdit` y `mediaCreateVideo`. `video` se mantiene como agregado compatible.
- El grant antiguo `media:generate` sigue autorizando las tres acciones para agentes ya configurados. Al guardar capacidades granulares, Paperclip reemplaza el grant general por los grants seleccionados. Las hires pendientes conservan las opciones al activarse.
- Los proyectos de vídeo generados pueden no tener archivo fuente. El render se encola como trabajo durable y enlaza el MP4 a la tarea como artefacto de medios.
- La cola permite cancelar cualquier trabajo pendiente. Un render Motor Video en curso acepta cancelación y pasa por `cancel_requested`; al empezar la publicación pasa a `finalizing` y ya no se cancela. Los demás procesadores no admiten cancelación activa.
- Paperclip ejecuta el CLI instalado de Motor Video en un proceso sin shell, con recursos de almacenamiento autorizados y rutas locales controladas. El despliegue debe provisionar el CLI, Remotion, un navegador y FFmpeg; consulta [configuración del render](../media-video-rendering.md).
- Las especificaciones requieren duración explícita y assets de Paperclip accesibles. No se admiten nodos de generación de imagen ni voz sintetizada hasta conectar proveedores y permisos separados. La música determinista local del motor sí se admite.
- La migración `0368_media_projects_motor_video` está generada, pero aún no aplicada ni verificada en una instancia. La integración tampoco tiene prueba de render en la VPS; el runtime debe desplegarse y configurarse antes de habilitar la acción.
- Los textos de esta entrega se mantienen únicamente en inglés y español.

## 2026-10-28: permisos por tipo de agente

El formulario compartido agrupa los permisos por especialidad. Atención al cliente y Ventas comparten mensajes y llamadas; Vídeo y contenido ofrece acciones de medios; Código ofrece su indicador de función con aviso sobre los límites del adaptador; Operaciones muestra su alcance actual sin controles sin implementar. Personalizado permite combinar las opciones. La interfaz y el servidor usan el mismo catálogo al contratar y guardar. Los agentes anteriores conservan sus permisos hasta una edición explícita; la interfaz avisa si guardar retirará permisos ajenos al tipo seleccionado. No se realiza una migración automática.


## 2026-10-29: ejecución de permisos de Código y Operaciones

- `metadata.profile.workPermissions` añade restricciones explícitas sobre tareas, proyectos, documentos/archivos y herramientas de workspace. La ausencia conserva los permisos anteriores; no hay migración automática ni nuevas concesiones. Se mantienen los permisos de compañía, privacidad, aprobaciones y asignación existentes.
- Los formularios de contratación, onboarding y edición guardan las mismas opciones. Los tipos de agente limitan las opciones disponibles; los guardados explícitos normalizan la política al tipo. El onboarding restaura estas opciones desde su borrador.
- La API aplica la política a rutas de recursos y llamadas MCP, y el Runner la comprueba antes de ejecutar sus herramientas directas. Las escrituras de metadatos de agentes no pueden eliminar ni ampliar las políticas del operador. Los comandos arbitrarios de workspace requieren lectura, escritura y ejecución para evitar eludir los controles de archivos; las lecturas de ficheros para publicar entregables también requieren permiso de lectura.
- Codex legado admite `codeAdapterAccess: read_only | workspace_write`: se selecciona el motor CLI, se impide la ampliación de sandbox, se eliminan argumentos avanzados y raíces de escritura adicionales que podrían anular la política. Se comprueba el arranque del sandbox con un comando fijo sin modelo antes de ejecutar el agente y en el test del entorno. Cambiar de adaptador a uno incompatible bloquea la ejecución hasta que el operador ajuste la política. El límite de Codex se aplica al siguiente arranque; no modifica procesos que ya están ejecutándose.
- Los interruptores de workspace controlan herramientas proporcionadas por Paperclip, actualmente el bridge controlado de Dot. La interfaz muestra su disponibilidad y la de ejecución de comandos. Las herramientas propias de otros adaptadores y los servicios externos mantienen sus controles independientes. Codex puede ejecutar comandos dentro de su sandbox; no se ofrece una garantía de desactivar comandos propios de Codex por separado.
- La prueba real en contenedores efímeros sin red, sin secretos de instancia y sin montajes de producción detectó que el runtime actual de la VPS no admite iniciar el sandbox de Codex (restricciones de namespaces/montajes de Docker). La prueba con Landlock también falló. No se ha debilitado la configuración del servicio activo. Antes de usar esos modos en producción hay que provisionar un entorno de ejecución compatible; la comprobación falla sin volver a bypass.
- Validación: 106 pruebas locales correctas y seis integraciones omitidas en Windows; las 31 pruebas del servidor, incluidas esas seis, pasaron en un contenedor Linux con PostgreSQL aislado. TypeScript del servidor, UI y adaptador Codex sin errores; controles visuales e interacción verificados en móvil y escritorio. La compilación completa de UI queda bloqueada por un import ajeno a esta entrega: falta `components/inbox/ConversationSetup`, importado por `ConversationInbox.tsx`. Estos cambios de permisos todavía no están desplegados.
