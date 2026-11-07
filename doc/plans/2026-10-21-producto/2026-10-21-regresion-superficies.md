# Regresión de superficies existentes

Fecha: 2026-10-21
Estado: lista de comprobación condicional

[Plan maestro](../2026-10-21-plan-maestro-producto.md) · [Backlog](2026-10-21-backlog-fases.md)

## Uso

Las siguientes 57 superficies no son funcionalidades pendientes por el hecho de aparecer en el inventario. Cuando una implementación cambie la página o su contrato, comprobar los criterios de su ficha y añadir una regresión con señal si hace falta.

Los antiguos tres renglones de trabajo por superficie se sustituyen por esta lista. Las comprobaciones se integran en la aceptación del cambio que las activa; no constituyen 171 tareas independientes.

| Referencia | Superficie | Comprobación principal |
| --- | --- | --- |
| R-VIV | [Actividad en vivo](paginas/2026-10-21-actividad-en-vivo.md) | No se muestran ejecuciones antiguas como si siguieran trabajando. |
| R-BAN | [Bandeja y compatibilidad](paginas/2026-10-21-bandeja.md) | Un seguimiento no asignado ni participado no invade la bandeja del usuario. |
| R-BUS | [Búsqueda](paginas/2026-10-21-busqueda.md) | El mismo término devuelve entidades distinguibles. |
| R-CHS | [Conversaciones con agentes](paginas/2026-10-21-chats.md) | Abrir la colección no dispara llamadas ni gasto. |
| R-CHD | [Conversación con un agente](paginas/2026-10-21-chat.md) | Las tareas reciben el plan y relaciones pertinentes antes de poder ejecutarse. |
| R-AGN | [Crear agente](paginas/2026-10-21-nuevo-agente.md) | Doble envío crea un solo agente o muestra el ya creado. |
| R-ORG | [Organigrama](paginas/2026-10-21-organigrama.md) | La estructura sigue siendo válida y compañía-específica. |
| R-REV | [Cola de revisión de procesos](paginas/2026-10-21-revision-pipeline.md) | Cada revisión tiene efecto y destinatario visibles. |
| R-CAS | [Casos duraderos](paginas/2026-10-21-casos.md) | Se distingue el tipo de caso del estado comercial del cliente. |
| R-CAD | [Detalle de caso duradero](paginas/2026-10-21-caso.md) | Puede identificarse la versión que el cliente aceptó. |
| R-DEQ | [Cola de decisión](paginas/2026-10-21-cola-decisiones.md) | Las decisiones obsoletas no se aplican a contenido nuevo. |
| R-STA | [Tarjetas de estado](paginas/2026-10-21-tarjetas-estado.md) | Todo estado relevante se comprueba en la fuente. |
| R-AUD | [Auditoría](paginas/2026-10-21-auditoria.md) | Las mutaciones comerciales relevantes tienen evento verificable. |
| R-RUN | [Historial de ejecuciones](paginas/2026-10-21-ejecuciones.md) | Se distingue completar ejecución de aceptar entrega. |
| R-PRE | [Presupuestos de ejecución](paginas/2026-10-21-presupuestos.md) | La interfaz y el servidor coinciden en los límites efectivos. |
| R-TIM | [Cronología de trabajo](paginas/2026-10-21-cronologia.md) | Una fecha real de entrega no se sustituye al mover una previsión. |
| R-APP | [Aplicaciones](paginas/2026-10-21-apps.md) | La tarjeta distingue disponible en catálogo, conectada, autorizada y comprobada. |
| R-APC | [Conectar una aplicación](paginas/2026-10-21-conectar-app.md) | Cerrar y reanudar no crea otra conexión o aplicación externa. |
| R-APD2 | [Detalle de aplicación conectada](paginas/2026-10-21-app.md) | Los lectores sin audiencia no ven nombres sensibles ni credenciales. |
| R-APN | [Aplicación sin conexión](paginas/2026-10-21-app-no-conectada.md) | Una app sin método compatible muestra ese límite. |
| R-ARV | [Revisión de acciones de aplicaciones](paginas/2026-10-21-apps-revision.md) | Un resultado incierto no se reenvía automáticamente. |
| R-CHC | [Conectar canal de comunicación](paginas/2026-10-21-conectar-canal.md) | Un setup interrumpido se reanuda sin crear bots o números duplicados. |
| R-CHP | [Detalle del canal](paginas/2026-10-21-canal.md) | Pausar o desconectar mantiene las garantías actuales del runtime. |
| R-CHI | [Confirmación de identidad de canal](paginas/2026-10-21-canal-identidad.md) | Enlace caducado o ya usado se rechaza sin filtrar datos. |
| R-GWS | [Pasarelas de herramientas](paginas/2026-10-21-pasarelas.md) | Una pasarela accesible no prueba autorización de cada app subyacente. |
| R-GWD | [Detalle de pasarela](paginas/2026-10-21-pasarela.md) | Fallo de discovery no borra silenciosamente configuración válida. |
| R-ADV | [Herramientas avanzadas](paginas/2026-10-21-herramientas-avanzadas.md) | La vista normal evita IDs y detalles que no permiten decidir. |
| R-PCE | [Crear o editar perfil de conexión](paginas/2026-10-21-perfil-conexion-editor.md) | Un error no destruye el perfil previo. |
| R-PCD | [Detalle de perfil de conexión](paginas/2026-10-21-perfil-conexion.md) | Retirar un perfil no borra evidencias de ejecuciones pasadas. |
| R-ASL | [Conectar asistentes externos](paginas/2026-10-21-asistente-conectar.md) | Revocar impide nuevas acciones aunque el asistente tenga contexto previo. |
| R-SKL | [Skills y capacidades](paginas/2026-10-21-skills.md) | Una denegación distingue restricción administrativa y seguridad de plataforma. |
| R-SKS | [Fuentes de skills](paginas/2026-10-21-skill-fuentes.md) | Un fallo upstream conserva la versión instalada. |
| R-SKE | [Editor de skill](paginas/2026-10-21-skill-editor.md) | Guardar no activa efectos externos ni relaja política de seguridad. |
| R-SET | [Ajustes de empresa](paginas/2026-10-21-ajustes-empresa.md) | Una preferencia visual no concede permisos ni habilita acciones. |
| R-CCN | [Conexiones de IA de la empresa](paginas/2026-10-21-ajustes-conexiones-ia.md) | El flag desactivado conserva su redirección actual. |
| R-MEM | [Miembros e invitaciones de empresa](paginas/2026-10-21-miembros.md) | Revocar acceso impide nuevas lecturas y acciones bajo el contrato de membresía. |
| R-ENV | [Entornos de ejecución](paginas/2026-10-21-entornos.md) | La indisponibilidad se muestra sin sustituir un entorno privado por otro. |
| R-IAC | [Acceso a la instancia](paginas/2026-10-21-acceso-instancia.md) | Los modos local_trusted y authenticated mantienen sus contratos. |
| R-EXP | [Funciones experimentales](paginas/2026-10-21-experimentales.md) | Desactivar no elimina datos salvo contrato explícito. |
| R-ADA | [Adaptadores de agentes](paginas/2026-10-21-adaptadores.md) | No se cambia de runtime para eludir una denegación de acceso. |
| R-SEC | [Secretos de empresa](paginas/2026-10-21-secretos.md) | Un lector sin concesión no obtiene el nombre sensible ni el valor. |
| R-PER | [Preferencias personales](paginas/2026-10-21-perfil-personal.md) | Una preferencia no activa automatizaciones de la empresa. |
| R-USR | [Perfil de miembro](paginas/2026-10-21-usuario.md) | El perfil no revela clientes o tareas privadas por sus recuentos. |
| R-WSS | [Espacios de trabajo](paginas/2026-10-21-espacios.md) | No se revela contenido privado por la lista. |
| R-WSE | [Detalle del espacio de ejecución](paginas/2026-10-21-espacio-ejecucion.md) | No se cambia trust preset para permitir un acceso denegado. |
| R-WSP | [Detalle del espacio de proyecto](paginas/2026-10-21-espacio-proyecto.md) | Los permisos del repositorio se mantienen al ejecutar. |
| R-INV | [Aceptar invitación](paginas/2026-10-21-invitacion.md) | Un token de otra cuenta no se acepta por coincidencia de contacto. |
| R-SOL | [Solicitudes de acceso](paginas/2026-10-21-solicitudes-acceso.md) | Un contacto nuevo no genera solicitud automáticamente. |
| R-AUT | [Autenticación](paginas/2026-10-21-autenticacion.md) | Entrar no concede acceso a clientes ni empresas. |
| R-BCL | [Reclamar control de instancia](paginas/2026-10-21-reclamar-control.md) | Un token caducado o reutilizado no concede control. |
| R-CLA | [Autorización de CLI](paginas/2026-10-21-cli-autorizacion.md) | No se concede autoridad global por usar CLI. |
| R-MCA | [Autorización de conexión MCP](paginas/2026-10-21-mcp-autorizar.md) | La herramienta comercial aplica las mismas comprobaciones del servidor. |
| R-MCD | [Autorización por dispositivo MCP](paginas/2026-10-21-mcp-dispositivo.md) | Código inválido o usado no filtra información. |
| R-ASC | [Conexiones de asistentes](paginas/2026-10-21-asistentes-conexiones.md) | Revocar bloquea nuevas acciones. |
| R-OAU | [Retorno de autorización OAuth](paginas/2026-10-21-oauth-retorno.md) | Un callback no válido no crea concesiones. |
| R-NFD | [Página no encontrada](paginas/2026-10-21-pagina-no-encontrada.md) | Un ID privado y uno inexistente no se distinguen mediante mensajes indebidos. |
| R-DSG | [Guía del sistema de diseño](paginas/2026-10-21-guia-diseno.md) | Los componentes no incorporan valores visuales fuera de tokens. |

## Registro de una comprobación

Anotar entrega que la activa, superficie, riesgo concreto, prueba existente o caso realizado, resultado y evidencia. Si la superficie no se modifica y sus contratos siguen iguales, no crear trabajo nuevo para marcar una casilla.

Las pruebas de acceso y consistencia se eligen según el cambio. Una guía estática de diseño, por ejemplo, se revisa por componentes, tokens y accesibilidad; no necesita pruebas de paginación de datos comerciales.
