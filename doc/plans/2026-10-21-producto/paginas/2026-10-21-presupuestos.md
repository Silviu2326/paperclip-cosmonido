# Presupuestos de ejecución

Fecha: 2026-10-21
Identificador: PRE
Estado de superficie: Existente dentro de auditoría y configuración
Fase de ampliación: F4
Alcance: Regresión cuando cambie esta superficie

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/activity/budgets`
- `/audit/budgets`
- `/budgets`

Fuentes para preparar la implementación:

- [ui/src/pages/audit/AuditHub.tsx](../../../../ui/src/pages/audit/AuditHub.tsx)
- [packages/db/src/schema/budget_policies.ts](../../../../packages/db/src/schema/budget_policies.ts)

## Qué mantendremos y por qué

- Políticas, reservas y hard stop del gasto; no relajar pausas por añadir ingresos estimados.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Mostrar ámbito y efecto del presupuesto sobre trabajo comercial y de entrega. | El usuario debe saber qué ejecución quedará detenida. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Diagnóstico de límites que bloquean un proyecto y acceso a su política. | Permite resolver la causa real. |

## Datos y contrato de operación

Presupuestos existentes de empresa, agente o proyecto según soporte efectivo; extensiones por cliente requieren contrato, no duplicación de reservas.

## Recorrido y estados

Consultar consumo y reservas → revisar política → modificar bajo autoridad → comprobar recuperación.

- Presupuesto agotado conserva el trabajo y explica la pausa.
- Un ingreso previsto no aumenta automáticamente la autoridad de gasto.

## Lista de regresión

Activar esta revisión cuando una entrega cambie la página o uno de sus contratos. Los posibles cambios descritos arriba se evalúan entonces; esta ficha no añade trabajo al piloto por sí sola.

- [ ] La interfaz y el servidor coinciden en los límites efectivos.
- [ ] Cambiar un filtro no altera la política ni recalcula el gasto de forma distinta.

## Páginas relacionadas

- [Costes de ejecución](2026-10-21-costes.md)
- [Detalle de proyecto](2026-10-21-proyecto.md)
- [Detalle del agente](2026-10-21-agente.md)
