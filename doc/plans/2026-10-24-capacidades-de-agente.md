# Capacidades y especialidad de los agentes al crearlos

Estado: propuesta para decidir. Fecha: 2026-10-24.

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
