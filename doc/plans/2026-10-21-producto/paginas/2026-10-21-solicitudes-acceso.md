# Solicitudes de acceso

Fecha: 2026-10-21
Identificador: SOL
Estado de superficie: Existente
Fase de ampliación: F1
Alcance: Regresión cuando cambie esta superficie

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/inbox/requests`

Fuentes para preparar la implementación:

- [ui/src/pages/JoinRequestQueue.tsx](../../../../ui/src/pages/JoinRequestQueue.tsx)

## Qué mantendremos y por qué

- Cola de solicitudes y facultad de resolver por membresía.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Mostrar alcance de cada incorporación. | Aceptar un lead no es aceptar un miembro. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Añadir contexto y destino autorizado después de resolver. | Facilita administrar colaboración interna. |

## Datos y contrato de operación

JoinRequests y grants existentes; sin inferir autorización desde relaciones comerciales.

## Recorrido y estados

Revisar solicitud → comprobar identidad y rol → aceptar o rechazar.

- Un contacto nuevo no genera solicitud automáticamente.

## Lista de regresión

Activar esta revisión cuando una entrega cambie la página o uno de sus contratos. Los posibles cambios descritos arriba se evalúan entonces; esta ficha no añade trabajo al piloto por sí sola.

- [ ] Un contacto nuevo no genera solicitud automáticamente.
- [ ] Resoluciones concurrentes conservan un único resultado.

## Páginas relacionadas

- [Miembros e invitaciones de empresa](2026-10-21-miembros.md)
- [Aceptar invitación](2026-10-21-invitacion.md)
