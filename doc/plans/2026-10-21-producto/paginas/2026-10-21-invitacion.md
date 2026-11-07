# Aceptar invitación

Fecha: 2026-10-21
Identificador: INV
Estado de superficie: Existente
Fase de ampliación: F1
Alcance: Regresión cuando cambie esta superficie

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/invite/:token`

Fuentes para preparar la implementación:

- [ui/src/pages/InviteLanding.tsx](../../../../ui/src/pages/InviteLanding.tsx)

## Qué mantendremos y por qué

- Tokens, audiencia, caducidad y aceptación vigentes.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Explicar si el acceso es a una empresa interna. | Evita confundir una invitación de miembro con compartir un entregable. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Añadir retorno al contexto autorizado tras aceptar. | Reduce desorientación. |

## Datos y contrato de operación

Invitación y principal autenticado; un portal posterior requiere su flujo específico.

## Recorrido y estados

Abrir invitación → comprobar cuenta y empresa → aceptar → acceder.

- Un token de otra cuenta no se acepta por coincidencia de contacto.

## Lista de regresión

Activar esta revisión cuando una entrega cambie la página o uno de sus contratos. Los posibles cambios descritos arriba se evalúan entonces; esta ficha no añade trabajo al piloto por sí sola.

- [ ] Un token de otra cuenta no se acepta por coincidencia de contacto.
- [ ] Caducidad o revocación no filtra datos de empresa.

## Páginas relacionadas

- [Miembros e invitaciones de empresa](2026-10-21-miembros.md)
- [Autenticación](2026-10-21-autenticacion.md)
- [Portal del cliente](2026-10-21-portal-cliente.md)
