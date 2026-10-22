# Decisiones y pendientes humanos

Fecha: 2026-10-21
Identificador: DEC
Estado de superficie: Existente
Fase de ampliación: F4
Alcance: Ampliación candidata; seleccionar por piloto

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/decisions`

Fuentes para preparar la implementación:

- [ui/src/pages/WhatNeedsMe.tsx](../../../../ui/src/pages/WhatNeedsMe.tsx)

## Qué mantendremos y por qué

- Atención, filtros, historial, colas y resolución con sus reglas actuales.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Añadir pendientes comerciales y de entrega solo cuando requieren decisión real. | No convertir toda actividad en otra notificación. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Contexto, efecto esperado y evidencia para envíos, alcance y entregas. | Permite revisar antes de autorizar. |
| Enlace directo a cola especializada conservando identidad de decisión. | Evita doble resolución y fragmentación. |

## Datos y contrato de operación

Atención y decisiones existentes con tipos de negocio ampliados por contratos. No usar una fila visual como sustituto de una aprobación gobernada.

## Recorrido y estados

Ver pendiente → inspeccionar cambio → resolver → comprobar efecto o bloqueo.

- Una revisión o propuesta caducada exige actualizar.
- Un pendiente resuelto en otra sesión desaparece como accionable sin perder historial.

## Tareas

Trabajo de ampliación de esta ficha, activable por el [backlog](../2026-10-21-backlog-fases.md). Su validación no bloquea el uso de la página existente.

| ID | Fase | Entregable | Depende de |
| --- | --- | --- | --- |
| DEC.01 | F4 | Definir tipos de pendientes de negocio y política de resolución. | G03, G08, G10 |
| DEC.02 | F4 | Integrar colas comerciales y de entrega con el centro de decisiones. | DEC.01, G17, G18 |
| DEC.03 | F4 | Comprobar: No aparecen solicitudes sin acción humana concreta. Resolver conserva versión, audiencia y auditoría y no autoriza acciones distintas. | DEC.02 |

## Criterios de aceptación

- No aparecen solicitudes sin acción humana concreta.
- Resolver conserva versión, audiencia y auditoría y no autoriza acciones distintas.

## Páginas relacionadas

- [Cola de decisión](2026-10-21-cola-decisiones.md)
- [Cola de revisión de procesos](2026-10-21-revision-pipeline.md)
- [Aprobaciones](2026-10-21-aprobaciones.md)
