# Cola de decisión

Fecha: 2026-10-21
Identificador: DEQ
Estado de superficie: Existente
Fase de ampliación: F4
Alcance: Regresión cuando cambie esta superficie

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/decisions/queues/:key`

Fuentes para preparar la implementación:

- [ui/src/pages/DecisionQueuePage.tsx](../../../../ui/src/pages/DecisionQueuePage.tsx)

## Qué mantendremos y por qué

- Modelo de cola, filtros y resolución existentes.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Definir contratos para cada tipo comercial antes de añadir tarjetas. | Las decisiones necesitan efectos y requisitos específicos. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Comparación de versión propuesta y vigente y evidencia contextual. | Ayuda a decidir sin salir a logs. |

## Datos y contrato de operación

Elemento de cola y sujeto autorizado. Las acciones por lote solo se permiten para decisiones con semántica compatible y revisión suficiente.

## Recorrido y estados

Abrir cola → comprobar sujeto y versión → aceptar o rechazar → conciliar resultado.

- Un elemento no resoluble por el actor muestra el motivo autorizado.
- Un fallo parcial de lote identifica cada resultado sin repetir éxitos.

## Lista de regresión

Activar esta revisión cuando una entrega cambie la página o uno de sus contratos. Los posibles cambios descritos arriba se evalúan entonces; esta ficha no añade trabajo al piloto por sí sola.

- [ ] Las decisiones obsoletas no se aplican a contenido nuevo.
- [ ] No se filtran nombres de sujetos privados en contadores o filtros.

## Páginas relacionadas

- [Decisiones y pendientes humanos](2026-10-21-decisiones.md)
- [Detalle de aprobación](2026-10-21-aprobacion.md)
- [Detalle de propuesta y compromiso](2026-10-21-propuesta.md)
