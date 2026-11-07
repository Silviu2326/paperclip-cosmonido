# Procesos y pipelines

Fecha: 2026-10-21
Identificador: PIP
Estado de superficie: Existente experimental
Fase de ampliación: F3
Alcance: Ampliación candidata; seleccionar por piloto

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/pipelines`
- `/pipelines/:pipelineId`
- `/pipelines/:pipelineId/add`

Fuentes para preparar la implementación:

- [ui/src/pages/Pipelines.tsx](../../../../ui/src/pages/Pipelines.tsx)
- [packages/db/src/schema/pipelines.ts](../../../../packages/db/src/schema/pipelines.ts)

## Qué mantendremos y por qué

- Etapas, transiciones, casos, automatizaciones y mecanismos de control existentes.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Distinguir proceso genérico y vista comercial especializada. | Una oportunidad conserva su identidad aunque use etapas del motor. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Plantillas para cualificación y entrega con criterios de entrada y salida. | Reduce configuración repetida. |
| Visibilidad de bloqueo, revisión y próxima acción. | Hace operable el avance por etapas. |

## Datos y contrato de operación

Pipelines y pipelineCases existentes. G06 decide si las relaciones comerciales se extienden, envuelven o enlazan al motor; no forzar campos críticos solo a JSON genérico.

## Recorrido y estados

Elegir proceso → inspeccionar etapa y caso → completar trabajo → transicionar según reglas.

- Una tarjeta sin acción viable muestra su bloqueo real.
- Mover de etapa no salta una revisión obligatoria.

## Tareas

Trabajo de ampliación de esta ficha, activable por el [backlog](../2026-10-21-backlog-fases.md). Su validación no bloquea el uso de la página existente.

| ID | Fase | Entregable | Depende de |
| --- | --- | --- | --- |
| PIP.01 | F3 | Resolver compatibilidad del motor con procesos de venta y entrega. | G03, G06 |
| PIP.02 | F3 | Añadir plantillas y contexto sin duplicar el motor. | PIP.01, G16 |
| PIP.03 | F3 | Comprobar: Los procesos existentes siguen funcionando con la vista comercial añadida. La elección del motor queda documentada antes de implementar el pipeline de ventas. | PIP.02 |

## Criterios de aceptación

- Los procesos existentes siguen funcionando con la vista comercial añadida.
- La elección del motor queda documentada antes de implementar el pipeline de ventas.

## Páginas relacionadas

- [Configuración de pipeline](2026-10-21-pipeline-configuracion.md)
- [Elemento de pipeline](2026-10-21-pipeline-elemento.md)
- [Oportunidades](2026-10-21-oportunidades.md)
- [Cola de revisión de procesos](2026-10-21-revision-pipeline.md)
