# Aprendizajes de procesos

Fecha: 2026-10-21
Identificador: APR
Estado de superficie: Existente experimental
Fase de ampliación: F6
Alcance: Ampliación posterior

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/learnings`

Fuentes para preparar la implementación:

- [ui/src/pages/Pipelines.tsx](../../../../ui/src/pages/Pipelines.tsx)

## Uso en los pilotos

La ampliación se elige después de observar la necesidad en un piloto. Su fase de referencia no obliga a retrasar los otros recorridos.

## Qué mantendremos y por qué

- Superficie existente de aprendizajes ligada a pipelines; verificar su alcance antes de extenderla.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Separar sugerencia de mejora y modificación efectiva del procedimiento. | La observación de un resultado no autoriza cambios de política. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Fuente, proceso, resultado y propuesta de cambio revisable. | Da trazabilidad a la mejora continua. |

## Datos y contrato de operación

Referencia a ejecuciones y decisión de mejora con acceso limitado al contexto original.

## Recorrido y estados

Revisar patrón → abrir ejemplos → proponer cambio → revisar configuración por vía normal.

- Un ejemplo privado no se publica como aprendizaje de empresa.
- La propuesta no se activa por leerla.

## Tareas

Trabajo de ampliación de esta ficha, activable por el [backlog](../2026-10-21-backlog-fases.md). Su validación no bloquea el uso de la página existente.

| ID | Fase | Entregable | Depende de |
| --- | --- | --- | --- |
| APR.01 | F6 | Delimitar fuentes y privacidad de aprendizajes reutilizables. | G03, G06, G10 |
| APR.02 | F6 | Añadir propuesta de mejora con vínculo a revisión del procedimiento. | APR.01, G18, G19 |
| APR.03 | F6 | Comprobar: Cada recomendación puede rastrearse a ejemplos autorizados. Los cambios pasan por las reglas de edición de rutina o pipeline. | APR.02 |

## Criterios de aceptación

- Cada recomendación puede rastrearse a ejemplos autorizados.
- Los cambios pasan por las reglas de edición de rutina o pipeline.

## Páginas relacionadas

- [Procesos y pipelines](2026-10-21-pipelines.md)
- [Detalle de rutina](2026-10-21-rutina.md)
- [Decisiones y pendientes humanos](2026-10-21-decisiones.md)
