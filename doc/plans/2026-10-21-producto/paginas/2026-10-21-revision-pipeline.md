# Cola de revisión de procesos

Fecha: 2026-10-21
Identificador: REV
Estado de superficie: Existente experimental
Fase de ampliación: F4
Alcance: Regresión cuando cambie esta superficie

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/review-queue`

Fuentes para preparar la implementación:

- [ui/src/pages/Pipelines.tsx](../../../../ui/src/pages/Pipelines.tsx)

## Qué mantendremos y por qué

- Revisión de movimientos y resultados de pipeline.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Enlazar revisiones desde Decisiones evitando otra bandeja incompatible. | El operador necesita una entrada común y resolución especializada. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Cliente, compromiso, evidencia y efecto de aceptar. | Permite resolver con contexto suficiente. |

## Datos y contrato de operación

Revisiones del motor; mantener identidad y versión de la decisión en la cola general.

## Recorrido y estados

Llegar desde Decisiones → revisar evidencia → aceptar o rechazar → comprobar transición.

- Una propuesta obsoleta no se acepta sobre una versión nueva.
- Resolver en otra pestaña actualiza el estado sin resolver dos veces.

## Lista de regresión

Activar esta revisión cuando una entrega cambie la página o uno de sus contratos. Los posibles cambios descritos arriba se evalúan entonces; esta ficha no añade trabajo al piloto por sí sola.

- [ ] Cada revisión tiene efecto y destinatario visibles.
- [ ] Se preservan autorizaciones y auditoría de la transición.

## Páginas relacionadas

- [Decisiones y pendientes humanos](2026-10-21-decisiones.md)
- [Elemento de pipeline](2026-10-21-pipeline-elemento.md)
- [Aprobaciones](2026-10-21-aprobaciones.md)
