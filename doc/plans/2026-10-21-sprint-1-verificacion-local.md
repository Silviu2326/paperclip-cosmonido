# Sprint 1: implementación y verificación local

Referencia: [encargo del sprint](2026-10-21-sprint-1-codex.md).

Estado: los siete paquetes están implementados en el árbol local. La aceptación global del sprint sigue pendiente: las comprobaciones generales del repositorio y el recorrido con un agente nativo y proveedores reales no están certificados en esta sesión.

No se han creado commits, PR, despliegues ni publicaciones. No se ha migrado la base de datos del usuario. Las pruebas con datos usan clústeres PostgreSQL desechables, que es el motor actualmente utilizado por los helpers del repositorio.

## Qué quedó implementado

| Paquete | Resultado y entradas principales |
| --- | --- |
| WP1 | Encargos con criterio, responsable, proyecto, presupuesto y tarea raíz; alta idempotente, actualización y cancelación transaccionales, filtros por estado y recuperación desde subtareas. [Servicio](../../server/src/services/assignments.ts), [páginas](../../ui/src/pages/Assignments.tsx). |
| WP2 | Presentación de una versión exacta, resolución humana, conflictos por versiones obsoletas, devolución con comentario y reapertura. Las aceptaciones se serializan por encargo y completan su raíz en revisión cuando todos los últimos entregables están aceptados, incluso si proceden de subtareas. Los eventos de finalización se publican después del commit. [Servicio](../../server/src/services/deliverable-reviews.ts), [panel](../../ui/src/components/DeliverableReviewPanel.tsx). |
| WP3 | Contexto organizado por oferta, marca, procedimientos y referencias de clientes; audiencia de empresa/proyecto, vigencia, carpetas visibles para agentes y registro de lecturas. El servidor obtiene el proyecto desde el run autenticado. [Servicio](../../server/src/services/context.ts), [página](../../ui/src/pages/Context.tsx). |
| WP4 | Atribución de costes de raíz y descendientes, sumas decimales exactas, desglose por agente/proveedor/entregable y consumo no atribuido explícito. Se distinguen importes estimados y consumo sin precio confirmado. [Servicio](../../server/src/services/assignment-costs.ts), [vista](../../ui/src/components/AssignmentCosts.tsx). |
| WP5 | Cuatro bloques de resultados en Inicio: trabajo activo, decisiones, entregables y costes. Los bloques nuevos aíslan sus errores y conservan el dashboard existente. [Servicio](../../server/src/services/assignment-dashboard.ts), [tarjetas](../../ui/src/components/AssignmentDashboard.tsx). |
| WP6 | Equipo opcional Contenido y vídeo con cuatro roles, proyecto y tarea plantilla; cuatro skills opcionales. Catálogos regenerados. [Equipo](../../packages/teams-catalog/catalog/optional/content/content-and-video/TEAM.md). |
| WP7 | Paquete independiente con FFmpeg, cortes, silencios, muletillas simples y frases, subtítulos ajustados a los cortes, exportación y sustitución de audio. Trabajos persistidos e idempotentes, snapshots de operaciones/transcripción, cola por empresa y recuperación sin repetir automáticamente cobros inciertos. Proveedores Whisper y ElevenLabs, recibos de coste, salida mediante adjunto protegido y pestañas de transcripción/operaciones. [Paquete](../../packages/media-studio/src/index.ts), [servicio](../../server/src/services/media-studio.ts), [proveedores](../../server/src/services/media-studio-providers.ts). |

El presupuesto del encargo se guarda y se muestra; no se ha creado una política de bloqueo nueva por objetivo. Los proveedores de medios pasan por el mecanismo de presupuestos existente. La sección Clientes de Contexto contiene archivos de referencia; no introduce entidades de CRM.

## Integración compartida

- Migración generada `0358_odd_whizzer.sql`, esquemas, tipos y validadores sincronizados. No se modifica la migración posterior de Oficina de otro trabajo del árbol compartido.
- Rutas, clientes API, navegación, Artefactos y salida de tareas enlazados.
- Catorce herramientas incorporadas al catálogo semántico y a la autoridad de herramientas existente. Las mutaciones quedan fuera de Ask y Plan; las API aplican la identidad y el alcance del run.
- [Mapa de producto](../../maps/feature-map/assignments.md) y [mapa de acceso de agentes](../../maps/agent-access-map/assignments.md) actualizados. Sus verificaciones estructurales no equivalen a una ejecución nativa real.

## Evidencia obtenida

| Comprobación | Resultado |
| --- | --- |
| TypeScript directo de servidor y UI | Pasa tras los cambios de integración. |
| TypeScript del Runner, generación de entrypoints y catálogo semántico | Pasan; catálogo generado comprobado contra sus fuentes. |
| Encargos y revisiones con PostgreSQL | 8/8, incluyendo concurrencia idempotente, aislamiento, versiones, reapertura, aceptación desde subtarea y documentos de otro autor vinculados a la tarea. |
| Costes y dashboard con PostgreSQL | Pasan las suites focalizadas, incluidas atribución de descendientes y aislamiento de secciones. |
| Contexto y medios con PostgreSQL | 31/31 en la última ejecución conjunta: 25 de archivos/contexto y 6 de medios, con render real, salida protegida, recibo y herencia del encargo. |
| Paquete de medios | 8/8 y typecheck; incluye FFmpeg real, exportaciones repetidas, sincronización, cancelación y frases de muletillas. |
| Proveedores y herramientas de medios | Pasan las pruebas focalizadas; FFmpeg real con audio TTS simulado y sin consumo de API de pago. |
| UI focalizada | 59/59 en cuatro archivos de pruebas. |
| Metadatos de salida multimedia | 1/1; rutas limitadas al recurso del mismo origen. |
| Catálogos | Equipo 11/11; skills distribuidas 10/10. La suite completa de skills encuentra el problema de subprocess npm de Windows. |
| Chromium | Ocho comprobaciones con API simulada: alta, fallo parcial de costes, motivo obligatorio, enlaces de contexto, anchura móvil, creación multimedia sin jobs precargados, pestañas y alineación del pie. Sin errores de página. |
| Build de la UI | Pasa. |
| Mapas | Pasa: 36 áreas y 184 identificadores. |

Las capturas y registros de esta sesión permanecen en `tmp/sprint-1-*`; el harness de UI está en `ui/tmp/sprint-qa`. Son archivos locales de verificación, no entregables publicados ni un recorrido productivo conectado a la base del usuario.

## Bloqueos de las comprobaciones globales

- `pnpm -r typecheck`: la fase Rust del Runner necesita `cargo`, que no está instalado. Los chequeos TypeScript indicados arriba se ejecutaron por separado.
- `pnpm test:run`: el lanzador general falla en Windows con `spawn pnpm ENOENT`. Las suites focalizadas se ejecutaron directamente con Vitest.
- `pnpm build`: el Runner detiene el build por desincronización del inventario de capacidades y sus referencias a los archivos de la skill Paperclip. No se regeneró ese inventario de otro trabajo para esconder el bloqueo.
- `pnpm check:token-gates`: sigue señalando `SidebarNavItem.tsx:156` por `#E8752B`, `w-[3px]` y `bg-[#E8752B]`, fuera de los cambios de UI de este sprint.

En Windows los scripts existentes con `mkdir -p` y `cp` se verificaron con Git Bash únicamente en el entorno del proceso. Los comandos afectados por `uv_os_get_passwd` o restricciones del sandbox se repitieron fuera del sandbox; no se modificó la consulta del usuario del sistema para hacer pasar las pruebas.

## Qué falta para certificar la definición de hecho completa

1. Resolver o recibir los cambios correspondientes a los bloqueos globales anteriores y repetir los cuatro comandos generales.
2. Ejecutar el recorrido en una instancia desechable con equipo instalado y un agente nativo real: contexto → edición → presentación → aceptación → coste e Inicio.
3. Probar transcripción y doblaje con secretos de una empresa autorizada y revisar el consumo del proveedor. Esta sesión usa respuestas controladas; ElevenLabs conserva el estado sin precio confirmado cuando no existe importe monetario verificable.

FFmpeg debe estar en `PATH` o en `FFMPEG_PATH`. Los proveedores buscan los secretos de empresa `OpenAI API Key`/`OPENAI_API_KEY` y `ElevenLabs API Key`/`ELEVENLABS_API_KEY`; si faltan, la API devuelve un error accionable antes de admitir trabajo de pago.

Modelos colaboradores: subagentes `gpt-6-luna` y Claude CLI `claude-sonnet-5-5`, con coordinación e integración en Codex.
