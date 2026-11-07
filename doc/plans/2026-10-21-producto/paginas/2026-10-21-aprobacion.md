# Detalle de aprobación

Fecha: 2026-10-21
Identificador: APD
Estado de superficie: Existente
Fase de ampliación: F4
Alcance: Ampliación candidata; seleccionar por piloto

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/approvals/:approvalId`

Fuentes para preparar la implementación:

- [ui/src/pages/ApprovalDetail.tsx](../../../../ui/src/pages/ApprovalDetail.tsx)

## Qué mantendremos y por qué

- Solicitud, estado, comentarios y resolución autorizada.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Presentar versión, alcance y efecto exacto de la aprobación. | Evita autorizar contenido modificado tras la revisión. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Enlace al objeto y resultado confirmado de la acción. | Permite comprobar si la autorización se ejecutó o quedó bloqueada. |

## Datos y contrato de operación

Approval y revisión del sujeto; aplicar control de versión y permisos en servicio, no solo en botón.

## Recorrido y estados

Leer solicitud → revisar contenido → aprobar o rechazar → seguir efecto.

- Una respuesta de red ambigua se reconcilia antes de resolver de nuevo.
- Cambiar el contenido invalida o actualiza la solicitud según contrato.

## Tareas

Trabajo de ampliación de esta ficha, activable por el [backlog](../2026-10-21-backlog-fases.md). Su validación no bloquea el uso de la página existente.

| ID | Fase | Entregable | Depende de |
| --- | --- | --- | --- |
| APD.01 | F4 | Definir revisión del sujeto y efecto para nuevos tipos. | G03, G08, G10 |
| APD.02 | F4 | Mejorar detalle y conciliación de resolución. | APD.01, G17, G18 |
| APD.03 | F4 | Comprobar: Doble clic produce una sola resolución. La autorización no se convierte en permiso permanente fuera de su alcance. | APD.02 |

## Criterios de aceptación

- Doble clic produce una sola resolución.
- La autorización no se convierte en permiso permanente fuera de su alcance.

## Páginas relacionadas

- [Aprobaciones](2026-10-21-aprobaciones.md)
- [Decisiones y pendientes humanos](2026-10-21-decisiones.md)
- [Detalle de tarea](2026-10-21-tarea.md)
