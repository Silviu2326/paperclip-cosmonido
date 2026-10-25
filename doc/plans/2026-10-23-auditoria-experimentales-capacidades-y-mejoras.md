# Auditoría de los experimentales de Paperclip: capacidades, problemas y resultado esperado

Fecha: 23 de octubre de 2026. Estado: diagnóstico y propuesta; no implementado.

## 1. Qué se está evaluando

La pregunta es si cada experimental permite resolver un trabajo completo y con calidad: preparar la empresa, operar agentes, producir resultados, revisarlos y recuperarse de un fallo. Que un interruptor guarde su valor o aparezca una pantalla no basta.

Este documento desarrolla los diez experimentales con mayor valor potencial para ese objetivo y revisa los otros ajustes de la sección. MCP y Chat con agentes reciben más profundidad porque pueden convertirse en las principales formas de operar Paperclip.

Cobertura del inventario de pantalla: **33 controles bajo sus condiciones de visibilidad** —diez desarrollados en profundidad, catorce fichas de producto y nueve de desarrollo/heredados— más el control de sala de conferencias presente en código pero oculto. La configuración del operador puede ocultar más controles.

El orden expresa una prioridad de producto para este caso de uso, no una clasificación universal. No se han utilizado puntuaciones numéricas de madurez sin mediciones que las respalden.

### Cómo interpretar los hallazgos

- **C — Comprobado en código:** comportamiento presente o ausencia constatada en la superficie inspeccionada. No significa que se haya reproducido en una instancia real.
- **L — Límite deliberado:** alcance actual del producto. Puede impedir un recorrido importante sin ser una avería.
- **M — Mejora de producto:** propuesta para elevar la utilidad o calidad. No se presenta como un fallo demostrado.
- **V — Pendiente de validación:** riesgo o cuestión que exige una prueba real antes de atribuirle un defecto.

Prioridades: **P1** impide completar un recorrido central o puede mostrar información equivocada; **P2** limita utilidad, calidad o recuperación; **P3** mejora claridad o comodidad.

Las fuentes describen el checkout local. No certifican que una instalación desplegada tenga la misma versión, capacidades, permisos o configuración. Los informes históricos del repositorio se citan como evidencia histórica, no como pruebas ejecutadas hoy.

### Rectificaciones respecto a la revisión breve

1. No es correcto decir que MCP solo permite tareas: la conexión directa ya registra **37 herramientas**, incluidas edición de agentes, creación de proyectos y creación/edición de habilidades.
2. Hay dos superficies: la conexión directa ampliada y el intermediario del directorio, cuyo contrato histórico conserva diez herramientas. Esto puede explicar un catálogo reducido; hay que identificar la conexión real antes de concluirlo.
3. Las tarjetas de estado pueden utilizar un agente específico por tarjeta. El Summarizer integrado es la alternativa cuando no hay uno válido; no es su única posibilidad.
4. Que un test simule Runner desactivado no demuestra un defecto del valor por defecto. El esquema actual lo activa por defecto en instalaciones propias. El problema que corresponde revisar es la coherencia de la explicación y de las capacidades efectivas.
5. No se propone eliminar límites de seguridad para ampliar funciones: se conservan permisos, separación entre empresas, aprobaciones, presupuestos y autoría.

## 2. Conclusión de producto

Paperclip tiene más infraestructura de la que su experiencia de uso deja ver. Hay documentos versionados, tareas duraderas, permisos, deduplicación, agentes integrados, controles de ejecución y recuperación. La debilidad transversal es que varias capacidades siguen siendo piezas independientes que el usuario o el modelo deben unir.

El objetivo debería ser convertir esas piezas en recorridos verificables. Por ejemplo: «crear un equipo para este proyecto» debe terminar con agentes preparados, habilidades asignadas, conexiones válidas, límites de gasto y una tarea de prueba con resultado inspeccionable. «Hablar con un agente» debe permitir organizar temas, delimitar contexto, aprobar un plan cuando proceda, delegar y seguir la entrega sin perder el vínculo con la conversación.

| Orden | Experimental | Lo que merece conservarse | Salto de calidad necesario |
| --- | --- | --- | --- |
| 1 | Conexiones de asistentes — MCP | Operaciones autorizadas sobre trabajo y configuración | Operar una empresa completa mediante herramientas y habilidades de flujo |
| 2 | Chat con agentes | Conversaciones persistentes sobre tareas y ejecución real | Entorno de coordinación, contexto y entrega, con calidad verificable |
| 3 | Espacios de trabajo aislados | Separación de archivos y políticas por tarea/proyecto | Preparación, integración y recuperación comprensibles |
| 4 | Paperclip Runner | Ejecución controlada y límites de autoridad | Compatibilidad y preparación visibles antes de ejecutar |
| 5 | Conectores de memoria | Proveedores e instrucciones de uso ya integrados | Memoria útil, delimitada y comprobable entre tareas |
| 6 | Bots de revisión de GitHub | Identidad propia, acceso a repositorios y gestión | Revisiones accionables, actualizadas y con control operativo claro |
| 7 | Resúmenes | Versiones y tareas de generación rastreables | Preparación guiada y resúmenes fiables para decidir |
| 8 | Visor de archivos | Inspección protegida desde el trabajo | Acceso consistente a resultados locales y remotos |
| 9 | Objetos externos | Detección, proveedores y estados de enlaces | Estados que sigan siendo correctos después de cierres y reaperturas |
| 10 | Tarjetas de estado | Tablero compartido con políticas de actualización | Seguimiento explicable, coste controlado y dependencias resueltas |

## 3. MCP: de conector con herramientas a forma completa de operar la empresa

### Descripción y funcionamiento actual

El MCP público conecta a un asistente externo **como la persona autenticada**, con acceso a una empresa seleccionada. No suplanta al agente. La ejecución posterior usa los agentes, presupuestos, entornos y aprobaciones de Paperclip.

La conexión directa registra 37 herramientas: identidad, consulta de agentes/proyectos/tareas, creación y edición de tareas, comentarios, documentos y revisiones, entregables, transferencias de archivos, edición de agentes e instrucciones, proyectos/repositorios, habilidades y descubrimiento de operaciones autorizadas. `paperclip_call_api` llama operaciones registradas; no abre toda la API REST.

El plugin de asistentes contiene tres habilidades compartidas: `review-my-team`, `delegate-work` y `follow-up-results`. Son recetas de uso; no equivalen a las habilidades de empresa que un agente ejecuta en Paperclip. Añadir una receta al plugin no crea una herramienta ni amplía permisos.

### Lo bueno que ya tiene

- Reutiliza rutas y autorización del dominio en lugar de inventar otra autoridad paralela.
- Mantiene identidad humana, empresa, scopes, revocación y auditoría.
- Usa identidad de reintento para reducir duplicados y reconoce resultados inciertos.
- Permite trabajar con documentos duraderos, revisiones y archivos; ya supera un conector de consulta.
- La configuración de agentes evita devolver credenciales y comandos arbitrarios.
- Hay pruebas de integración y evaluaciones históricas de las herramientas ampliadas; son una base que debe conservarse.

### Problemas y soluciones

| ID / prioridad | Problema actual y efecto | Tipo | Cómo solucionarlo |
| --- | --- | --- | --- |
| MCP-01 / P1 | No hay herramienta pública para crear o contratar agentes. Una empresa sin equipo no puede completar su preparación desde MCP. | L | Añadir preparación y contratación sobre las rutas de creación/contratación existentes. Seleccionar plantilla, rol, responsable, runtime compatible, habilidades y presupuesto. Respetar las aprobaciones que correspondan y devolver el estado real de preparación. |
| MCP-02 / P1 | El catálogo disponible depende de la vía de conexión: el contrato del directorio mantiene diez herramientas y la conexión directa tiene 37. El usuario puede creer que falta toda la ampliación. La instalación concreta no está identificada. | L/V | Exponer versión y capacidades efectivas de la conexión. Mostrar qué vía se está usando, herramientas disponibles, límites y cómo conectar a la superficie ampliada cuando esté soportada. Probar ambas vías por separado. |
| MCP-03 / P1 | Tres habilidades de flujo no cubren el alcance de las herramientas ampliadas. Faltan recorridos guiados para equipo, configuración, proyectos, documentos y mantenimiento de habilidades. | C/M | Ampliar el paquete con las recetas de la tabla siguiente, compartidas entre clientes y verificadas con resultados guardados. No añadir recetas que prometan operaciones aún inexistentes. |
| MCP-04 / P1 | La biblioteca pública permite crear, leer y editar habilidades, pero no ofrece el ciclo completo de fuentes/importación/actualización/eliminación. Crear una habilidad Markdown no resuelve instalar y mantener un conjunto existente. | L | Añadir operaciones acotadas para buscar fuentes permitidas, previsualizar una importación, instalar versiones, comprobar actualizaciones, asignar y retirar. Reutilizar política, procedencia y validación del sistema de habilidades. |
| MCP-05 / P2 | Los grants antiguos no ganan `paperclip:configure` al refrescarse. Una herramienta visible puede fallar por consentimiento insuficiente. | C/L | Conservar el requisito de nuevo consentimiento y diagnosticarlo con una acción de reconexión concreta; distinguir falta de scope, falta de permiso y operación no disponible. |
| MCP-06 / P2 | Los errores públicos preservan privacidad, pero agrupan muchos 400/422 en el mismo mensaje. El asistente puede no saber qué campo o condición debe corregir. | C | Ampliar la lista de detalles seguros: campo, código estable, valores permitidos, requisito pendiente y acción siguiente. Mantener secretos y detalles internos fuera de la respuesta. |
| MCP-07 / P2 | Configurar modelo y habilidades no equivale a dejar un agente ejecutable. Las operaciones públicas excluyen credenciales y ciclo de ejecución; no hay un recorrido público completo de preparación y prueba. | L/M | Añadir un diagnóstico sin secretos: conexión existente, permisos, entorno, modelo, presupuesto y prueba breve. Las credenciales se resuelven en la interfaz autorizada y el asistente retoma el flujo al confirmarse. |
| MCP-08 / P2 | El seguimiento por eventos depende del cliente; las suscripciones expiran y no tienen cursor de replay. Una conexión normal de herramientas no garantiza vigilancia autónoma. | C/L | Publicar soporte efectivo del cliente, renovar desde el host y reconciliar estado después de una desconexión. Diseñar recuperación de eventos si se incorpora replay; mientras tanto, explicar el seguimiento bajo demanda. |
| MCP-09 / P2 | Exponer herramientas no enseña por sí solo a elegir agente, construir un buen encargo o verificar una entrega. El catálogo de operaciones no sustituye un flujo de trabajo. | M | Incorporar recetas con precondiciones, preguntas mínimas, resultados esperados, verificación y recuperación. Medir si completan trabajos, no cuántas llamadas hacen. |
| MCP-10 / P2 | No hay paridad completa entre operar desde la interfaz y operar desde MCP: aprobaciones y varias acciones administrativas siguen fuera de su superficie deliberadamente. | L | Publicar una matriz de cobertura. Para cada hueco decidir entre herramienta autorizada, preparación con aprobación en UI o enlace contextual; no simular que un comando genérico elimina el límite. |

### Habilidades de flujo que debería incorporar

Son propuestas para el plugin del asistente. Las habilidades instalables de empresa seguirían siendo otra capa.

| Habilidad propuesta | Resultado útil | Qué exige |
| --- | --- | --- |
| Diagnosticar conexión | Explicar vía directa/directorio, versión, permisos y capacidades | Diagnóstico de capacidades efectivas |
| Preparar empresa | Inventario de agentes, proyectos, conexiones y carencias operativas | Lecturas actuales y diagnóstico de preparación |
| Crear equipo | Equipo configurado para un objetivo, con roles y responsabilidades | Nuevas operaciones de contratación |
| Preparar agente | Modelo, instrucciones, habilidades, conexión y prueba de ejecución | Herramientas actuales más diagnóstico y prueba autorizada |
| Diseñar y lanzar proyecto | Proyecto, repositorios y tareas coherentes con criterios de entrega | Herramientas actuales; mejorar preparación y enlaces entre resultados |
| Crear y mantener habilidades | Instrucciones, archivos y revisión de versiones | Herramientas actuales de habilidades |
| Importar un conjunto de habilidades | Fuente verificada, instalación y asignaciones | Ampliación de fuentes/importación |
| Delegar trabajo con calidad | Tarea con contexto, plan pertinente, archivos y aceptación | Ampliar la receta actual y, donde falte, el contrato de creación |
| Revisar entregables | Leer resultados reales, señalar faltantes y solicitar cambios | Lectura/documentos/entregables actuales; aprobación gobernada aparte |
| Resolver bloqueos | Diagnóstico y acción autorizada, con responsable claro | Lecturas y mutaciones acotadas; sin saltar gates |
| Revisar capacidad y costes | Identificar agentes sin capacidad y gasto relevante | Añadir vistas públicas de capacidad/costes sin credenciales |
| Seguir resultados | Recuperar avances y entregas tras otra conversación o una desconexión | Receta existente ampliada y capacidades reales de eventos |

### Cómo quedaría

«Crea un equipo de desarrollo para este repositorio» iniciaría un recorrido que entiende el objetivo, propone roles cuando haga falta decidir, prepara los agentes autorizados, instala o asigna habilidades, diagnostica la ejecución y entrega enlaces a equipo, proyecto y primera tarea. Si falta una aprobación o una credencial, muestra ese requisito y permite continuar después sin repetir lo ya hecho.

### Criterios de aceptación

1. Empresa sin agentes → contratación autorizada → habilidades → tarea → documento/archivo de resultado, con estado comprobado.
2. Conexión del directorio y conexión directa informan con precisión sus diferencias.
3. Una denegación explica cómo resolverla; un reintento no crea otro agente, habilidad o tarea.
4. El mismo recorrido se prueba con permisos de lectura, escritura y configuración, revocación y empresa incorrecta.
5. Las nuevas recetas se evalúan con resultados persistidos, errores y recuperación, además de descubrir herramientas.

Fuentes: [capacidades base](../../server/src/services/public-mcp/capabilities.ts), [capacidades ampliadas](../../server/src/services/public-mcp/expanded-capabilities.ts), [errores y contrato](../../server/src/services/public-mcp/contracts.ts), [ingreso MCP](../../server/src/routes/public-mcp.ts), [plugin y distribución](../../integrations/assistant-plugins/README.md), [habilidades actuales](../../integrations/assistant-plugins/shared/skills/), [contrato de ampliación](2026-10-06-expanded-assistant-mcp-tools.md), [verificación histórica](2026-10-06-expanded-assistant-mcp-verification.md), [guía MCP](../public-mcp.md).

## 4. Chat con agentes: de conversación persistente a espacio de coordinación

### Descripción y funcionamiento actual

Existe una conversación canónica por persona, agente y empresa, respaldada por una tarea. La interfaz reutiliza la superficie de detalle de tareas: transcript, compositor, controles y paneles de trabajo. Las conversaciones pueden planificar y delegar, pero no deben convertirse en tareas de implementación. El trabajo ejecutable se entrega a tareas ordinarias.

`/new` crea una frontera de sesión sin borrar documentos, historial o archivos. Hay controles contra respuestas tardías de sesiones canceladas, conservación de contexto y copiado del plan a tareas de ejecución. El requisito de seleccionar un proyecto adecuado sigue siendo, según el contrato documentado, una instrucción al modelo; no una obligación global de todas las tareas.

### Lo bueno que ya tiene

- Persistencia, identidad y separación entre empresas; no es una conversación desechable.
- Planes, archivos y tareas vinculadas pueden sobrevivir a una sesión.
- La creación de tarea con su plan tiene soporte atómico; no debe reconstruirse como varias escrituras inseguras.
- Hay modos de interacción, controles de ejecución y mecanismos de reset/cancelación.
- La navegación contempla agentes favoritos, conversaciones recientes y agente principal.
- Existe evidencia histórica de recorridos reales y correcciones de regresiones. No se parte de cero.

### Problemas y soluciones

| ID / prioridad | Problema actual y efecto | Tipo | Cómo solucionarlo |
| --- | --- | --- | --- |
| CHAT-01 / P1 | Una conversación canónica por agente mezcla asuntos sucesivos. `/new` reinicia contexto, pero no crea por sí mismo una colección de conversaciones nombradas e independientes. | L | Incorporar temas o sesiones nombradas dentro de la identidad actual, con archivo y reapertura. Empezar por una lista navegable; no crear una tarea ejecutable por cada agrupación visual. |
| CHAT-02 / P1 | La calidad de selección de proyecto y traspaso depende en parte de instrucciones al modelo. Una charla convincente puede producir un encargo insuficiente. | C/M | Añadir preparación estructurada del encargo: objetivo, contexto, proyecto, responsable, plan aprobado aplicable, archivos y criterios de entrega. Validar los requisitos del flujo de chat en el servidor sin prohibir tareas sin proyecto en otros flujos legítimos. |
| CHAT-03 / P1 | Tener muchas herramientas y un transcript no garantiza una experiencia de coordinación clara. Falta evaluar si el usuario distingue conversación, propuesta, tarea creada, ejecución y entrega. | M/V | Mostrar una secuencia de trabajo basada en hechos: propuesta pendiente, tareas efectivamente creadas, ejecución observada y resultado publicado. Reutilizar tarjetas existentes; no generar más ruido de actividad. |
| CHAT-04 / P2 | El selector inspeccionado busca agentes. No es un buscador de decisiones, mensajes, entregables y temas de conversaciones. | C/L | Añadir búsqueda de historial por contenido, tema, proyecto, fecha y documentos, con enlaces a la posición y permisos vigentes. |
| CHAT-05 / P2 | La frontera de sesión mantiene el historial, pero el usuario necesita saber qué contexto recibe el agente ahora. Historial visible y contexto activo no son equivalentes. | C/M | Mostrar el ámbito activo y permitir fijar referencias concretas: proyecto, documentos, archivos y decisiones. Señalar qué conserva `/new` y qué deja de formar parte del replay automático. |
| CHAT-06 / P2 | Compartir la superficie de tareas reduce duplicación, pero puede arrastrar una presentación demasiado genérica para conversaciones largas y coordinación de trabajo. | M | Diseñar la experiencia de chat sobre el controlador compartido: composición clara, contexto accesible, decisiones localizables y entregas agrupadas. Evitar duplicar el motor de comentarios, permisos o ejecución. |
| CHAT-07 / P2 | Los controles de ejecución no resuelven por sí solos errores de coordinación: tarea creada con contexto equivocado, plan revisado después o varios encargos relacionados. | M/V | Permitir inspeccionar el encargo enviado, enlazar su revisión de origen y enviar correcciones como nuevas instrucciones trazables. No sustituir silenciosamente un plan aceptado ni reiniciar todos los trabajos. |
| CHAT-08 / P2 | La vuelta de resultados a la conversación necesita pruebas de calidad actuales: que llegue la entrega correcta, que no duplique mensajes y que el agente no dé por verificado lo que solo terminó. Hay mecanismos existentes, pero no se han probado en vivo en esta auditoría. | V | E2E de principio a fin con resultados persistidos y evaluación de contenido: éxito, bloqueo, entrega incompleta, corrección, desconexión y cancelación. Mostrar fuentes y archivos reales. |
| CHAT-09 / P2 | Poder elegir un agente no ayuda suficientemente a descubrir qué puede hacer o qué le falta para ejecutar el encargo. | M | Mostrar capacidades y preparación útiles: habilidades aplicables, herramientas asignadas, modelo/entorno disponible y límite pertinente. Evitar volcar configuración técnica o secretos. |
| CHAT-10 / P2 | La estructura compartida no garantiza buena experiencia con historial largo, móvil, cambio de agente y borradores. Existen fixtures/pruebas históricas; falta medir la experiencia real actual. | V | Ensayar lectura, búsqueda, composición, adjuntos, cambio de tema/agente y reconexión con historiales representativos. Conservar borrador y posición de lectura. |
| CHAT-11 / P2 | Ocho pruebas actuales de entrada/selector fallaron porque comparan textos literales en inglés con la UI renderizada en español. Es un fallo de validación localizado; no demuestra que esas acciones estén rotas. | C | Fijar y restaurar explícitamente el idioma en pruebas de copy, usar traducciones/selectores semánticos en pruebas de comportamiento y conservar casos separados de español e inglés. |

### Cómo quedaría

El usuario abriría un agente, vería para qué sirve y qué puede ejecutar, escogería un tema y aportaría contexto. Podría investigar o planificar sin ejecutar. Cuando encargase trabajo, vería qué tareas se han creado, quién responde y qué resultados se esperan. Las entregas volverían al tema con evidencias y permitirían solicitar cambios sin reconstruir el encargo.

La mejora no consiste en añadir una sala multiagente ni convertir Paperclip en un chat general. El centro siguen siendo empresa, proyectos, tareas, decisiones y entregables.

### Criterios de aceptación

1. Dos temas con el mismo agente no contaminan su contexto por defecto.
2. Un plan revisado y aceptado se copia a los encargos con su procedencia verificable.
3. El chat diferencia «propuesto», «creado», «en ejecución», «bloqueado» y «entregado» con datos del servidor.
4. El usuario encuentra una decisión antigua y el resultado relacionado sin recorrer todo el transcript.
5. Stop → `/new` → nuevo mensaje no admite respuestas tardías de la sesión anterior.
6. Una entrega incompleta admite corrección y mantiene la relación con tarea, plan y archivos originales.

Fuentes: [contrato y evolución del chat](2026-09-10-agent-chat.md), [directiva y persistencia](../../server/src/services/agent-conversations.ts), [página de chat](../../ui/src/pages/AgentChat.tsx), [entrada y recuperación](../../ui/src/pages/AgentChats.tsx), [selector](../../ui/src/components/AgentChatPicker.tsx), [contexto del plan delegado](../../server/src/services/native-runtime/handoff-plan-context.ts), [workspace del chat](../../server/src/services/native-runtime/native-chat-workspace.ts).

## 5. Espacios de trabajo aislados

### Descripción y puntos fuertes

Permiten políticas de workspace y, cuando corresponde, copias Git por tarea. Hay precedencia entre decisiones de proyecto y valores por defecto, controles de pertenencia, inspección, reconciliación, recuperación y protección frente a limpieza insegura. El valor «aislados por defecto» no pisa una política explícita del proyecto.

### Problemas y soluciones

| ID / prioridad | Problema y efecto | Tipo | Solución |
| --- | --- | --- | --- |
| WS-01 / P1 | Activar el flag no garantiza un repositorio y estrategia utilizables. Un chat o tarea sin proyecto no debe recibir automáticamente un worktree imposible. | C/L | Diagnóstico previo por proyecto/tarea; mostrar estrategia efectiva y preparar una carpeta gestionada cuando corresponda. |
| WS-02 / P1 | Una copia Git separa archivos, pero no demuestra aislamiento de red, credenciales o procesos. El nombre puede llevar a esperar una garantía mayor. | L/M | Separar en la explicación y diagnóstico aislamiento de archivos y aislamiento del entorno. Aplicar el entorno que exija la política real. |
| WS-03 / P2 | La reconciliación exige repositorio válido, rama, limpieza, inactividad y servicios parados. Exponer solo un error deja el recorrido sin resolver. | C/M | Convertir los diagnósticos existentes en acciones concretas: terminar ejecución, conservar cambios, detener servicios propios y reconciliar cuando sea válido. No borrar trabajo para forzar el estado limpio. |
| WS-04 / P2 | Crear un workspace no define cómo se integra su resultado en el proyecto. Debe verificarse el recorrido real hasta entrega y revisión. | M/V | Mostrar rama y destino, cambios, pruebas y entrega/PR disponible; mantener la revisión normal. |
| WS-05 / P2 | Aislamiento por defecto añade copias, procesos y mantenimiento. La selección por proyecto puede resultar difícil de entender. | M | Ofrecer política efectiva con su procedencia y visibilidad de recursos activos; conservar limpieza protegida y explicar por qué se retiene un espacio. |
| WS-06 / P2 | Varias tareas con base antigua pueden trabajar correctamente aisladas y aun así producir conflictos de integración. | V/M | Pruebas concurrentes e integración con cambios incompatibles; resolverlos con tareas y evidencia, sin prometer que el aislamiento elimina los conflictos. |

### Resultado esperado y aceptación

El usuario elige el proyecto y Paperclip prepara la estrategia válida, explica el aislamiento conseguido y muestra cómo recuperar e integrar el resultado. Se acepta al demostrar dos tareas concurrentes, una con cambios incompatibles, preservando archivos y permisos, y al recuperar un workspace sucio sin pérdida de trabajo.

Fuentes: [política](../../server/src/services/execution-workspace-policy.ts), [ciclo de vida](../../server/src/services/execution-workspaces.ts), [workspace de chat](../../server/src/services/native-runtime/native-chat-workspace.ts).

## 6. Paperclip Runner

### Descripción y puntos fuertes

Es infraestructura de ejecución, no una habilidad del asistente. Integra runtime, herramientas y controles de ciclo de vida. El catálogo contempla Codex, OpenCode y adaptadores ACPX calificados. Hay mecanismos de recuperación, control de sesiones y comprobaciones de compatibilidad. El esquema actual usa `enableNativeRunner: true` como valor por defecto self-hosted.

### Problemas y soluciones

| ID / prioridad | Problema y efecto | Tipo | Solución |
| --- | --- | --- | --- |
| RUN-01 / P2 | El texto español del ajuste habla de nuevos agentes Codex y no expresa todo el alcance del catálogo actual. | C | Generar o mantener una explicación coherente con la matriz de proveedores efectiva. |
| RUN-02 / P1 | El flag habilitado no certifica que binario, proveedor, modelo, conexión y entorno estén preparados. | L/M | Diagnóstico de preparación antes de crear/configurar el agente y prueba breve con fallo accionable. |
| RUN-03 / P2 | La calificación ACPX puede depender del candidato y modelo exactos autorizados por el operador. La categoría «compatible» es demasiado amplia si no se precisa. | C/L | Publicar combinaciones verificadas por entorno y versión; distinguir disponible, calificado y no soportado. |
| RUN-04 / P2 | Desactivar el ajuste oculta la elección; no equivale a detener ejecuciones nativas existentes. | L | Separar habilitación para nuevos agentes de pausa/cancelación operativa; enlazar a las ejecuciones afectadas. |
| RUN-05 / P2 | La compatibilidad en un proveedor o entorno no demuestra paridad en los demás. Esta auditoría no ejecutó agentes reales. | V | Matriz de pruebas: arranque, herramientas, preguntas, archivos, pausa, cancelación, reinicio y entrega por combinación soportada. |
| RUN-06 / P2 | Recuperación, actualización del binario y cambios de configuración pueden ser difíciles de interpretar desde el producto. | M/V | Mostrar versión, prueba de salud, cambio aplicado y recuperación observada cuando sean necesarios para resolver un fallo. No pedir al usuario certificar leases o procesos internos. |

### Resultado esperado y aceptación

Al elegir un runtime, el usuario sabe si funciona en ese equipo y entorno, qué conexión utiliza y cómo probarlo. Debe completar una tarea, pausarla, reanudar lo permitido, sobrevivir a un reinicio y publicar un archivo real sin duplicar la ejecución. Los informes muestran la combinación exacta probada.

Fuentes: [catálogo](../../packages/shared/src/feature-catalog.ts), [valores del esquema](../../packages/shared/src/validators/instance.ts), [calificación ACPX](../../server/src/services/native-runtime/acpx-qualification.ts), [compatibilidad Codex](../../server/src/services/native-runtime/codex-runtime-compatibility.ts), [texto español](../../ui/src/i18n/locales/es.json).

## 7. Conectores de memoria

### Descripción y puntos fuertes

Exponen conexiones para Mem0, Zep, Supermemory, Cognee y Honcho. Ya hay instrucciones de conexión revisadas y adaptaciones específicas. Cognee tiene un puente acotado para `remember`, `recall` y `forget`; Honcho puede inyectar el workspace configurado. Esto es más que una lista de marcas.

### Problemas y soluciones

| ID / prioridad | Problema y efecto | Tipo | Solución |
| --- | --- | --- | --- |
| MEM-01 / P1 | Instalar un conector no define qué recordar, cuándo consultar ni cómo demostrar que el recuerdo mejora otra tarea. No se ha probado aquí ese recorrido. | M/V | Receta de memoria por agente/proyecto y prueba de guardar → recuperar → aplicar en una tarea nueva, con referencia a la fuente. |
| MEM-02 / P1 | El ámbito empresarial de la conexión no debe confundirse con el namespace, dataset o workspace del proveedor. La separación efectiva exige revisar cada integración. | V | Pruebas negativas entre empresas, agentes y proyectos según la política; traducir el ámbito interno a parámetros de proveedor controlados. No afirmar una fuga sin reproducirla. |
| MEM-03 / P2 | Cognee admite solo URLs Cloud con la forma validada; no cualquier instalación propia. | C/L | Explicar el soporte actual. Añadir self-hosted como método separado solo tras validar transporte, autenticación y red. |
| MEM-04 / P2 | Las operaciones y parámetros no son equivalentes entre proveedores. En Cognee, por ejemplo, `custom_prompt` no puede combinarse con `session_id`. | C/L | Publicar capacidades y validaciones por método, y ofrecer recetas adaptadas en lugar de un formulario aparentemente universal. |
| MEM-05 / P2 | Ocultar el experimental no desconecta memorias existentes. Puede interpretarse erróneamente como suspensión de lecturas/escrituras. | C/L | Separar mostrar catálogo, habilitar conexión, asignar a agentes y revocar acceso. |
| MEM-06 / P2 | Memoria obsoleta, contradictoria o eliminada necesita una política de tratamiento. El conector por sí solo no decide cuál es correcta. | M | Guardar procedencia/fecha/ámbito, permitir rectificación y retirar recuerdos en el proveedor cuando se solicite y esté autorizado. |
| MEM-07 / P2 | La utilidad, latencia y coste dependen del proveedor y patrón de consulta; no basta con que responda una herramienta. | V | Medir recuperación pertinente, contenido incorrecto, tiempo y uso en tareas representativas; fallo del proveedor con continuidad explicada. |

### Resultado esperado y aceptación

La memoria sería una capacidad comprensible: qué guarda, para quién, de dónde procede y cuándo se utilizó. Se acepta al recuperar una decisión correcta en una tarea posterior, corregirla, comprobar que ya no se usa la versión antigua y demostrar la separación de ámbitos autorizada.

Fuentes: [catálogo](../../packages/shared/src/feature-catalog.ts), [contratos de instrucciones de conexión](../../packages/shared/src/connection-instructions.test.ts), [Cognee](../../server/src/services/cognee-connection.ts), [Honcho](../../server/src/services/honcho-connection.ts).

## 8. Bots de revisión de GitHub

### Descripción y puntos fuertes

Permiten agentes con identidad de GitHub App, acceso seleccionado a repositorios y configuración de políticas y ejecución. Hay pantallas de gestión, búsqueda de repositorios y revisión. El experimental es independiente de conectores de chat y conexiones de herramientas de GitHub.

### Problemas y soluciones

| ID / prioridad | Problema y efecto | Tipo | Solución |
| --- | --- | --- | --- |
| GH-01 / P1 | Desactivar el experimental oculta preparación/gestión, pero conserva bots operativos. No es un interruptor de parada. | C/L | Mantener acceso a gestión de instalaciones existentes y una acción explícita de pausa o desconexión. Explicar el efecto antes del cambio. |
| GH-02 / P2 | Hay varias capas de acceso: instalación de App, repositorios habilitados, identidad y ejecución. Un bot instalado puede seguir sin poder completar la revisión. | C/M | Diagnóstico conjunto y prueba sobre un PR elegido, con requisito pendiente y acción siguiente. |
| GH-03 / P1 | Una reseña textual no demuestra revisión útil ni actualizada. La calidad de comentarios, falsos positivos y evidencia no se verificó en esta auditoría. | V | Evaluar PR con fallos conocidos y controles sanos; exigir observaciones localizadas, explicación y propuesta verificable. |
| GH-04 / P1 | Una revisión debe corresponder al commit vigente; nuevos pushes, force-push y reintentos pueden dejar resultados antiguos. No se atribuye un fallo sin prueba actual. | V | Casos de actualización de commit y cancelación/supersesión; enlazar cada resultado al SHA revisado. |
| GH-05 / P2 | Webhooks y menciones repetidos pueden causar ruido o gasto si el producto no comunica su deduplicación y política. | V/M | Probar duplicados, autorrespuestas, retries y ráfagas. Conservar recibos, colas y presupuestos existentes; mostrar qué revisión está pendiente. |
| GH-06 / P2 | Una instalación técnica no ofrece por sí sola un contrato de revisión para cada repositorio. | M | Plantillas de revisión por repo con alcance, exclusiones, idioma, severidades y criterio de finalización, reutilizando habilidades existentes. |

### Resultado esperado y aceptación

El usuario conecta un repositorio, elige la política y obtiene una revisión del commit correcto con hallazgos accionables, sin duplicados. Un nuevo push actualiza el trabajo; una pausa real detiene nuevos encargos. Pruebas con errores sembrados, permisos revocados y entrega duplicada de webhooks.

Fuentes: [catálogo](../../packages/shared/src/feature-catalog.ts), [gestión de bots](../../ui/src/pages/apps/chat/GitHubBotManagement.tsx), [políticas](../../ui/src/pages/apps/chat/GitHubBotConfiguration.tsx), [rutas e identidad](../../server/src/routes/chat-channels.ts).

## 9. Resúmenes

### Descripción y puntos fuertes

Son documentos de estado generados para ámbitos como proyectos y workspaces. Tienen revisiones, tarea de generación, deduplicación y restricciones de escritura al generador autorizado. La interfaz conserva historial y progreso. Son un mecanismo de producción de información con trazabilidad.

### Problemas y soluciones

| ID / prioridad | Problema y efecto | Tipo | Solución |
| --- | --- | --- | --- |
| SUM-01 / P1 | Activar Resúmenes no configura el Summarizer. El servicio rechaza generar si no está listo. | C | Preparación guiada desde el ajuste o la primera tarjeta: agente, conexión, modelo y prueba, con aprobación si procede. |
| SUM-02 / P1 | La UI solo consulta agentes integrados cuando también está habilitado ese experimental. Con Resúmenes activo y Agentes integrados apagado puede no disponer del estado que permite ofrecer la preparación inicial. | C | Desacoplar el diagnóstico necesario del flag de navegación, o declarar y resolver la dependencia al activar. Probar la combinación exacta. |
| SUM-03 / P2 | Una revisión fechada no indica por sí sola si hubo cambios relevantes desde su generación. | M | Mostrar antigüedad respecto de cambios observados y acción de actualización; conservar el resumen anterior mientras se genera otro. |
| SUM-04 / P1 | Que el generador publique Markdown no prueba exactitud, cobertura ni citas suficientes para decidir. | V/M | Evaluar resúmenes contra tareas/documentos de origen; separar hechos observados, bloqueos y dudas; enlazar evidencias. |
| SUM-05 / P2 | La generación crea trabajo de agente y consume capacidad. El usuario necesita comprender coste y frecuencia; no se presupone ausencia de controles globales. | M | Atribuir uso por resumen y evitar regeneraciones innecesarias con deduplicación existente y política explícita. |
| SUM-06 / P2 | Una generación detenida, cancelada o superada requiere una recuperación legible. Ya hay protecciones de estado y concurrencia; falta probar el recorrido actual completo. | C/V | Mostrar último resultado válido, motivo del intento fallido y reintento seguro. Probar escritura tardía y revisión reemplazada. |

### Resultado esperado y aceptación

Activar la función lleva a un generador preparado. El resumen ofrece estado, decisiones y bloqueos con fuentes, fecha y alcance. Una actualización conserva el anterior y termina en una nueva revisión o en un error recuperable. Se acepta con proyecto vacío, proyecto activo, cambios después de generar y cancelación/reintento.

Fuentes: [servicio](../../server/src/services/summary-slots.ts), [rutas](../../server/src/routes/summary-slots.ts), [UI y preparación](../../ui/src/components/SummarySlotCard.tsx), [pruebas](../../server/src/__tests__/summary-slots.test.ts).

## 10. Visor de archivos

### Descripción y puntos fuertes

Permite explorar y previsualizar archivos asociados al trabajo. Valida rutas y pertenencia, restringe archivos sensibles y diferencia capacidades de explorar, previsualizar y descargar. Hay vista de texto, imágenes, vídeo y tratamientos para Markdown/CSV/HTML. No es un editor ni una publicación duradera de artefactos.

### Problemas y soluciones

| ID / prioridad | Problema y efecto | Tipo | Solución |
| --- | --- | --- | --- |
| FILE-01 / P1 | Un recurso clasificado como remoto ofrece preview, descarga y exploración desactivadas por esta vía. El usuario puede tener una entrega que no consigue inspeccionar desde el workspace. | C/L | Acceso mediado por proveedor autorizado o publicación como artefacto duradero, sin abrir rutas arbitrarias del host. |
| FILE-02 / P2 | La previsualización limita texto a 512 KiB y medios a 10 MiB; el listado también tiene límites. Archivos válidos pueden quedar fuera. | C/L | Explicar límite y alternativa; lectura por fragmentos para texto, paginación y publicación/descarga autorizada cuando corresponda. No eliminar los límites sin control de recursos. |
| FILE-03 / P2 | Las rutas admitidas son relativas y usan `/`; se rechazan rutas absolutas Windows, `file://`, `~` y `..`. Un agente puede entregar una ruta que el visor no admite. | C/L | Normalizar referencias desde el workspace antes de publicarlas y devolver rutas/enlaces válidos. Mantener bloqueos de escape y secretos. |
| FILE-04 / P1 | Un archivo de workspace es mutable y puede desaparecer al cerrar o limpiar su entorno. Verlo no garantiza conservar la entrega. | C/L | Diferenciar archivo de trabajo y artefacto publicado; registrar versión/hash y publicar lo que se entrega antes de limpieza. |
| FILE-05 / P2 | No hay capacidades de edición en el contrato inspeccionado. Si el usuario espera corregir un documento desde la vista, el flujo queda fuera. | L/M | Priorizar solicitar cambios al agente y comparar versiones. Añadir edición solo para formatos y permisos concretos, con control de revisión; no convertir todo el visor en IDE. |
| FILE-06 / P2 | Hay formatos sin preview y workspaces no disponibles o cerrados. Un mensaje genérico puede parecer pérdida de información. | C/M | Explicar por qué no se puede abrir, señalar el artefacto publicado si existe y ofrecer recuperación autorizada cuando sea posible. |

### Resultado esperado y aceptación

El usuario abre un resultado desde su tarea sin averiguar dónde corrió el agente. Puede distinguir borrador mutable y entrega conservada, inspeccionar formatos soportados y obtener una alternativa clara para otros. Probar archivos grandes, referencias Windows, entorno remoto, limpieza del workspace y denegación de archivos sensibles.

Fuentes: [recursos y límites](../../server/src/services/workspace-file-resources.ts), [visor](../../ui/src/components/FileViewerSheet.tsx), [contrato de artefactos](../AGENT-ARTIFACTS.md).

## 11. Objetos externos

### Descripción y puntos fuertes

Detecta referencias externas en trabajo de Paperclip, conserva menciones y resuelve estados mediante proveedores. Hay proveedor integrado de GitHub y extensiones de plugins, caducidad, reintentos, leases y separación entre estado del objeto y disponibilidad de la consulta.

### Problemas y soluciones

| ID / prioridad | Problema y efecto | Tipo | Solución |
| --- | --- | --- | --- |
| EXT-01 / P1 | GitHub marca los objetos cerrados como terminales y la actualización periódica excluye terminales salvo una excepción de `not_found`. Una issue o PR reabierta puede conservar el estado cerrado hasta una actualización explícita u otro mecanismo que fuerce la consulta. | C | Diferenciar verdaderamente irreversible de cerrado/reabrible. Revalidación de baja frecuencia, evento del proveedor o invalidación controlada; conservar actualización manual. |
| EXT-02 / P2 | Detectar una URL no significa resolverla. Sin proveedor retorna `no_resolver`; el catálogo genérico no equivale a soporte universal de tickets. | C/L | Mostrar capacidades por proveedor y estado «enlace detectado, sin consulta de estado». Añadir proveedores por valor de uso. |
| EXT-03 / P2 | El proveedor integrado de GitHub reconoce `github.com` y `www.github.com`, no hosts GitHub Enterprise arbitrarios. | C/L | Método Enterprise explícito con host validado y credenciales apropiadas; anunciar el alcance actual. |
| EXT-04 / P1 | Un 404 puede significar falta de acceso y no eliminación. El código ya incorpora comprobación del repositorio y excepciones de recuperación; hay que conservarlas. | C/V | Probar cambio de credenciales/visibilidad y recuperación de registros antiguos. Mostrar incertidumbre antes de afirmar que desapareció. |
| EXT-05 / P2 | El refresco usa ventanas de unos cinco minutos por defecto. El estado mostrado no es necesariamente inmediato. | C/L | Mostrar última verificación y actualización bajo demanda; adaptar frecuencia a la relevancia y límites del proveedor. |
| EXT-06 / P2 | Un estado externo no debe cerrar por sí mismo la tarea ni demostrar aceptación del resultado. | M/V | Relación explícita entre referencia y tarea; cualquier automatización de cierre debe tener regla, permisos y evidencia propios. |

### Resultado esperado y aceptación

Una referencia indica qué es, quién la verificó, cuándo y con qué disponibilidad. Un cierre y posterior reapertura se reflejan correctamente. Un enlace sin proveedor no simula integración. Probar abierto → cerrado → reabierto, repositorio privado, revocación y URL no soportada.

Fuentes: [registro y refresco](../../server/src/services/external-objects.ts), [proveedor GitHub](../../server/src/services/github-external-object-provider.ts), [casos existentes](../../server/src/__tests__/external-objects-service.test.ts).

## 12. Tarjetas de estado

### Descripción y puntos fuertes

Son tarjetas compartidas de seguimiento con selección de tareas, generación y políticas de actualización. Ya existen fingerprints, detección de cambios, modos manual/reactivo, debounce, horarios y límites de tokens para actualización automática. Pueden utilizar un agente por tarjeta o recurrir al Summarizer integrado.

### Problemas y soluciones

| ID / prioridad | Problema y efecto | Tipo | Solución |
| --- | --- | --- | --- |
| CARD-01 / P1 | El ajuste depende de Resúmenes, pero solo contempla su bloqueo mediante `managedKeys`, no toda combinación de ocultación por operador. Puede ofrecer un cambio que la API rechaza. | C | Calcular dependencias efectivas, incluido `hiddenSettings`, antes de ofrecerlo; explicar qué controla el operador. |
| CARD-02 / P1 | Activar ambos flags no prepara un generador válido. Si no hay override válido ni Summarizer listo, la generación falla. | C | Resolver agente y prueba desde la preparación de la tarjeta; no asumir que el flag acredita disponibilidad. |
| CARD-03 / P2 | Resúmenes y tarjetas pueden parecer dos formas equivalentes de pedir el mismo estado. Falta una explicación centrada en el objetivo del usuario. | M | Resumen = estado de un ámbito; tarjeta = pregunta persistente sobre un conjunto vigilado. Plantillas con ejemplos y acciones diferentes. |
| CARD-04 / P2 | Las referencias a tareas en el Markdown pueden ampliar el conjunto vigilado, con un máximo de 200 menciones procesadas. La selección efectiva puede sorprender. | C/M | Mostrar tareas observadas y su procedencia; permitir revisar la ampliación y explicar el límite. |
| CARD-05 / P2 | Debounce, horarios y presupuesto pueden aplazar actualizaciones. Si la UI solo muestra un texto antiguo, el usuario no sabe por qué. | C/M | Exponer última generación, cambios pendientes y motivo de espera; conservar el contenido válido mientras llega otro. |
| CARD-06 / P2 | La actualización manual elude ciertos límites de política automática en el evaluador; los presupuestos generales siguen siendo otra capa. El usuario necesita entender la diferencia. | C | Explicar el coste de una actualización manual y mantener la autoridad presupuestaria general; no describir el cap automático como garantía absoluta de gasto de la tarjeta. |
| CARD-07 / P1 | Un texto actualizado no prueba una selección de tareas completa ni una interpretación correcta de riesgos. | V | Casos con tareas que entran/salen de la selección, cambios de responsable, permisos y bloqueos; verificar contenido y fuentes, no solo que hubo generación. |

### Resultado esperado y aceptación

Cada tarjeta responde a una pregunta concreta, muestra qué observa, con qué antigüedad y por qué espera. Tiene generador válido, coste atribuible y actualización recuperable. Se acepta al cambiar tareas y permisos, agotar política automática, actualizar manualmente y desactivar/reactivar sin perder configuración ni presentar datos no autorizados.

Fuentes: [motor de cambios y políticas](../../server/src/services/status-card-update-engine.ts), [generación y override](../../server/src/services/status-cards.ts), [rutas](../../server/src/routes/status-cards.ts), [dependencias en ajustes](../../ui/src/pages/InstanceExperimentalSettings.tsx).

## 13. Los demás experimentales de producto

Estas fichas cubren los otros catorce controles de producto visibles bajo sus condiciones. Su profundidad es menor que la de los diez anteriores: cuando se pide ampliar una experiencia, se marca como propuesta y no como defecto confirmado.

### 13.1 Habilidades beta

- **Descripción y valor actual:** permite probar versiones beta de la habilidad principal de Paperclip, conservando fijados guardados al volver a la versión activa.
- **Problemas:** L: no es un catálogo adicional de habilidades ni amplía MCP; M: el usuario necesita distinguir versión activa, beta y fijada; V: una actualización puede cambiar la calidad del trabajo y debe compararse con una tarea representativa.
- **Solución:** mostrar versión y cambios relevantes, prueba por agente autorizado y retorno verificable a la versión anterior.
- **Resultado esperado:** probar una beta con alcance conocido y volver al comportamiento estable sin reconstruir la configuración.

### 13.2 Agentes integrados

- **Descripción y valor actual:** superficies para agentes gestionados por Paperclip, con estados de preparación y controles. Habilitar la visibilidad no significa tener todos los agentes preparados.
- **Problemas:** C: Resúmenes depende de un generador que puede no estar listo; M: varias piezas requieren descubrir otro ajuste; M: la utilidad de cada agente debe expresarse con un resultado y sus requisitos.
- **Solución:** preparación contextual desde la función que lo necesita, reutilizando estados y aprobaciones existentes. Catálogo pequeño con prueba y coste atribuible por capacidad.
- **Resultado esperado:** pedir un resumen lleva a preparar el generador pertinente, sin que el usuario deba conocer la arquitectura de agentes integrados.

### 13.3 Casos

- **Descripción y valor actual:** productos de trabajo duraderos que reúnen documentos y trabajo relacionado. Las rutas incluyen revisiones, bloqueos de documentos y restauración de versiones.
- **Problemas:** M: debe explicarse cuándo usar Caso, tarea, documento y artefacto; M: falta acreditar un recorrido fácil desde encargo hasta producto revisado; V: permisos, conflictos de edición y múltiples tareas aportando contenido necesitan prueba real del conjunto.
- **Solución:** plantillas de producto con estructura, propietario y entrega esperada; enlaces explícitos a tareas de producción y revisión; conservar control de revisiones ya implementado.
- **Resultado esperado:** un producto como una campaña o informe se mejora a lo largo de varias tareas sin fragmentar el resultado ni perder su versión aprobada.

Fuente: [rutas de Casos](../../server/src/routes/cases.ts).

### 13.4 Conectores de chat

- **Descripción y valor actual:** conversaciones externas con agentes en plataformas como Slack, Discord, Teams y Telegram, con identidad y tareas asociadas.
- **Problemas:** C/L: apagar el flag oculta preparación y controles, pero conexiones existentes continúan; L: cada proveedor tiene reglas propias de mensajes e identidad; V: reintentos, orden, adjuntos y decisiones humanas necesitan verificación por proveedor.
- **Solución:** gestión siempre accesible de conexiones existentes, pausa/desconexión explícita, diagnóstico y prueba completa por plataforma; preservar módulos y diferencias de proveedor.
- **Resultado esperado:** un mensaje externo produce trabajo atribuible y una entrega en el hilo correcto; parar la conexión tiene un efecto operativo claro.

Fuente: [contrato del catálogo](../../packages/shared/src/feature-catalog.ts), [rutas](../../server/src/routes/chat-channels.ts).

### 13.5 Bandeja combinada + lista de tareas

- **Descripción y valor actual:** integra vistas de bandeja en Tareas y conserva accesos por vistas.
- **Problemas:** C: depende de Interfaz simplificada, pero el interruptor no impide activarla cuando esta está apagada; M: nombres y ubicación de vistas necesitan orientar a quien venía de Bandeja; V: no leídos, filtros y enlaces antiguos deben conservar significado.
- **Solución:** explicar/resolver la dependencia, transición con accesos equivalentes y regresiones sobre navegación y estados guardados.
- **Resultado esperado:** una sola entrada de trabajo con vistas previsibles; ningún estado «activado» sin efecto inexplicado.

Fuentes: [resolución efectiva](../../ui/src/hooks/useCombinedInboxTasksEnabled.ts), [ajustes](../../ui/src/pages/InstanceExperimentalSettings.tsx).

### 13.6 Decisiones

- **Descripción y valor actual:** hace visible una superficie de atención que reúne trabajo pendiente de respuesta.
- **Problemas:** M: añadir una entrada no asegura una cola clara de decisiones; V: requiere comprobar que no duplique o contradiga aprobaciones, Inbox e interacciones pendientes; M: cada elemento necesita contexto, efecto de las opciones y responsable.
- **Solución:** una representación coherente de las decisiones existentes, enlaces a su evidencia y resolución en el sistema dueño de cada decisión.
- **Resultado esperado:** el usuario entiende qué debe decidir, por qué y qué ocurrirá, sin resolver varias veces la misma cuestión.

### 13.7 Activar entornos

- **Descripción y valor actual:** permite gestionar y asignar entornos a proyectos y agentes.
- **Problemas:** L: el flag no provisiona un entorno utilizable; M: precedencia entre instancia, proyecto, agente y tarea debe ser explicable; V: disponibilidad, credenciales y capacidad se verifican en el entorno efectivo.
- **Solución:** mostrar selección efectiva y origen, diagnóstico/prueba y preparación guiada sobre servicios existentes.
- **Resultado esperado:** elegir dónde corre un trabajo sin conocer reglas internas y con aviso previo si no puede arrancar.

Fuente: [entornos](../../server/src/services/environments.ts), [selección](../../server/src/services/environment-selection.ts).

### 13.8 Respuestas rápidas experimentales

- **Descripción y valor actual:** permite acuses breves mientras empieza el trabajo. El servicio incluye cancelación y protección frente a acuses inseguros u obsoletos.
- **Problemas:** L: un acuse no significa que haya empezado la ejecución; V: puede resultar repetitivo o llegar tarde si no se verifica con mensajes consecutivos y cancelación; M: su valor debe medirse por claridad y espera percibida, no por cantidad de respuestas.
- **Solución:** acuses basados en estado observado, cancelación cuando dejan de ser pertinentes y transición clara al resultado. Mantener protecciones actuales.
- **Resultado esperado:** una señal breve y veraz cuando ayuda, sin prometer avances inexistentes ni competir con la respuesta principal.

Fuente: [servicio de respuestas rápidas](../../server/src/services/fast-responses.ts).

### 13.9 Primera tarea: proponer con un documento de plan

- **Descripción y valor actual:** cambia la propuesta inicial del onboarding a un documento de plan y una interacción con casillas.
- **Problemas:** L: se aplica a nuevas organizaciones según el contrato del ajuste, no actualiza automáticamente las existentes; M: activar no comunica necesariamente dónde observar el efecto; V: hay que medir si produce planes mejores y una primera entrega real, no solo más pasos.
- **Solución:** explicar alcance temporal, ofrecer previsualización y evaluar onboarding → decisión → tarea → resultado con usuarios y trabajos representativos.
- **Resultado esperado:** primera tarea bien definida y ejecutable con el mínimo de decisiones necesarias.

### 13.10 Grok Bot

- **Descripción y valor actual:** conexión de un bot existente con verificación de entrega y respuesta autenticada.
- **Problemas:** L: requiere MCP, Runner e instancia pública autenticada con HTTPS; L: el catálogo declara gasto del proveedor no reportado; M: un bot conectado necesita diagnóstico de preparación y prueba de trabajo, no solo emparejamiento.
- **Solución:** asistente de requisitos, prueba completa y distinción explícita entre uso no medido, estimado y reportado; preservar límites de presupuesto aplicables sin inventar costes desconocidos.
- **Resultado esperado:** agente cuya capacidad y límites se conocen, con entrega verificable y gasto descrito con honestidad.

### 13.11 OpenAI Dot

- **Descripción y valor actual:** agente independiente conectado mediante emparejamiento y eventos.
- **Problemas:** L: depende de MCP y HTTPS público autenticado; M: hay que distinguir conexión personal de asistente y conexión de agente; V: entrega, revocación, rotación y recuperación requieren prueba en la infraestructura real.
- **Solución:** diagnóstico y flujo de agente claramente separados, prueba de evento y trabajo, estado recuperable y enlaces al resultado.
- **Resultado esperado:** Dot aparece como agente preparado y puede recibir, ejecutar y devolver trabajo sin confundirse con un asistente que actúa como persona.

Fuente para Grok y Dot: [catálogo de características](../../packages/shared/src/feature-catalog.ts), [conexión dedicada](../../server/src/services/public-mcp/dot-runner.ts).

### 13.12 Interacciones en inglés simplificado

- **Descripción y valor actual:** instruye a los agentes para redactar determinadas interacciones en inglés técnico simplificado.
- **Problemas:** L: no es una mejora de idioma neutra; M: puede contradecir la preferencia de un usuario hispanohablante; V: una instrucción de estilo no garantiza comprensión ni opciones claras.
- **Solución:** separar idioma y claridad, respetar preferencia de usuario/empresa y evaluar comprensión. Mantener el estándar de inglés como elección específica, no como modo universal de accesibilidad.
- **Resultado esperado:** preguntas claras en el idioma elegido, con efecto de cada opción explicado.

### 13.13 Interfaz simplificada

- **Descripción y valor actual:** activa el shell y presentación simplificados; se usa por defecto y admite opt-out en el código actual inspeccionado.
- **Problemas:** C: el archivo de ajustes conserva un comentario que dice que el opt-out se retiró, aunque vuelve a renderizar el control y existe resolución para `false`; C: otras funciones dependen de este shell; M: sigue mezclando una preferencia de presentación con experimentos de capacidad.
- **Solución:** reconciliar contrato, comentarios y pruebas; declarar dependencias y mover a Apariencia cuando se considere comportamiento estable. No retirar el opt-out sin decisión de producto.
- **Resultado esperado:** una preferencia coherente, sin ajustes activados que queden inoperantes por cambiar el shell.

Fuentes: [ajustes](../../ui/src/pages/InstanceExperimentalSettings.tsx), [hook](../../ui/src/hooks/useStreamlinedUiEnabled.ts).

### 13.14 Usar espacios de trabajo aislados por defecto

- **Descripción y valor actual:** aplica una política por defecto cuando el proyecto tiene workspace y no ha escogido otra propia.
- **Problemas:** L: depende de Aislados; L: no sustituye políticas explícitas ni convierte chats/tareas sin repositorio en worktrees; M: el alcance del cambio no se conoce mirando únicamente el interruptor.
- **Solución:** previsualizar proyectos afectados, conservar excepciones y mostrar procedencia de la política efectiva. Probar activación y desactivación con tareas existentes y nuevas.
- **Resultado esperado:** adoptar aislamiento gradualmente sin alterar decisiones explícitas ni dejar tareas sin ejecutar.

## 14. Herramientas de desarrollo y opciones heredadas

Estos nueve controles también pertenecen a la sección, pero cumplen objetivos distintos. No deben convertirse en requisitos para usar las funciones principales.

| Ajuste | Descripción y valor actual | Problemas o límites | Solución y resultado esperado |
| --- | --- | --- | --- |
| Reiniciar el servidor de desarrollo cuando esté inactivo | Reinicio protegido en el flujo `pnpm dev:once`, esperando trabajo local pendiente/en curso | L: solo aplica al flujo de desarrollo descrito; V: cola y cambios concurrentes deben probarse; M: el usuario debe distinguir obsolescencia de fallo | Estado observado y reinicio coordinado por el servicio. El desarrollador sabe si se reiniciará y por qué espera, sin gestionar procesos manualmente. |
| Solo entorno gestionado | Restringe la selección al entorno de plataforma | L: ocultar local no crea un sandbox; C: la política puede denegar cuando falta un entorno gestionado; M: el cambio afecta globalmente | Diagnóstico previo y explicación de trabajos afectados; preparación autorizada del entorno. Una restricción válida no deja al operador sin saber cómo continuar. |
| Modo desarrollador de Paperclip | Muestra herramientas internas y enlaces de trazas | L: un enlace de observabilidad no garantiza datos configurados; M: nombre y exposición necesitan contexto; V: verificar acceso y redacción | Explicar qué herramientas están disponibles y por qué. Mantener el endpoint OTLP como opt-in y no confundirlo con Telemetry o el run log. |
| Ejecutar tareas en este worktree | Habilita ejecución en una instancia aislada desde un corte temporal e identidad de instancia | C: copias de otra instancia o activaciones incompletas fallan de forma cerrada; L: no activa automáticamente tareas anteriores; M: el operador necesita entender el corte | Conservar el fallo cerrado y mostrar alcance antes de activar. Ejecutar solo trabajo elegible en la instancia correcta, con recuperación explícita. |
| Vista de depuración de la información del servidor | Fecha de arranque y commit desde el menú de cuenta | L: no es un diagnóstico completo; M: un commit no explica la salud; V: versión mostrada debe corresponder al proceso real | Mantener información mínima y comprobada, enlazada a diagnóstico cuando proceda. Útil para soporte sin volcar datos internos. |
| Smoke Lab | Pruebas deterministas con fixtures de integración en despliegues privados | C/L: se deniega en despliegue público; L: un proveedor simulado no prueba el real; M: resultados necesitan indicar qué límite verifican | Conservar la restricción privada y separar prueba de contrato de prueba real. Un resultado verde declara su alcance exacto. |
| Descomposición del plan de tareas | Historial de descomposiciones aceptadas en el detalle | L: visualizar no garantiza un buen desglose; M: puede mostrar ruido técnico; V: trazabilidad plan → subtareas → cambios | Explicar origen, revisión y resultado. Encontrar tareas omitidas o duplicadas sin convertir el historial en otra lista de trabajo. |
| Interfaz clásica de tareas | Recupera una presentación anterior conservando datos | L: no ofrece funciones exclusivas de la vista de chat; M: se anuncia como heredada sin que esta auditoría acredite una fecha de retirada; V: debe conservar capacidades esenciales de lectura/acción | Matriz de diferencias, migración y decisión explícita de retirada. El usuario elige conociendo qué perderá, sin perder datos. |
| Enlace de Objetivos en la barra lateral | Restaura una entrada de navegación | L: no amplía gestión de objetivos; M: se mezcla navegación con experimentación; V: comprobar acceso y rutas al ocultar/mostrar | Tratar como preferencia de navegación cuando sea estable; conservar acceso contextual. Los objetivos siguen siendo encontrables. |

Fuentes: [pantalla y contratos de los controles](../../ui/src/pages/InstanceExperimentalSettings.tsx), [catálogo](../../packages/shared/src/feature-catalog.ts), [política de workspaces y entorno gestionado](../../server/src/services/execution-workspace-policy.ts), [Smoke Lab](../../server/src/services/smoke-lab.ts).

### Control presente en código pero oculto

**Chat de sala de conferencias:** `SHOW_CONFERENCE_ROOM_EXPERIMENTAL_SETTING` es `false`. No debe incluirse como función activable hoy en esta pantalla. Su descripción combina sala, feed, onboarding y estilo de hilos: antes de reabrirlo conviene separar esos alcances y definir objetivo, participantes y relación con las tareas. La mejora propuesta es un experimento acotado, con recuperación y evaluación propia; no se ha verificado su funcionamiento real aquí.

Los flags que existen en el catálogo o esquema pero no tienen tarjeta en esta pantalla no se consideran automáticamente controles visibles. Tampoco se equiparan claves de compatibilidad, como Apps o agregadores MCP, con capacidades que aún haya que activar.

## 15. Problemas transversales de la sección Experimental

| ID / prioridad | Problema | Solución propuesta | Resultado esperado |
| --- | --- | --- | --- |
| EXP-01 / P1 | Los controles están en navegación de organización, pero mutan configuración de instancia | Mostrar alcance global y empresas afectadas cuando sea relevante | Ningún cambio se interpreta como exclusivo de una empresa |
| EXP-02 / P1 | Un booleano no expresa preparación, requisitos, bloqueo por operador o disponibilidad real | Modelo de capacidad derivada: desactivada, requiere preparación, lista, degradada o gestionada | Activar lleva a un recorrido utilizable o explica el requisito exacto |
| EXP-03 / P1 | Dependencias tratadas de forma desigual: algunas activan otra flag, otras se ocultan y otras quedan sin efecto | Registro compartido de dependencias y efectos, reutilizado por servidor y UI | Activaciones coherentes y mensajes concretos |
| EXP-04 / P2 | La página permite intentar cambios sin reflejar claramente el permiso de administrador de instancia | Lectura disponible según contrato; controles de escritura solo con autoridad efectiva | Se evita una interacción que terminará en 403 |
| EXP-05 / P1 | «Desactivar» significa cosas distintas: bloquear llamadas, ocultar UI o impedir nuevas selecciones | Explicar por control: efecto en trabajo nuevo, trabajo en curso, conexiones y datos | Se puede revertir o detener una función con conocimiento de su efecto |
| EXP-06 / P2 | Herramientas internas, preferencias, compatibilidad y capacidades de producto comparten etiqueta | Agrupar por propósito y preparar salida de Experimental de funciones calificadas | Menos ruido y mejor comprensión de qué aporta valor |
| EXP-07 / P2 | Textos y comentarios pueden divergir del comportamiento, como Runner e Interfaz simplificada | Contrato común de alcance, requisitos, disponibilidad y reversión; revisión de traducciones | La pantalla describe el sistema real |
| EXP-08 / P1 | Pruebas de interruptores y fixtures no demuestran calidad del trabajo | Evaluaciones de recorridos completos y de contenido, con fallos retenidos | «Funciona» significa resultado útil y verificable |

## 16. Orden recomendado de trabajo

No se propone activar todo ni ejecutar ya estas ampliaciones. Este es el orden para convertir el diagnóstico en implementación revisable.

### Entrega A — Saber qué capacidad existe de verdad

1. Identificar vía, versión y permisos de MCP; matriz de las diez y las 37 herramientas.
2. Unificar dependencias y preparación de funciones en ajustes.
3. Corregir combinaciones sin efecto o rechazadas: Bandeja/Interfaz, Resúmenes/Agentes integrados, Tarjetas/ajustes ocultos.
4. Reconciliar textos de Runner, Interfaz simplificada y alcance global.

**Salida verificable:** el usuario distingue desactivado, sin preparar, sin permisos y listo; no se promete una capacidad inexistente.

### Entrega B — MCP útil para preparar y operar la empresa

1. Diagnóstico de preparación y nuevas operaciones de contratación sujetas a políticas existentes.
2. Ampliación del ciclo de habilidades y de las recetas de uso.
3. Errores accionables y recuperación con identidad de reintento.
4. Evaluación empresa sin equipo → equipo → encargo → entrega → corrección.

**Salida verificable:** el asistente puede completar el recorrido autorizado sin convertir al usuario en intermediario de llamadas técnicas.

### Entrega C — Chat con calidad de coordinación

1. Temas/sesiones navegables y búsqueda de historial.
2. Contexto y preparación de encargos visibles.
3. Traspaso estructurado con plan, fuentes y criterios de entrega.
4. Seguimiento y correcciones enlazados a resultados reales.

**Salida verificable:** dos trabajos simultáneos con el mismo agente se coordinan sin mezclar contexto ni perder decisiones o entregables.

### Entrega D — Resultados fiables y recuperables

1. Preparación y calidad de Resúmenes/Tarjetas.
2. Archivo remoto o publicación durable; límites de visor comprensibles.
3. Cierre/reapertura de objetos externos y proveedores efectivos.
4. Calidad de revisión GitHub y memoria entre tareas.

**Salida verificable:** el usuario puede inspeccionar, confiar con evidencias y recuperar los resultados.

### Entrega E — Graduar experimentos

Solo tras cubrir recorridos y límites: mover preferencias estables a su sección, publicar soporte por runtime/proveedor y retirar o acotar controles que no aporten una decisión útil. No promover por antigüedad ni por tener tests de UI verdes.

## 17. Verificación de esta auditoría y límites

### Evidencia ejecutada en esta conversación

- Pantalla Experimental: 53 pruebas correctas en la ejecución inicial.
- Ejecución adicional de `public-mcp`, `summary-slots` y `external-objects-service`: **25 correctas y 110 omitidas**. PostgreSQL de pruebas no pudo arrancar: `uv_os_get_passwd returned ENOMEM`. El código de salida fue cero porque las suites detectan entorno no soportado; no equivale a 135 pruebas correctas.
- Ejecución adicional enfocada en pantalla, entrada/selector de chat, dependencia de Bandeja, instrucciones de memoria, catálogo y motor de tarjetas: **88 correctas y 8 fallidas, en siete archivos**. Los ocho fallos están en `AgentChats.test.tsx` y `AgentChatPicker.test.tsx`: esperan literales ingleses como `Opening chat`, `Paused` u `Open chat` y reciben sus traducciones españolas. También apareció un aviso React de actualización fuera de `act`. No se modificaron tests ni se repitió con otro idioma para ocultar estos resultados. Las otras cinco suites pasaron, incluida la pantalla Experimental.
- La revisión de fuente incluye pantalla y traducciones, catálogo/validadores, herramientas y recetas MCP, contrato e implementación de chat, política/workspaces, calificación de runtime, puentes de memoria, gestión GitHub, resúmenes, recursos de archivos, objetos externos y motor de tarjetas.
- Se consultaron documentos de diseño y verificación históricos. Sus resultados no se atribuyen a esta ejecución.

### Qué no se ha demostrado

- No se ha identificado ni inspeccionado el catálogo de la conexión MCP concreta del usuario.
- No se han ejecutado hoy tareas con modelos reales ni proveedores de GitHub/memoria/Dot/Grok.
- No hay prueba actual de experiencia visual en navegador, móvil o historial largo.
- No se han implementado soluciones ni modificado código de producto.
- No se han ejecutado typecheck, build o la suite global para esta entrega documental; no se presenta como una implementación lista para PR.

Comandos de verificación utilizados (en PowerShell se invocó `pnpm.cmd`):

```text
pnpm.cmd exec vitest run ui/src/pages/InstanceExperimentalSettings.test.tsx --reporter=dot
pnpm.cmd exec vitest run server/src/__tests__/public-mcp.test.ts server/src/__tests__/summary-slots.test.ts server/src/__tests__/external-objects-service.test.ts --reporter=dot
pnpm.cmd exec vitest run ui/src/pages/InstanceExperimentalSettings.test.tsx ui/src/pages/AgentChats.test.tsx ui/src/components/AgentChatPicker.test.tsx ui/src/hooks/useCombinedInboxTasksEnabled.test.ts packages/shared/src/connection-instructions.test.ts packages/shared/src/feature-catalog.test.ts server/src/__tests__/status-card-update-engine.test.ts --reporter=dot
```

La revisión estructural del Markdown comprobó que todos los enlaces locales resuelven a archivos/directorios existentes y que el archivo está codificado correctamente en UTF-8. Esa comprobación no convierte las propuestas en comportamiento implementado.

### Regla para cerrar las mejoras futuras

Cada mejora necesita un resultado persistido e inspeccionable, no solo respuesta del modelo. Registrar combinación de versión/entorno/permisos, resultado esperado, evidencia, errores iniciales, reintentos y límites. Un reintento exitoso no debe ocultar el fallo anterior.

### Ubicación y publicación

Este informe se guarda como archivo solicitado en `doc/plans/2026-10-23-auditoria-experimentales-capacidades-y-mejoras.md`. Esta sesión no dispone de variables `PAPERCLIP_*` ni tarea asociada para utilizar el helper de subida y registrar un work product. Por tanto, se entrega el archivo local y no se afirma que esté adjunto a una issue de Paperclip.
