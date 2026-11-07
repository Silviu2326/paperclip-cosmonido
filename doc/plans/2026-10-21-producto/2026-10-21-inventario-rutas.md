# Inventario de páginas rutas y compatibilidad

Fecha: 2026-10-21
Fuente de rutas: [ui/src/App.tsx](../../../ui/src/App.tsx)
Cobertura: 184 valores de ruta literal distintos y la familia dinámica de filtros de agentes

[Plan maestro](../2026-10-21-plan-maestro-producto.md)

## Regla de cobertura

Una página funcional tiene un MD propio. Cuando varias rutas o pestañas montan la misma página, comparten ese MD. Los redireccionamientos apuntan al documento del comportamiento que se conserva. Las páginas nuevas tienen rutas propuestas y no se presentan como implementadas.

Se han localizado 106 superficies documentadas. El inventario confirma rutas y fuentes, no éxito de recorridos. Los plugins pueden registrar páginas no conocidas todavía; cada ampliación requerirá especificación propia y mantener el contrato de [página de plugin](paginas/2026-10-21-pagina-plugin.md).

Los componentes de laboratorio se excluyen del alcance de producto y quedan identificados a continuación. Las variantes production, componentes incrustados y alias comparten el documento de su página, sin crear planes de rediseño independientes.

## Rutas observadas

| Ruta literal | Documento responsable o excepción |
| --- | --- |
| `/dashboard` | [INI Inicio](paginas/2026-10-21-inicio.md) |
| `/dashboard/live` | [VIV Actividad en vivo](paginas/2026-10-21-actividad-en-vivo.md) |
| `/timeline` | [TIM Cronología de trabajo](paginas/2026-10-21-cronologia.md) |
| `/onboarding` | [ONB Configuración inicial](paginas/2026-10-21-onboarding.md) |
| `/companies` | [EMP Empresas operadoras](paginas/2026-10-21-empresas.md) |
| `/company/settings` | [SET Ajustes de empresa](paginas/2026-10-21-ajustes-empresa.md) |
| `/company/settings/connections` | [CCN Conexiones de IA de la empresa](paginas/2026-10-21-ajustes-conexiones-ia.md) |
| `/company/settings/environments` | [ENV Entornos de ejecución](paginas/2026-10-21-entornos.md) |
| `/company/settings/cloud-upstream` | [EXO Exportación de empresa](paginas/2026-10-21-exportacion.md) |
| `/company/settings/members` | [MEM Miembros e invitaciones de empresa](paginas/2026-10-21-miembros.md) |
| `/company/settings/access` | [MEM Miembros e invitaciones de empresa](paginas/2026-10-21-miembros.md) |
| `/company/settings/invites` | [MEM Miembros e invitaciones de empresa](paginas/2026-10-21-miembros.md) |
| `/company/export/*` | [EXO Exportación de empresa](paginas/2026-10-21-exportacion.md) |
| `/company/import` | [IMP Importación de empresa](paginas/2026-10-21-importacion.md) |
| `/company/settings/secrets` | [SEC Secretos de empresa](paginas/2026-10-21-secretos.md) |
| `/company/settings/tools` | [ADV Herramientas avanzadas](paginas/2026-10-21-herramientas-avanzadas.md) |
| `/company/settings/tools/:tab` | [ADV Herramientas avanzadas](paginas/2026-10-21-herramientas-avanzadas.md) |
| `/tools` | [ADV Herramientas avanzadas](paginas/2026-10-21-herramientas-avanzadas.md) |
| `/tools/:tab` | [ADV Herramientas avanzadas](paginas/2026-10-21-herramientas-avanzadas.md) |
| `/apps` | [APP Aplicaciones](paginas/2026-10-21-apps.md) |
| `/apps/assistant-connection` | [ASL Conectar asistentes externos](paginas/2026-10-21-asistente-conectar.md) |
| `/apps/browse` | [APP Aplicaciones](paginas/2026-10-21-apps.md) |
| `/apps/connections` | [APP Aplicaciones](paginas/2026-10-21-apps.md) |
| `/apps/byo` | [APC Conectar una aplicación](paginas/2026-10-21-conectar-app.md) |
| `/apps/vercel-connect` | [APC Conectar una aplicación](paginas/2026-10-21-conectar-app.md) |
| `/apps/connect` | [APC Conectar una aplicación](paginas/2026-10-21-conectar-app.md) |
| `/apps/chat/connect` | [CHC Conectar canal de comunicación](paginas/2026-10-21-conectar-canal.md) |
| `/apps/chat/:endpointId` | [CHP Detalle del canal](paginas/2026-10-21-canal.md) |
| `/apps/chat/:endpointId/reviews/:reviewId` | [CHP Detalle del canal](paginas/2026-10-21-canal.md) |
| `/apps/chat/:endpointId/:tab` | [CHP Detalle del canal](paginas/2026-10-21-canal.md) |
| `/apps/connect/:appKey` | [APP Aplicaciones](paginas/2026-10-21-apps.md) |
| `/apps/connect/:appKey/:stage` | [APP Aplicaciones](paginas/2026-10-21-apps.md) |
| `/apps/review` | [ARV Revisión de acciones de aplicaciones](paginas/2026-10-21-apps-revision.md) |
| `/apps/attention` | [APP Aplicaciones](paginas/2026-10-21-apps.md) |
| `/apps/gateways` | [GWS Pasarelas de herramientas](paginas/2026-10-21-pasarelas.md) |
| `/apps/gateways/:gatewayId` | [GWD Detalle de pasarela](paginas/2026-10-21-pasarela.md) |
| `/apps/gateways/:gatewayId/:tab` | [GWD Detalle de pasarela](paginas/2026-10-21-pasarela.md) |
| `/apps/advanced` | [ADV Herramientas avanzadas](paginas/2026-10-21-herramientas-avanzadas.md) |
| `/apps/advanced/gateways` | [GWS Pasarelas de herramientas](paginas/2026-10-21-pasarelas.md) |
| `/apps/advanced/profiles/new` | [PCE Crear o editar perfil de conexión](paginas/2026-10-21-perfil-conexion-editor.md) |
| `/apps/advanced/profiles/:profileId/edit` | [PCE Crear o editar perfil de conexión](paginas/2026-10-21-perfil-conexion-editor.md) |
| `/apps/advanced/profiles/:profileId` | [PCD Detalle de perfil de conexión](paginas/2026-10-21-perfil-conexion.md) |
| `/apps/advanced/audit` | [ADV Herramientas avanzadas](paginas/2026-10-21-herramientas-avanzadas.md) |
| `/apps/advanced/run-your-own` | [ADV Herramientas avanzadas](paginas/2026-10-21-herramientas-avanzadas.md) |
| `/apps/advanced/:tab` | [ADV Herramientas avanzadas](paginas/2026-10-21-herramientas-avanzadas.md) |
| `/apps/app/:applicationId` | [APN Aplicación sin conexión](paginas/2026-10-21-app-no-conectada.md) |
| `/apps/app/:applicationId/:tab` | [APN Aplicación sin conexión](paginas/2026-10-21-app-no-conectada.md) |
| `/apps/:connectionId` | [APD2 Detalle de aplicación conectada](paginas/2026-10-21-app.md) |
| `/apps/:connectionId/:tab` | [APD2 Detalle de aplicación conectada](paginas/2026-10-21-app.md) |
| `/company/settings/instance` | [SET Ajustes de empresa](paginas/2026-10-21-ajustes-empresa.md) |
| `/company/settings/instance/profile` | [PER Preferencias personales](paginas/2026-10-21-perfil-personal.md) |
| `/company/settings/instance/general` | [SET Ajustes de empresa](paginas/2026-10-21-ajustes-empresa.md) |
| `/company/settings/instance/heartbeats` | [SET Ajustes de empresa](paginas/2026-10-21-ajustes-empresa.md) |
| `/company/settings/instance/environments` | [ENV Entornos de ejecución](paginas/2026-10-21-entornos.md) |
| `/company/settings/instance/environments/new` | [ENV Entornos de ejecución](paginas/2026-10-21-entornos.md) |
| `/company/settings/instance/environments/:environmentId/edit` | [ENV Entornos de ejecución](paginas/2026-10-21-entornos.md) |
| `/company/settings/instance/access` | [IAC Acceso a la instancia](paginas/2026-10-21-acceso-instancia.md) |
| `/company/settings/instance/experimental` | [EXP Funciones experimentales](paginas/2026-10-21-experimentales.md) |
| `/company/settings/instance/plugins` | [PLM Administración de plugins](paginas/2026-10-21-plugins.md) |
| `/company/settings/instance/plugins/:pluginId` | [PLC Configuración de plugin](paginas/2026-10-21-plugin-configuracion.md) |
| `/company/settings/instance/adapters` | [ADA Adaptadores de agentes](paginas/2026-10-21-adaptadores.md) |
| `/company/settings/:settingsRoutePath/*` | [CSP Ajustes de empresa aportados por plugin](paginas/2026-10-21-ajustes-plugin-empresa.md) |
| `/skills/sources` | [SKS Fuentes de skills](paginas/2026-10-21-skill-fuentes.md) |
| `/skills/sources/:sourceId` | [SKS Fuentes de skills](paginas/2026-10-21-skill-fuentes.md) |
| `/skills/studio` | [SKE Editor de skill](paginas/2026-10-21-skill-editor.md) |
| `/skills/studio/new` | [SKE Editor de skill](paginas/2026-10-21-skill-editor.md) |
| `/skills/studio/:skillId` | [SKE Editor de skill](paginas/2026-10-21-skill-editor.md) |
| `/skills/:skillId/studio` | [SKE Editor de skill](paginas/2026-10-21-skill-editor.md) |
| `/skills/*` | [SKL Skills y capacidades](paginas/2026-10-21-skills.md) |
| `/settings` | [SET Ajustes de empresa](paginas/2026-10-21-ajustes-empresa.md) |
| `/settings/*` | [SET Ajustes de empresa](paginas/2026-10-21-ajustes-empresa.md) |
| `/plugins/:pluginId` | [PLP Página aportada por plugin](paginas/2026-10-21-pagina-plugin.md) |
| `/org` | [ORG Organigrama](paginas/2026-10-21-organigrama.md) |
| `/agents` | [AGS Agentes](paginas/2026-10-21-agentes.md) |
| `/agents/new` | [AGN Crear agente](paginas/2026-10-21-nuevo-agente.md) |
| `/agents/:agentId` | [AGD Detalle del agente](paginas/2026-10-21-agente.md) |
| `/agents/:agentId/:tab` | [AGD Detalle del agente](paginas/2026-10-21-agente.md) |
| `/agents/:agentId/runs/:runId` | [AGD Detalle del agente](paginas/2026-10-21-agente.md) |
| `/projects` | [PYS Proyectos](paginas/2026-10-21-proyectos.md) |
| `/projects/:projectId` | [PYD Detalle de proyecto](paginas/2026-10-21-proyecto.md) |
| `/projects/:projectId/overview` | [PYD Detalle de proyecto](paginas/2026-10-21-proyecto.md) |
| `/projects/:projectId/issues` | [PYD Detalle de proyecto](paginas/2026-10-21-proyecto.md) |
| `/projects/:projectId/issues/:filter` | [PYD Detalle de proyecto](paginas/2026-10-21-proyecto.md) |
| `/projects/:projectId/workspaces/:workspaceId` | [WSP Detalle del espacio de proyecto](paginas/2026-10-21-espacio-proyecto.md) |
| `/projects/:projectId/workspaces` | [PYD Detalle de proyecto](paginas/2026-10-21-proyecto.md) |
| `/projects/:projectId/configuration` | [PYD Detalle de proyecto](paginas/2026-10-21-proyecto.md) |
| `/projects/:projectId/budget` | [PYD Detalle de proyecto](paginas/2026-10-21-proyecto.md) |
| `/workspaces` | [WSS Espacios de trabajo](paginas/2026-10-21-espacios.md) |
| `/issues` | [TAR Tareas](paginas/2026-10-21-tareas.md) |
| `/tasks` | [TAR Tareas](paginas/2026-10-21-tareas.md) |
| `/search` | [BUS Búsqueda](paginas/2026-10-21-busqueda.md) |
| `/issues/all` | [TAR Tareas](paginas/2026-10-21-tareas.md) |
| `/issues/active` | [TAR Tareas](paginas/2026-10-21-tareas.md) |
| `/issues/backlog` | [TAR Tareas](paginas/2026-10-21-tareas.md) |
| `/issues/done` | [TAR Tareas](paginas/2026-10-21-tareas.md) |
| `/issues/recent` | [TAR Tareas](paginas/2026-10-21-tareas.md) |
| `/chats` | [CHS Conversaciones con agentes](paginas/2026-10-21-chats.md) |
| `/chats/:agentRef` | [CHD Conversación con un agente](paginas/2026-10-21-chat.md) |
| `/issues/:issueId` | [TAD Detalle de tarea](paginas/2026-10-21-tarea.md) |
| `/tests/perf/long-thread` | Laboratorio de rendimiento, no página comercial. |
| `/routines` | [RUS Rutinas](paginas/2026-10-21-rutinas.md) |
| `/cases` | [CAS Casos duraderos](paginas/2026-10-21-casos.md) |
| `/cases/:caseIdentifier` | [CAD Detalle de caso duradero](paginas/2026-10-21-caso.md) |
| `/status` | [STA Tarjetas de estado](paginas/2026-10-21-tarjetas-estado.md) |
| `/status/:cardId` | [STA Tarjetas de estado](paginas/2026-10-21-tarjetas-estado.md) |
| `/status-cards` | [STA Tarjetas de estado](paginas/2026-10-21-tarjetas-estado.md) |
| `/status-cards/:cardId` | [STA Tarjetas de estado](paginas/2026-10-21-tarjetas-estado.md) |
| `/review-queue` | [REV Cola de revisión de procesos](paginas/2026-10-21-revision-pipeline.md) |
| `/learnings` | [APR Aprendizajes de procesos](paginas/2026-10-21-aprendizajes.md) |
| `/pipelines` | [PIP Procesos y pipelines](paginas/2026-10-21-pipelines.md) |
| `/pipelines/:pipelineId` | [PIP Procesos y pipelines](paginas/2026-10-21-pipelines.md) |
| `/pipelines/:pipelineId/add` | [PIP Procesos y pipelines](paginas/2026-10-21-pipelines.md) |
| `/pipelines/:pipelineId/settings` | [PIC Configuración de pipeline](paginas/2026-10-21-pipeline-configuracion.md) |
| `/pipelines/:pipelineId/items/:caseId` | [PIE Elemento de pipeline](paginas/2026-10-21-pipeline-elemento.md) |
| `/pipelines/:pipelineId/cases/:caseId` | [PIE Elemento de pipeline](paginas/2026-10-21-pipeline-elemento.md) |
| `/routines/:routineId` | [RUD Detalle de rutina](paginas/2026-10-21-rutina.md) |
| `/routines/:routineId/:section` | [RUD Detalle de rutina](paginas/2026-10-21-rutina.md) |
| `/execution-workspaces/:workspaceId` | [WSE Detalle del espacio de ejecución](paginas/2026-10-21-espacio-ejecucion.md) |
| `/execution-workspaces/:workspaceId/services` | [WSE Detalle del espacio de ejecución](paginas/2026-10-21-espacio-ejecucion.md) |
| `/execution-workspaces/:workspaceId/configuration` | [WSE Detalle del espacio de ejecución](paginas/2026-10-21-espacio-ejecucion.md) |
| `/execution-workspaces/:workspaceId/runtime-logs` | [WSE Detalle del espacio de ejecución](paginas/2026-10-21-espacio-ejecucion.md) |
| `/execution-workspaces/:workspaceId/issues` | [WSE Detalle del espacio de ejecución](paginas/2026-10-21-espacio-ejecucion.md) |
| `/execution-workspaces/:workspaceId/routines` | [WSE Detalle del espacio de ejecución](paginas/2026-10-21-espacio-ejecucion.md) |
| `/goals` | [OBJ Objetivos](paginas/2026-10-21-objetivos.md) |
| `/goals/:goalId` | [OBD Detalle de objetivo](paginas/2026-10-21-objetivo.md) |
| `/artifacts` | [ART Artefactos de entrada y salida](paginas/2026-10-21-artefactos.md) |
| `/artifacts/in` | [ART Artefactos de entrada y salida](paginas/2026-10-21-artefactos.md) |
| `/artifacts/in/:folderId` | [ART Artefactos de entrada y salida](paginas/2026-10-21-artefactos.md) |
| `/artifacts/out` | [ART Artefactos de entrada y salida](paginas/2026-10-21-artefactos.md) |
| `/artifacts/out/:node` | [ART Artefactos de entrada y salida](paginas/2026-10-21-artefactos.md) |
| `/approvals` | [APS Aprobaciones](paginas/2026-10-21-aprobaciones.md) |
| `/approvals/pending` | [APS Aprobaciones](paginas/2026-10-21-aprobaciones.md) |
| `/approvals/all` | [APS Aprobaciones](paginas/2026-10-21-aprobaciones.md) |
| `/approvals/:approvalId` | [APD Detalle de aprobación](paginas/2026-10-21-aprobacion.md) |
| `/activity` | [AUD Auditoría](paginas/2026-10-21-auditoria.md) |
| `/activity/runs` | [RUN Historial de ejecuciones](paginas/2026-10-21-ejecuciones.md) |
| `/activity/costs` | [CST Costes de ejecución](paginas/2026-10-21-costes.md) |
| `/activity/budgets` | [PRE Presupuestos de ejecución](paginas/2026-10-21-presupuestos.md) |
| `/activity/timeline` | [TIM Cronología de trabajo](paginas/2026-10-21-cronologia.md) |
| `/audit` | [AUD Auditoría](paginas/2026-10-21-auditoria.md) |
| `/audit/activity` | [AUD Auditoría](paginas/2026-10-21-auditoria.md) |
| `/audit/runs` | [RUN Historial de ejecuciones](paginas/2026-10-21-ejecuciones.md) |
| `/audit/costs` | [CST Costes de ejecución](paginas/2026-10-21-costes.md) |
| `/audit/budgets` | [PRE Presupuestos de ejecución](paginas/2026-10-21-presupuestos.md) |
| `/audit/timeline` | [TIM Cronología de trabajo](paginas/2026-10-21-cronologia.md) |
| `/runs` | [RUN Historial de ejecuciones](paginas/2026-10-21-ejecuciones.md) |
| `/costs` | [CST Costes de ejecución](paginas/2026-10-21-costes.md) |
| `/budgets` | [PRE Presupuestos de ejecución](paginas/2026-10-21-presupuestos.md) |
| `/board-chat` | [BCH Sala de conversación del equipo](paginas/2026-10-21-sala-equipo.md) |
| `/dev/task-chat-lab` | Harness interno de tarea, no recorrido de producto. |
| `/decisions` | [DEC Decisiones y pendientes humanos](paginas/2026-10-21-decisiones.md) |
| `/decisions/queues/:key` | [DEQ Cola de decisión](paginas/2026-10-21-cola-decisiones.md) |
| `/inbox` | [BAN Bandeja y compatibilidad](paginas/2026-10-21-bandeja.md) |
| `/inbox/mine` | [BAN Bandeja y compatibilidad](paginas/2026-10-21-bandeja.md) |
| `/inbox/recent` | [BAN Bandeja y compatibilidad](paginas/2026-10-21-bandeja.md) |
| `/inbox/unread` | [BAN Bandeja y compatibilidad](paginas/2026-10-21-bandeja.md) |
| `/inbox/blocked` | [BAN Bandeja y compatibilidad](paginas/2026-10-21-bandeja.md) |
| `/inbox/all` | [BAN Bandeja y compatibilidad](paginas/2026-10-21-bandeja.md) |
| `/inbox/new` | [BAN Bandeja y compatibilidad](paginas/2026-10-21-bandeja.md) |
| `/inbox/requests` | [SOL Solicitudes de acceso](paginas/2026-10-21-solicitudes-acceso.md) |
| `/u/:userSlug` | [USR Perfil de miembro](paginas/2026-10-21-usuario.md) |
| `/design-guide` | [DSG Guía del sistema de diseño](paginas/2026-10-21-guia-diseno.md) |
| `/instance/settings/adapters` | [ADA Adaptadores de agentes](paginas/2026-10-21-adaptadores.md) |
| `/:pluginRoutePath/*` | [PLP Página aportada por plugin](paginas/2026-10-21-pagina-plugin.md) |
| `/*` | [NFD Página no encontrada](paginas/2026-10-21-pagina-no-encontrada.md) |
| `/oauth-handoff` | [OAU Retorno de autorización OAuth](paginas/2026-10-21-oauth-retorno.md) |
| `/auth` | [AUT Autenticación](paginas/2026-10-21-autenticacion.md) |
| `/board-claim/:token` | [BCL Reclamar control de instancia](paginas/2026-10-21-reclamar-control.md) |
| `/mcp-connect/:id` | [MCA Autorización de conexión MCP](paginas/2026-10-21-mcp-autorizar.md) |
| `/dot-connect/:id` | [MCA Autorización de conexión MCP](paginas/2026-10-21-mcp-autorizar.md) |
| `/mcp-device` | [MCD Autorización por dispositivo MCP](paginas/2026-10-21-mcp-dispositivo.md) |
| `/assistant-connections` | [ASC Conexiones de asistentes](paginas/2026-10-21-asistentes-conexiones.md) |
| `/cli-auth/:id` | [CLA Autorización de CLI](paginas/2026-10-21-cli-autorizacion.md) |
| `/invite/:token` | [INV Aceptar invitación](paginas/2026-10-21-invitacion.md) |
| `/chat-identity/confirm` | [CHI Confirmación de identidad de canal](paginas/2026-10-21-canal-identidad.md) |
| `/ux-lab/bootstrap-setup` | Laboratorio de configuración. |
| `/ux-lab/responsible-user-denial` | Laboratorio de errores de permiso. |
| `/ux-lab/cross-issue-collaboration` | Laboratorio de colaboración. |
| `/instance` | [SET Ajustes de empresa](paginas/2026-10-21-ajustes-empresa.md) |
| `/instance/settings` | [SET Ajustes de empresa](paginas/2026-10-21-ajustes-empresa.md) |
| `/instance/settings/*` | [SET Ajustes de empresa](paginas/2026-10-21-ajustes-empresa.md) |
| `/audit/*` | [AUD Auditoría](paginas/2026-10-21-auditoria.md) |
| `/activity/*` | [AUD Auditoría](paginas/2026-10-21-auditoria.md) |
| `/:companyPrefix` | Contenedor y selección de ámbito; documentado globalmente, no página autónoma. |

## Rutas dinámicas y superficies incrustadas

- Los filtros de agentes se generan desde AGENT_FILTER_TABS; su colección se documenta en [Agentes](paginas/2026-10-21-agentes.md).
- La interfaz clásica y la simplificada pueden montar variantes de una página o redirigir; el documento funcional debe comprobar ambas cuando se afecten.
- InstanceGeneralSettings aparece incrustado en [Ajustes de empresa](paginas/2026-10-21-ajustes-empresa.md).
- Herramientas y skills de un agente son pestañas de [Detalle del agente](paginas/2026-10-21-agente.md).
- Los visores y acciones de archivos pertenecen a [Artefactos](paginas/2026-10-21-artefactos.md), salvo que después se acuerde una página autónoma.
- TeamCatalog contiene capacidades de catálogo e instalación; confirmar el montaje vigente antes de introducir la entrada propuesta de [Equipos](paginas/2026-10-21-equipos.md).
- Los componentes legacy sin montaje de página independiente se revisan solo si cambia su consumidor; no justifican duplicar pantallas.

## Nuevas superficies y rutas propuestas

| Página | Ruta propuesta | Fase |
| --- | --- | --- |
| [Clientes](paginas/2026-10-21-clientes.md) | `/customers` | F2 |
| [Ficha del cliente](paginas/2026-10-21-cliente.md) | `/customers/:customerId` | F2 |
| [Contactos](paginas/2026-10-21-contactos.md) | `/contacts` | F2 |
| [Ficha del contacto](paginas/2026-10-21-contacto.md) | `/contacts/:contactId` | F2 |
| [Leads](paginas/2026-10-21-leads.md) | `/leads` | F2 |
| [Ficha del lead](paginas/2026-10-21-lead.md) | `/leads/:leadId` | F2 |
| [Oportunidades](paginas/2026-10-21-oportunidades.md) | `/opportunities` | F3 |
| [Ficha de la oportunidad](paginas/2026-10-21-oportunidad.md) | `/opportunities/:opportunityId` | F3 |
| [Catálogo de productos y servicios](paginas/2026-10-21-oferta.md) | `/offerings` | F3 |
| [Detalle de producto o servicio](paginas/2026-10-21-oferta-detalle.md) | `/offerings/:offeringId` | F3 |
| [Propuestas comerciales](paginas/2026-10-21-propuestas.md) | `/proposals` | F3 |
| [Detalle de propuesta y compromiso](paginas/2026-10-21-propuesta.md) | `/proposals/:proposalId` | F3 |
| [Comunicaciones](paginas/2026-10-21-comunicaciones.md) | `/communications` | F3 |
| [Detalle de conversación comercial](paginas/2026-10-21-comunicacion.md) | `/communications/:conversationId` | F3 |
| [Agenda comercial](paginas/2026-10-21-agenda.md) | `/calendar` | F3 |
| [Resultados económicos del negocio](paginas/2026-10-21-finanzas.md) | `/business-finance` | F6 |
| [Portal del cliente](paginas/2026-10-21-portal-cliente.md) | `/portal/:portalId` | F6 |
| [Contexto del negocio](paginas/2026-10-21-contexto.md) | `Propuesta: /business-context` | F2 |
| [Plan consumo y facturación de Paperclip](paginas/2026-10-21-facturacion-paperclip.md) | `Propuesta: /company/billing` | F6 |

Antes de reservar estas rutas, comprobar colisiones con rutas de plugins, prefijos de empresa y redirecciones globales. No activar navegación de una página sin contrato, permiso y destino implementados.
