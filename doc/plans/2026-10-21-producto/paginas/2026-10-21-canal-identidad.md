# Confirmación de identidad de canal

Fecha: 2026-10-21
Identificador: CHI
Estado de superficie: Existente
Fase de ampliación: F4
Alcance: Regresión cuando cambie esta superficie

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/chat-identity/confirm`

Fuentes para preparar la implementación:

- [ui/src/pages/apps/chat/ChatIdentityConfirm.tsx](../../../../ui/src/pages/apps/chat/ChatIdentityConfirm.tsx)

## Qué mantendremos y por qué

- Vinculación explícita entre identidad externa y principal autorizado.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Explicar qué acceso representa la vinculación. | Ser contacto del CRM no da derechos de operador. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Añadir contexto de canal y cuenta para evitar vinculación equivocada. | Reduce confusión con múltiples cuentas. |

## Datos y contrato de operación

Identity links existentes y consentimiento vigente; no crear miembros por coincidencia de correo.

## Recorrido y estados

Abrir enlace → comprobar cuenta y canal → confirmar vínculo → mostrar resultado.

- Enlace caducado o ya usado se rechaza sin filtrar datos.

## Lista de regresión

Activar esta revisión cuando una entrega cambie la página o uno de sus contratos. Los posibles cambios descritos arriba se evalúan entonces; esta ficha no añade trabajo al piloto por sí sola.

- [ ] Enlace caducado o ya usado se rechaza sin filtrar datos.
- [ ] Una identidad comercial externa permanece sin privilegios internos.

## Páginas relacionadas

- [Detalle del canal](2026-10-21-canal.md)
- [Miembros e invitaciones de empresa](2026-10-21-miembros.md)
- [Ficha del contacto](2026-10-21-contacto.md)
