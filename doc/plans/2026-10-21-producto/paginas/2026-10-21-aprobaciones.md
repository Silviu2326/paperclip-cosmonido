# Aprobaciones

Fecha: 2026-10-21
Identificador: APS
Estado de superficie: Existente
Fase de ampliación: F4
Alcance: Ampliación candidata; seleccionar por piloto

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/approvals`
- `/approvals/pending`
- `/approvals/all`

Fuentes para preparar la implementación:

- [ui/src/pages/Approvals.tsx](../../../../ui/src/pages/Approvals.tsx)

## Qué mantendremos y por qué

- Aprobaciones gobernadas de contratación y estrategia y su historial.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Distinguir gobierno de plataforma y aceptación comercial. | Aceptar una propuesta de cliente no equivale a una aprobación de contratación. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Nuevos tipos solo cuando las políticas requieran una aprobación gobernada. | Evita controles paralelos e incompatibles. |

## Datos y contrato de operación

Approvals existentes; validar qué ampliaciones pertenecen a interacción, decisión o aprobación antes de crear tipos.

## Recorrido y estados

Filtrar pendientes → abrir aprobación → revisar → resolver con actor autorizado.

- Una aprobación revocada o ya resuelta no conserva acciones activas.
- Los filtros no amplían acceso al sujeto aprobado.

## Tareas

Trabajo de ampliación de esta ficha, activable por el [backlog](../2026-10-21-backlog-fases.md). Su validación no bloquea el uso de la página existente.

| ID | Fase | Entregable | Depende de |
| --- | --- | --- | --- |
| APS.01 | F4 | Delimitar aprobación gobernada frente a decisiones de negocio. | G03, G08, G10 |
| APS.02 | F4 | Añadir contexto y tipos necesarios sin recrear el motor. | APS.01, G17, G18 |
| APS.03 | F4 | Comprobar: Los tipos vigentes conservan sus reglas. Cada nuevo tipo tiene permiso y efecto definidos en contrato compartido. | APS.02 |

## Criterios de aceptación

- Los tipos vigentes conservan sus reglas.
- Cada nuevo tipo tiene permiso y efecto definidos en contrato compartido.

## Páginas relacionadas

- [Detalle de aprobación](2026-10-21-aprobacion.md)
- [Decisiones y pendientes humanos](2026-10-21-decisiones.md)
- [Miembros e invitaciones de empresa](2026-10-21-miembros.md)
