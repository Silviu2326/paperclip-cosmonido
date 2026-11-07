# Integración del sprint 4 con S1, Oficina, S2 y S3

Este documento conserva el primer corte local. El estado y los límites de la tanda posterior se describen en [Avance hacia el 80 %](2026-10-22-sprints-80.md); esa ampliación no convierte este informe histórico en aceptación de los cuatro sprints.

Fecha: 2026-10-22. Base: `integracion`, commit `809454f96` (fusión previa `42ac31432`).

Esta entrega conecta las piezas adelantadas de S4 con el producto existente. No cierra el [sprint 4 completo](2026-10-21-plan-maestro-producto.md#sprint-4-producto-que-se-vende-solo). Tres subagentes GPT-6 Luna preparan el código en un worktree separado; el traslado local a `integracion` conserva las modificaciones concurrentes.

## Qué se mantiene

- Las migraciones S1–3 hasta `0362`, CRM, Oficina y autonomía unificada. No se incorpora una segunda definición de clientes, leads, permisos ni autonomía.
- La contratación y sus aprobaciones. Elegir un perfil no concede permisos, presupuesto ni credenciales. Contratar puede lanzar preparación técnica del lifecycle existente; no inicia un encargo desde este panel.
- Encargos, tareas raíz y revisiones de entregable del S1. El onboarding utiliza sus registros y no afirma trabajo o aceptación inexistentes.
- El onboarding técnico anterior de empresa y adaptador. La puesta en marcha de negocio es una ruta adicional dentro de una empresa existente.
- Presupuesto, pausa y autoridad existentes. El contrato puro de límites de S4 todavía no acredita una suscripción pagada ni sustituye controles del servidor.

## Qué se conecta y por qué

| Superficie | Cambio y motivo | Detalle |
| --- | --- | --- |
| Puesta en marcha | Ruta `/<prefijo>/productization` desde Negocio; hacer accesibles los módulos preparados | [Interfaz](2026-10-22-s4-integracion-ui.md) |
| Catálogo y contratación | Preview autenticado de JSON portable y selección de un perfil persistente antes de contratar por la API actual | [Catálogo](2026-10-22-s4-integracion-catalogo.md) |
| Onboarding | Persistencia por empresa, revisión concurrente y confirmaciones humanas; poder reanudar sin perder estado | [Backend](2026-10-22-s4-integracion-onboarding.md) |
| Equipo y primer trabajo | Selección explícita de agentes y encargo reales; evitar atribuir trabajo previo al nuevo recorrido | [Backend](2026-10-22-s4-integracion-onboarding.md) e [interfaz](2026-10-22-s4-integracion-ui.md) |
| Descubrimiento | Mapas y contratos de las nuevas rutas; distinguir permisos de evidencia ejecutada | [Producto](../../maps/feature-map/productization.md), [acceso](../../maps/agent-access-map/productization.md) |

Un preview no instala un paquete completo. Contratar un perfil no instala formularios, playbooks, presets, conexiones ni especialistas temporales. Una conexión disponible no equivale a conexión probada. Un encargo creado no equivale a ejecución iniciada y un resultado generado no equivale a aceptación.

## Orden de integración y paralelismo

1. **Base.** Fijar `809454f96`, conservar el workspace anterior y copiar solo los archivos específicos de S4 a un worktree aislado. No volver a fusionar S1–3 ni copiar sus archivos desde una rama anterior.
2. **Tres pistas en paralelo.** Backend posee tabla, contrato y rutas; frontend posee página y cliente del contrato acordado; catálogo posee preview y contratación. Los contratos se comunican antes de conectar la pantalla.
3. **Enganches centrales.** Registrar routers en API autenticada, ruta de empresa, redirección sin prefijo y navegación. Alinear descubrimiento y documentación con las rutas realmente implementadas.
4. **Revisión de fuente.** Revisar alcance de empresa, actor, revisiones concurrentes, respuestas tardías, evidencias y conservación de presupuesto/aprobaciones. No sustituye pruebas.
5. **Incorporación local.** Comparar cada archivo de destino con la base antes de trasladar el delta a `paperclip-int`, rama `integracion`. Integrar cambios concurrentes si existen. Dejar el resultado sin commit ni subida.
6. **Verificación posterior.** Reconciliar generación de migración/snapshot y comprobar recorridos en instancia aislada cuando se autorice. Pendiente: esta entrega prohíbe tests, builds y checks.

## Datos y migración

El onboarding utiliza almacenamiento propio con unicidad de empresa y revisión de concurrencia. No reutiliza las semillas de alta de Cloud (`company_onboarding_seeds`) ni ajustes de instancia para datos de una empresa.

La cuenta comercial aún no existe en esta base self-hosted. La ausencia se representa expresamente; no se usa `companyId` como cuenta ficticia. La autorización sigue aplicándose por empresa.

Se prepara `0363_s4_productization_onboarding.sql` sin aplicarla. No se ejecuta `pnpm db:generate`, que incluye compilación y contradice el límite solicitado. No se inventa un snapshot de Drizzle. La generación/reconciliación debe hacerse antes de declarar la entrega verificada y lista para desplegar.

## Trabajo restante

| Bloque | Dependencia | Trabajo paralelo posible |
| --- | --- | --- |
| Cuentas, cobro y límites duraderos | Titular/cuenta y política de suscripción | Ofertas y captación de pilotos |
| Instalación completa/publicación de paquetes | Versiones, recursos soportados y revisión | Formularios, presets y plantillas de medios |
| Extracción desde URL y conexiones probadas | Extracción con límites, proveedores y recibos reales | Guiones de los tres caminos |
| Especialistas por encargo | Ciclo de vida temporal y autoridad del encargo | Catálogo sin ejecución |
| Latidos adaptativos | Persistencia, aprobación, revisión atómica y planificador | [Contrato puro](2026-10-22-s4-latidos-adaptativos.md) |
| Artefactos activos | Fuentes/versiones, eventos y revisión | [Contrato puro](2026-10-22-s4-artefactos-activos.md) |
| Portal, agencia multiempresa, móvil, roles e idiomas | Aislamiento de titular y contratos de acceso | Diseño por página del plan maestro |
| Tres pilotos externos | Comprador, responsable, coste actual y aceptación | Selección de casos antes de trabajo real |

`plan-gate.ts`, `adaptive-cadence.ts` y `active-artifact.ts` siguen siendo funciones puras preparatorias. No acreditan cobro, cambios del planificador ni mantenimiento automático de archivos.

## Deuda previa y evidencia

Permanecen independientes el drift del runner (`check:capability-inventory` y grupos de operaciones), el invocador real de Google Calendar, la pantalla `lead_forms` y las herramientas `review_link_*` / `crm_sync_status`. Esta entrega no declara que el build global pasa. Véanse las [notas previas](2026-10-21-sprint-2-integracion.md).

Revisión de fuente únicamente. No se ejecutan tests, typecheck, builds, scripts de validación, servidores ni migraciones. Las verificaciones de S1–3 comunicadas por el usuario no prueban los cambios de S4. No se hacen commits, push, PR, publicaciones ni cambios en la rama principal.

Los documentos de [adelanto](2026-10-22-sprint-4-adelanto.md) y [tanda 2](2026-10-22-s4-tanda-2-entrega.md) conservan su estado histórico. Para el montaje actual prevalecen este documento y los tres anexos de integración.
