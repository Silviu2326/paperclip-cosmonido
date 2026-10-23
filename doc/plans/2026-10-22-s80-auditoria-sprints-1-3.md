# Auditoría de implementación de S1–S3

Fecha de corte: 2026-10-22. Alcance: lectura de planes originales, notas de integración y código fuente presente en este worktree. Se excluyen tests, builds, typecheck, checks y aceptación en ejecución. “Completa” significa que hay evidencia de fuente para el flujo principal de la unidad original; no implica que cada requisito de calidad, integración externa o aceptación esté probado. “Parcial” significa que hay código relacionado, pero falta un requisito obligatorio o un enganche de producción.

## Conclusión

No se puede defender honestamente que los tres sprints superan el 80 % de implementación completa. S1 tiene evidencia de fuente para los 7/7 paquetes originales, pero esa cobertura por paquete no equivale a 7/7 criterios completos. S2, medido por sus 14 pistas originales, tiene 8 pistas con el flujo principal identificable en fuente, 4 parciales y 2 sin implementación sustantiva; ese conteo tampoco equivale a cerrar todos los criterios obligatorios de esas pistas. En S3 la guía histórica no es evidencia del estado actual y no se usa como conteo actual: la revisión de fuente identifica varios requisitos obligatorios ausentes o solo manuales, por lo que el porcentaje global actual queda **sin determinar**. La mera presencia de archivos no cambia los parciales a completos.

Esta lectura sí permite decir que las tres bases tienen trabajo sustancial implementado. No permite convertir “hay código” en “más del 80 % de los criterios originales están implementados”. El principal bloqueo de la afirmación global es S2/S3, no la falta de pruebas (que aquí no se cuentan).

## Sprint 1: emprendedor entrega

Unidad original: los siete WP del [encargo S1](2026-10-21-sprint-1-codex.md). El [informe de implementación local](2026-10-21-sprint-1-verificacion-local.md) enumera fuente para los siete: encargos, revisiones, contexto, costes, Inicio, equipo/skills y estudio de medios; referencia servicios, rutas y UI concretos. Como conteo de paquetes con fuente identificable: **7/7**; no se asigna una puntuación de cierre a los criterios compuestos.

La fuente documentada cubre trabajo sustancial, pero no acredita todas las condiciones de aceptación. En particular, presupuesto de encargo se almacena y muestra; no hay hard stop específico por encargo. Aunque el WP1 indicó reutilizar presupuesto existente y no inventar otro enforcement, el flujo todavía no impide superar el presupuesto del encargo. El informe también deja pendiente el recorrido con agente nativo/proveedores autorizados y registra bloqueos globales de inventario Runner, comandos de test/build y token gate. El conteo 7/7 solo representa presencia de implementación por paquete, no un porcentaje completo de criterios.

## Sprint 2: relación con el cliente

Unidad original: las **14 pistas A–N** del [plan maestro](2026-10-21-plan-maestro-producto.md), con alcance detallado en [contrato compartido](2026-10-21-sprint-2-contrato.md) y [pistas](2026-10-21-sprint-2-pistas.md). Conteo conservador por pista, exigiendo el flujo principal del criterio y no solo un módulo con nombre parecido:

| Estado fuente | Pistas | Evidencia / límite principal |
|---|---|---|
| Completa a nivel de flujo principal (8/14) | A CRM; B entrada de leads; C bandeja; D correo; E canales Meta/Telegram/Twilio; F chat web; K proyecto/contexto/memoria; M equipos | Notas de integración describen servicios/rutas y montajes de A–F y K; la fuente incluye CRM, leads, conversaciones, canales, chat web y memoria. Los catálogos actuales contienen `agency-content`, `sales-inbound` y `customer-care`. Esto no acredita proveedores configurados ni pilotos externos. |
| Parcial (4/14) | H agenda; I revisión externa; L sincronización CRM; N estudio v2 | H tiene rutas/servicios de slots y booking, pero la integración registra que falta el invocador real de Google Calendar. I tiene piezas de enlaces/revisión, pero `review_link_create` y `review_status_get` siguen sin herramienta integrada según las notas. L tiene adaptadores HubSpot/Pipedrive, pero falta cableado completo de sync/status y experiencia integral. N hereda el estudio S1, pero no satisface todo v2 (mejores momentos, zoom/concat y variantes por plataforma). |
| Sin implementación sustantiva del criterio original (2/14) | G teléfono; J publicación en redes | El árbol inspeccionado no muestra el flujo S2 de llamada CRM (`call_summary_get`, `call_schedule`) ni pipeline editorial con aprobación, publicación por plataforma y métricas de vuelta. Existencia de otros conectores de voz/publicación no satisface esos recorridos. |

La cuenta **8/14** se refiere a pistas originales, no a endpoints, líneas ni pruebas. Incluso si se acreditasen parcialmente como completas las cuatro pistas parciales, permanecen requisitos ausentes en G y J. Por tanto, el material disponible no sostiene >80 % de las pistas originales.

## Sprint 3: vende y entrega solo

Unidad original: los 14 WP de la [guía S3](2026-10-21-sprint-3-guia-agente.md). Se inspeccionaron fuente actual, rutas y montaje para WP2, WP3, WP4, WP6, WP7, WP8, WP9, WP10, WP11, WP13 y WP14, además de rutas de WP1, WP5 y WP12. No se traslada a esta fecha la matriz de estado histórica incluida en la guía. Se clasifica cada flujo solo hasta donde permiten los criterios obligatorios del plan:

| WP | Estado de fuente actual | Criterio obligatorio que queda abierto o evidencia concreta |
|---|---|---|
| 1 Playbooks | Implementación sustancial en fuente | Hay versiones, runs, UI, rutas y herramientas. La progresión automática depende de los triggers WP6; no se ha demostrado el ciclo comercial desde eventos reales. |
| 2 Cualificación y enriquecimiento | Parcial; conectores requieren configuración externa | `leadQualificationService.qualify` puntúa las evaluaciones que recibe y persiste fuentes/enrichment; `lead_enrich` tiene servicio, herramienta y ruta. El enriquecimiento no ocurre dentro de `qualify`; criterios, evaluación y enriquecimiento son llamadas separadas del agente. No hay evidencia de llamada real a Exa/Firecrawl/Tavily ni de medición de proveedor en esta revisión. |
| 3 Autonomía ganada | Parcial | Políticas, niveles, revocación, estadísticas de shadow y gate de concesión están en `autonomy.ts`. `proposeRaise` existe, pero no aparece invocado desde rutas, UI o scheduler; la pantalla concede manualmente tras bench, así que falta la propuesta automática de WP3. |
| 4 Banco de pruebas | Bloqueado por falta de adaptadores reales; ya no produce una aprobación ficticia | `autonomy-bench.ts` requiere candidato de replay y juez inyectados; sin ellos responde 422 antes de crear una ejecución. El montaje actual no inyecta estos adaptadores, por lo que no hay banco ejecutable. Promoción rechaza jueces heurísticos, menos de 20 casos y umbral menor al mínimo. Hace falta un replay real y juez de modelo configurado antes de acreditar WP4. |
| 5 Decisiones comerciales | Implementación sustancial en fuente | Hay rutas internas, resolución remota con token, efectos comerciales y enlace desde decisión. La composición con fuentes reales por canal requiere configuración externa; no se probó. |
| 6 Seguimientos y secuencias | Parcial; disparadores solo tienen superficie manual | `commercialTriggerRoutes` se monta y puede avanzar/cancelar runs, pero la búsqueda de referencias en `server/src` encuentra únicamente la ruta y su servicio, no llamadas desde eventos de respuesta, cambio de etapa, reuniones, leads ni vencimiento. Sin esos productores el flujo descrito no se dispara automáticamente. |
| 7 Compromisos detectados | Parcial | Extractor acepta candidatos propuestos por agente y los persiste como `proposed`; alertas de vencimiento llegan al servicio de resumen diario. El criterio de tarea/seguimiento automático para compromisos nuestros no está conectado al extractor; depende del flujo posterior de playbook. |
| 8 Propuestas, firma y señal | Implementación sustancial en fuente; pago depende de Stripe/secretos | Servicio, rutas privadas/públicas, aceptaciones por versión, evidencia y webhook de pago están presentes y montados. No se validó configuración de secretos, proveedor ni recorrido externo. |
| 9 Traspaso a entrega | Implementación sustancial en fuente | Servicio con recibos, endpoint y recuperación por origen están presentes y montados. La instalación de equipo y fuentes de contexto dependen del catálogo/configuración disponible; no se comprobó un traspaso con proveedor o instancia real. |
| 10 Recurrencia y renovaciones | Parcial | Existen schema, servicio, rutas y creación manual de periodos. `serviceAgreementRoutes(db)` usa el servicio sin dependencias de renovación y no hay llamada a `startDuePeriods`/`renewalsDue` desde scheduler; por ello no está conectado el ciclo automático. En ese montaje tampoco se proveen `createRenewalProposal` ni `requestRenewalDecision`, por lo que avisos de renovación no crean propuesta/decisión. |
| 11 Pipeline/previsión | Falta criterio de servidor; pantalla S2 no basta | No aparece `GET /companies/:id/opportunities/forecast` ni servicio de forecast en fuente. El tablero de oportunidades de S2 no aporta cobertura por moneda/periodo ni suma ponderada etiquetada como estimación requerida por S3. |
| 12 “Por qué hizo esto” | Implementación sustancial en fuente | Servicio, ruta, UI y contexto de eventos/gates están presentes. La explicación solo expone lo que está disponible en sus fuentes; su cobertura depende de que esas fuentes hayan registrado evento/recibo. |
| 13 Resumen diario | Parcial; envío desconfigurado en montaje | `dailyBriefService.tick` está en scheduler y compone/resuelve preferencias, pero `server/src/index.ts` instancia `dailyBriefService(db)` sin `deps.send`; `sendBrief` devuelve “no delivery channel configured”. Por tanto no entrega WhatsApp ni correo en la configuración actual. |
| 14 Estudio v3 | Parcial; operaciones principales en fuente | Paquete, rutas y herramientas de `stop_motion`, `dub_multivoice` y `voiceover` están presentes y cableados. No encontré un flujo que genere imágenes mediante la conexión de imagen cuando las pide el agente; es un requisito explícito del WP. Proveedores/activos también requieren configuración externa. |

Las brechas concretas de WP2, WP3, WP4, WP6, WP7, WP10, WP11 y WP13 impiden afirmar que los criterios obligatorios S3 están completos en más de cuatro quintas partes sin establecer pesos arbitrarios. El porcentaje actual de S3 queda **sin determinar**; con estas brechas no hay base de fuente para declarar >80 %.

## Evidencia y límites de esta auditoría

- Fuentes primarias leídas: encargo S1 e informe de implementación; contrato, pistas e integración S2; plan maestro; guía S3; notas actuales de integración S4 que conservan deuda S1–S3.
- La clasificación usa las unidades originales: WP para S1/S3 y pistas A–N para S2. Los conteos de presencia de fuente (S1) y flujo principal (S2) no se presentan como porcentajes de criterios completos. No asigna pesos nuevos ni cuenta tests como implementación.
- Los archivos y rutas citados acreditan presencia de fuente solamente. No se probaron integraciones con Google Calendar, Meta, Twilio, HubSpot/Pipedrive, cuentas de publicación ni proveedores de medios.
- Los planes históricos describen distintos estados/ramas. Este documento cruza esos estados con la fuente del worktree, sin afirmar que migraciones centrales, inventarios Runner o aceptación externa estén cerrados.
- No se ejecutó ningún comando de verificación, test, build, typecheck, instalación, migración ni servicio.
