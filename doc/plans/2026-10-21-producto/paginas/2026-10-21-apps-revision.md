# Revisión de acciones de aplicaciones

Fecha: 2026-10-21
Identificador: ARV
Estado de superficie: Existente
Fase de ampliación: F4
Alcance: Regresión cuando cambie esta superficie

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/apps/review`

Fuentes para preparar la implementación:

- [ui/src/pages/apps/AppsReview.tsx](../../../../ui/src/pages/apps/AppsReview.tsx)

## Qué mantendremos y por qué

- Cola de acciones pendientes y política de aprobación del runtime.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Mostrar destinatario, contenido y efecto exacto de acciones comerciales. | La aprobación necesita una operación concreta. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Añadir contexto de oportunidad o entrega y revisión vigente. | Evita aprobar contenido desactualizado. |

## Datos y contrato de operación

Solicitud de herramienta y payload protegido; permiso de resolver y revisión se comprueban antes de ejecutar.

## Recorrido y estados

Inspeccionar operación → autorizar o rechazar → conciliar resultado externo.

- Un resultado incierto no se reenvía automáticamente.

## Lista de regresión

Activar esta revisión cuando una entrega cambie la página o uno de sus contratos. Los posibles cambios descritos arriba se evalúan entonces; esta ficha no añade trabajo al piloto por sí sola.

- [ ] Un resultado incierto no se reenvía automáticamente.
- [ ] La aprobación no concede permiso permanente a otras acciones.

## Páginas relacionadas

- [Decisiones y pendientes humanos](2026-10-21-decisiones.md)
- [Detalle de conversación comercial](2026-10-21-comunicacion.md)
- [Detalle de aplicación conectada](2026-10-21-app.md)
