# Historial de ejecuciones

Fecha: 2026-10-21
Identificador: RUN
Estado de superficie: Existente
Fase de ampliación: F4
Alcance: Regresión cuando cambie esta superficie

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/activity/runs`
- `/audit/runs`
- `/runs`

Fuentes para preparar la implementación:

- [ui/src/pages/audit/AuditRuns.tsx](../../../../ui/src/pages/audit/AuditRuns.tsx)

## Qué mantendremos y por qué

- Ejecuciones, resultados, errores y acceso al detalle del agente.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Relacionar ejecución con cliente y resultado sin confundir éxito técnico y comercial. | Una llamada correcta puede no resolver el encargo. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Filtro por proceso y referencia de negocio autorizada. | Facilita diagnosticar un seguimiento concreto. |

## Datos y contrato de operación

HeartbeatRuns y run log existentes; proyecciones acotadas e identidad original de cada ejecución.

## Recorrido y estados

Abrir ejecución del trabajo → comprobar herramientas y resultado → ir a evidencia o recuperación.

- Un resultado incierto se conserva como tal.
- Una nueva ejecución no oculta errores materiales anteriores sin explicar su resolución.

## Lista de regresión

Activar esta revisión cuando una entrega cambie la página o uno de sus contratos. Los posibles cambios descritos arriba se evalúan entonces; esta ficha no añade trabajo al piloto por sí sola.

- [ ] Se distingue completar ejecución de aceptar entrega.
- [ ] Los filtros mantienen privacidad y no descargan contextos completos innecesariamente.

## Páginas relacionadas

- [Auditoría](2026-10-21-auditoria.md)
- [Detalle del agente](2026-10-21-agente.md)
- [Detalle de tarea](2026-10-21-tarea.md)
- [Detalle de conversación comercial](2026-10-21-comunicacion.md)
