# Detalle del espacio de ejecución

Fecha: 2026-10-21
Identificador: WSE
Estado de superficie: Existente
Fase de ampliación: F1
Alcance: Regresión cuando cambie esta superficie

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/execution-workspaces/:workspaceId`
- `/execution-workspaces/:workspaceId/services`
- `/execution-workspaces/:workspaceId/configuration`
- `/execution-workspaces/:workspaceId/runtime-logs`
- `/execution-workspaces/:workspaceId/issues`
- `/execution-workspaces/:workspaceId/routines`

Fuentes para preparar la implementación:

- [ui/src/pages/ExecutionWorkspaceDetail.tsx](../../../../ui/src/pages/ExecutionWorkspaceDetail.tsx)

## Qué mantendremos y por qué

- Provisionamiento, servicios, logs, repositorios y límites físicos y de acceso.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Mostrar contexto de encargo sin cambiar la política del runtime. | La relación comercial no concede acceso al host. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Añadir enlaces al bloqueo que originó el diagnóstico. | Permite reparar el problema concreto. |

## Datos y contrato de operación

Execution workspace y políticas vigentes; conservar procedencia y lectores retenidos.

## Recorrido y estados

Diagnosticar → aplicar corrección autorizada → comprobar tarea.

- No se cambia trust preset para permitir un acceso denegado.

## Lista de regresión

Activar esta revisión cuando una entrega cambie la página o uno de sus contratos. Los posibles cambios descritos arriba se evalúan entonces; esta ficha no añade trabajo al piloto por sí sola.

- [ ] No se cambia trust preset para permitir un acceso denegado.
- [ ] El estado se basa en servicios y procesos observados.

## Páginas relacionadas

- [Espacios de trabajo](2026-10-21-espacios.md)
- [Detalle de tarea](2026-10-21-tarea.md)
- [Entornos de ejecución](2026-10-21-entornos.md)
