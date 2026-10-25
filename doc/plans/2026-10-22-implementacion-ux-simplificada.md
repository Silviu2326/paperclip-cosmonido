# Implementación UX simplificada: estado y evidencia

Fecha: 2026-10-22. Estado: implementación local; publicación y aceptación con usuarios pendientes.

Este registro acompaña el [plan UX](2026-10-22-plan-ux-conservar-y-simplificar.md). Describe el código integrado disponible en `tmp/s4-integracion-20261022`; no declara que esos cambios estén desplegados ni que la variante parcial de la raíz ya los contenga. No se asignan porcentajes de avance.

## Estado observado

| Superficie | Evidencia de implementación integrada | Límite actual |
| --- | --- | --- |
| Navegación de negocio | La sidebar agrupa accesos de negocio en Clientes, Ventas y Conversaciones, con enlaces a `/customers`, `/sales` y `/conversations`. | Revisar ambos layouts, flags, enlaces heredados y navegación móvil al cerrar la integración. |
| Tareas | El listado conserva el flujo de tareas y añade filtros de revisión; el detalle integra el panel de resultado esperado y revisión en el contexto de la tarea. La asignación backend permanece como contrato operativo. | Resultado, revisión y cliente son contexto opcional; no se ha demostrado aquí el recorrido persistente contra una instancia real. |
| Proyectos | La ficha permite seleccionar un cliente opcional por nombre/dominio, con búsqueda y paginación. Enlaza a las revisiones pendientes del proyecto y a su contexto. | Verificar persistencia con proyectos internos sin cliente y proyectos vinculados a cliente. No se inventan contadores de resultados. |
| Bandeja | Se conserva el destino de Bandeja y la compatibilidad de rutas; la vista combinada con Tareas sigue su flag. | Revisar transiciones entre layouts y que los nuevos indicadores no amplíen suscripciones. |
| Archivos y medios | La integración reúne contexto y archivos/artefactos, con superficies de medios relacionadas. | Revisar versiones, audiencia, permisos y la relación entre contexto de entrada y resultado; no se declara un almacén nuevo. |
| Apps y ajustes | Apps mantiene su catálogo y conexiones. La configuración reutiliza navegación contextual de ajustes; las preferencias de notificación distinguen ámbito personal/empresa y las rutas de bandeja. | Verificar rutas, ámbitos, permisos, proveedor real y configuración de Web Push. |
| Equipo y rutinas | Añadir equipo abre selección, revisión y contratación. Habilidades, Autonomía y Oficina se encuentran desde Equipo; Autonomía admite un filtro real de agente. Los procedimientos se enlazan desde Rutinas, también en el layout antiguo. | Se conservan perfiles, historial, contratación, programación y moderación. El editor avanzado sigue guardando borradores. No se ha ejecutado una contratación real en esta revisión. |

## Evidencia disponible y pendiente

La tanda consolidada de 24 archivos registra **323 pruebas correctas, cero fallidas y 10 omitidas**. Incluye creación/reintento, rutas, configuración, proyectos, filtros, equipo y contratos. Las pruebas conductuales confirman una sola creación con resultado, apertura de la tarea principal, presupuesto cero e idempotencia tras error de red.

Typecheck específico de UI y servidor, build de UI, gates de tokens y validación de los 40 idiomas: correctos. Check de mapas en el checkout integrado: 48 áreas y 267 capacidades alineadas; es una comprobación estructural. En navegador local, los layouts nuevo y antiguo pasan pestañas CRM, aliases con parámetros/ancla, envío del filtro de revisión, preferencias persistentes y menú móvil, con cero errores JavaScript sin capturar y sin desbordamiento horizontal en esos recorridos.

`pnpm -r typecheck` se detiene en `kv-demo-mcp-server` por falta de `@modelcontextprotocol/sdk/types.js` y dependencias locales. `pnpm build` se detiene en el preflight por falta de `cli/node_modules/tsx/dist/cli.mjs`. Los logs conservan estos bloqueos; no se declara un build completo del repositorio. No se ejecutó la suite general: la autorización vigente es para comprobaciones locales y pruebas específicas.

Las 10 pruebas omitidas requieren PostgreSQL embebido, que el helper marca como no compatible con este entorno. Incluyen visibilidad antes de paginar, revisión más reciente, idempotencia concurrente y sincronización de estados. Están escritas, pero no se presentan como ejecutadas. Las pruebas de navegador usan una API sintética; no acreditan persistencia contra la VPS, entregas reales ni comodidad para un comprador.

Los informes se conservan en `paperclip/tmp/ux-implementation-20261022/`: `final-focused-tests-2.json`, `ui-typecheck-3.log`, `server-typecheck-1.log`, `ui-build-3.log`, `token-gates-1.log`, `workspace-typecheck-1.log` y `workspace-build-1.log`. Se conservan las primeras ejecuciones fallidas y sus reintentos. Capturas e informes de navegador: carpeta temporal del usuario `paperclip-sidebar-20261022`, nombres `ux-after-4` y `ux-after-legacy-2`.

## Decisiones de implementación y entrega

- Una tarea simple conserva su creación habitual. Con criterios de aceptación usa la creación transaccional de assignment y abre su tarea principal. Esta modalidad requiere un agente; presupuesto cero sigue siendo cero. No se elimina el modelo backend ni las herramientas del runner.
- Edición, cancelación y reapertura mantienen sincronizados los registros. Terminar la ejecución no equivale a aceptar un resultado. Los filtros de revisión y proyecto se aplican en el servidor antes de paginar, conservando las condiciones de visibilidad.
- Las preferencias de navegación se guardan por usuario, empresa y navegador. Por compatibilidad, Clientes, Ventas y Conversaciones aparecen inicialmente; Agenda y Oficina se pueden fijar. Ocultar accesos no cambia permisos ni elimina rutas.
- Contexto y Producción se encuentran en Archivos. Crear vídeo es una acción, también desde un vídeo disponible; el selector excluye fuentes vencidas o con fechas inválidas. Se reutiliza el almacén existente.
- Ajustes separa acceso personal, retención de empresa y eliminación de cuenta comercial. Miembros y empresas disponibles se seleccionan por nombre; el ID manual queda como opción avanzada. Avisos apunta al trabajo para resolverlo; no añade otra aprobación.
- La entrega se prepara para el checkout `paperclip-int`, rama `integracion`, mediante comparación de preimágenes, copia selectiva y verificación de hashes. La variante anterior de código en la raíz no se sustituye en bloque. Esta reorganización no incluye commits, push, fusión a principal ni despliegue.

## Cierre de los ajustes finales

- El desplegable Resultado y revisión está en la zona común de la ficha, disponible con el shell de chat y con la vista clásica. La revisión de la tarea principal aparece una sola vez; las tareas simples mantienen su revisión en Actividad. Los enlaces antiguos de detalle abren `#outcome` si no traían un ancla propia. Pruebas del panel, CTA, costes y aliases: 17/17. Integración del detalle con los dos layouts: 2/2; los otros 157 casos se excluyeron mediante filtro, no por incompatibilidad.
- Las rutas de resultados comprueban la privacidad de la tarea y de su raíz. Listar resultados aplica el predicado antes de paginar; actualizar/cancelar una raíz privada devuelve 404 antes de mutar. Inicio filtra tareas y revisiones privadas antes de límites y contadores. Los costes conservan el agregado financiero autorizado de empresa y omiten atribución privada: esos importes se muestran como «Sin desglose por tarea», sin títulos ni IDs privados.
- Pruebas enfocadas finales de privacidad: 20 correctas y 6 omitidas por PostgreSQL; pruebas de rutas de costes: 6/6, incluyendo recursos inexistentes, privados y de otra empresa. Las seis omisiones son adicionales a las diez de la tanda consolidada. Sigue pendiente ejecutar las dos suites SQL en un entorno compatible.
- Typecheck específico de servidor y UI tras la integración de componentes y controles de acceso: correcto. Se conservan los bloqueos de dependencias para los comandos globales ya descritos.

Evidencia suplementaria: `result-ui-tests-final-2.json`, `detail-layout-tests-final.json`, `privacy-tests-final.json`, `cost-route-tests-final.json`, `server-typecheck-complete.log`, `ui-typecheck-complete.log` y `token-gates-final.log`. El build de entrega valida también los 40 idiomas; su log es `ui-build-publish-ready.log`. Todos pertenecen a `paperclip/tmp/ux-implementation-20261022/`. La comparación y la copia de entrega se registran en `integration-preflight.json` e `integration-result.json`, con respaldo de preimágenes. La publicación y la aceptación con usuarios reales siguen siendo pasos separados.

## Fuentes inspeccionadas

- [`Sidebar.tsx`](../../tmp/s4-integracion-20261022/ui/src/components/Sidebar.tsx): navegación de negocio.
- [`Issues.tsx`](../../tmp/s4-integracion-20261022/ui/src/pages/Issues.tsx) y [`TaskOutcomePanel.tsx`](../../tmp/s4-integracion-20261022/ui/src/components/TaskOutcomePanel.tsx): filtro y panel de resultado/revisión.
- [`CompanySettingsSidebar.tsx`](../../tmp/s4-integracion-20261022/ui/src/components/CompanySettingsSidebar.tsx) y [`NotificationSettings.tsx`](../../tmp/s4-integracion-20261022/ui/src/pages/NotificationSettings.tsx): navegación contextual y ámbitos de notificaciones.

