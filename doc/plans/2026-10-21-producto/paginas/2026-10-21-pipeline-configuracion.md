# Configuración de pipeline

Fecha: 2026-10-21
Identificador: PIC
Estado de superficie: Existente experimental
Fase de ampliación: F3
Alcance: Ampliación candidata; seleccionar por piloto

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/pipelines/:pipelineId/settings`

Fuentes para preparar la implementación:

- [ui/src/pages/PipelineSettings.tsx](../../../../ui/src/pages/PipelineSettings.tsx)

## Qué mantendremos y por qué

- Edición de etapas, transiciones y automatizaciones con sus validaciones.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Explicar efectos sobre casos activos antes de aplicar una configuración. | Cambiar etapas puede dejar trabajo sin continuación. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Criterios de etapa, responsables y revisión de automatizaciones. | Relaciona flujo y decisiones. |
| Plan de migración para etapas retiradas y diagnóstico previo. | Evita casos huérfanos o movimientos silenciosos. |

## Datos y contrato de operación

Configuración versionada, referencias de casos activos y rutinas. Validar antes de modificar; no automatizar migraciones de estado sin decisión explícita.

## Recorrido y estados

Preparar cambio → revisar impacto → resolver casos afectados → guardar → comprobar continuidad.

- Eliminar una etapa ocupada no pierde casos.
- Un permiso insuficiente impide cambiar efectos externos aunque pueda editarse una etiqueta.

## Tareas

Trabajo de ampliación de esta ficha, activable por el [backlog](../2026-10-21-backlog-fases.md). Su validación no bloquea el uso de la página existente.

| ID | Fase | Entregable | Depende de |
| --- | --- | --- | --- |
| PIC.01 | F3 | Definir impacto y migración de configuración sobre casos activos. | G03, G06, G08 |
| PIC.02 | F3 | Añadir edición segura y explicación de automatizaciones. | PIC.01, G16 |
| PIC.03 | F3 | Comprobar: Los casos activos conservan estado válido tras un cambio. La configuración no puede eliminar por accidente una revisión requerida. | PIC.02 |

## Criterios de aceptación

- Los casos activos conservan estado válido tras un cambio.
- La configuración no puede eliminar por accidente una revisión requerida.

## Páginas relacionadas

- [Procesos y pipelines](2026-10-21-pipelines.md)
- [Elemento de pipeline](2026-10-21-pipeline-elemento.md)
- [Detalle de rutina](2026-10-21-rutina.md)
