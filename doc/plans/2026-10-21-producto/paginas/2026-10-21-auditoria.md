# Auditoría

Fecha: 2026-10-21
Identificador: AUD
Estado de superficie: Existente
Fase de ampliación: F4
Alcance: Regresión cuando cambie esta superficie

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/activity`
- `/audit`
- `/audit/activity`

Alias o entradas de compatibilidad:

- `/audit/*`
- `/activity/*`

Fuentes para preparar la implementación:

- [ui/src/pages/audit/CompanyActivity.tsx](../../../../ui/src/pages/audit/CompanyActivity.tsx)
- [ui/src/pages/audit/AuditHub.tsx](../../../../ui/src/pages/audit/AuditHub.tsx)

## Qué mantendremos y por qué

- Registro de actividad y filtros por agentes, entidad y acción.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Incorporar mutaciones de clientes, oportunidades y compromisos. | Las acciones nuevas deben conservar responsabilidad y procedencia. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Referencias comerciales autorizadas y resultado de acción. | Permite explicar cambios de negocio sin exponer contenido privado. |

## Datos y contrato de operación

Activity log existente. Diferenciar este registro y el run log de Telemetry y OpenTelemetry según AGENTS.md.

## Recorrido y estados

Filtrar entidad → inspeccionar actor y resultado → abrir registro autorizado.

- Un actor eliminado conserva atribución histórica apropiada.
- Los datos sensibles y credenciales no se incluyen en payloads de auditoría.

## Lista de regresión

Activar esta revisión cuando una entrega cambie la página o uno de sus contratos. Los posibles cambios descritos arriba se evalúan entonces; esta ficha no añade trabajo al piloto por sí sola.

- [ ] Las mutaciones comerciales relevantes tienen evento verificable.
- [ ] El historial no revela contenido que la página original deniega.

## Páginas relacionadas

- [Historial de ejecuciones](2026-10-21-ejecuciones.md)
- [Costes de ejecución](2026-10-21-costes.md)
- [Cronología de trabajo](2026-10-21-cronologia.md)
- [Ficha del cliente](2026-10-21-cliente.md)
