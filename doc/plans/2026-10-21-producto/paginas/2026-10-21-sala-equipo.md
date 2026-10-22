# Sala de conversación del equipo

Fecha: 2026-10-21
Identificador: BCH
Estado de superficie: Existente experimental
Fase de ampliación: F6
Alcance: Ampliación posterior

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/board-chat`

Fuentes para preparar la implementación:

- [ui/src/pages/BoardChat.tsx](../../../../ui/src/pages/BoardChat.tsx)

## Uso en los pilotos

La ampliación se elige después de observar la necesidad en un piloto. Su fase de referencia no obliga a retrasar los otros recorridos.

## Qué mantendremos y por qué

- Superficie de conversación experimental y vínculos existentes al trabajo.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Mantener las decisiones vinculadas a registros duraderos. | Una conversación grupal no sustituye aprobaciones o compromisos. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Enlace explícito desde una decisión a objetivo, tarea o propuesta. | Conserva trazabilidad. |

## Datos y contrato de operación

Mensajes y referencias de trabajo; no incorporar contexto privado al canal por estar mencionado.

## Recorrido y estados

Discutir → registrar decisión en su entidad → delegar por mecanismos vigentes.

- Desactivar el experimento preserva el acceso histórico según contrato.
- Un mensaje no concede autoridad ni cambia estado por sí solo.

## Tareas

Trabajo de ampliación de esta ficha, activable por el [backlog](../2026-10-21-backlog-fases.md). Su validación no bloquea el uso de la página existente.

| ID | Fase | Entregable | Depende de |
| --- | --- | --- | --- |
| BCH.01 | F6 | Definir papel complementario de la sala y sus límites. | G03, G08, G10 |
| BCH.02 | F6 | Añadir enlaces a decisiones duraderas si se valida el uso. | BCH.01, G18, G19 |
| BCH.03 | F6 | Comprobar: No se ejecuta un compromiso comercial solo por acuerdo informal en la sala. La referencia a trabajo respeta sus ACL. | BCH.02 |

## Criterios de aceptación

- No se ejecuta un compromiso comercial solo por acuerdo informal en la sala.
- La referencia a trabajo respeta sus ACL.

## Páginas relacionadas

- [Conversación con un agente](2026-10-21-chat.md)
- [Decisiones y pendientes humanos](2026-10-21-decisiones.md)
- [Detalle de tarea](2026-10-21-tarea.md)
