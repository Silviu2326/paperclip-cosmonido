# Elemento de pipeline

Fecha: 2026-10-21
Identificador: PIE
Estado de superficie: Existente experimental
Fase de ampliación: F3
Alcance: Ampliación candidata; seleccionar por piloto

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/pipelines/:pipelineId/items/:caseId`
- `/pipelines/:pipelineId/cases/:caseId`

Fuentes para preparar la implementación:

- [ui/src/pages/Pipelines.tsx](../../../../ui/src/pages/Pipelines.tsx)
- [packages/db/src/schema/pipeline_cases.ts](../../../../packages/db/src/schema/pipeline_cases.ts)

## Qué mantendremos y por qué

- Leases, tareas enlazadas, documentos, hijos y estado de continuidad del caso.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Presentar campos de negocio tipados cuando se corresponda con oportunidad o entrega. | El motor no debe ocultar la entidad real al usuario. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Fuente comercial y evidencia de la transición propuesta. | Permite revisar el movimiento de un agente. |
| Salida hacia la ficha de negocio sin duplicar estado. | Evita dos versiones de la misma oportunidad. |

## Datos y contrato de operación

PipelineCase y referencias de dominio; el bloqueo de edición no sustituye al checkout de tareas.

## Recorrido y estados

Abrir caso → revisar trabajo y evidencia → ejecutar o revisar transición → consultar resultado.

- Lease vencido o versión concurrente pide recargar y conciliar.
- Un retry conserva el historial y distingue trabajo retirado de resultado vigente.

## Tareas

Trabajo de ampliación de esta ficha, activable por el [backlog](../2026-10-21-backlog-fases.md). Su validación no bloquea el uso de la página existente.

| ID | Fase | Entregable | Depende de |
| --- | --- | --- | --- |
| PIE.01 | F3 | Definir mapeo de caso y entidad comercial con control de versión. | G03, G04, G06 |
| PIE.02 | F3 | Añadir contexto, evidencia y navegación compartida. | PIE.01, G16 |
| PIE.03 | F3 | Comprobar: No se pierden los controles de concurrencia y retiro existentes. La ficha comercial y el pipeline muestran la misma transición confirmada. | PIE.02 |

## Criterios de aceptación

- No se pierden los controles de concurrencia y retiro existentes.
- La ficha comercial y el pipeline muestran la misma transición confirmada.

## Páginas relacionadas

- [Procesos y pipelines](2026-10-21-pipelines.md)
- [Ficha de la oportunidad](2026-10-21-oportunidad.md)
- [Detalle de caso duradero](2026-10-21-caso.md)
