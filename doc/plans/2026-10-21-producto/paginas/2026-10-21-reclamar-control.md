# Reclamar control de instancia

Fecha: 2026-10-21
Identificador: BCL
Estado de superficie: Existente
Fase de ampliación: F1
Alcance: Regresión cuando cambie esta superficie

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/board-claim/:token`

Fuentes para preparar la implementación:

- [ui/src/pages/BoardClaim.tsx](../../../../ui/src/pages/BoardClaim.tsx)

## Qué mantendremos y por qué

- Proceso explícito de reclamación y tokens de control.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Mantenerlo como operación administrativa excepcional. | No forma parte de convertir un contacto en cliente. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Añadir explicación del alcance y retorno seguro. | Evita confundir control de instancia y acceso comercial. |

## Datos y contrato de operación

Token y principal bajo el contrato actual, sin reutilización para portal.

## Recorrido y estados

Verificar reclamación → confirmar por mecanismo vigente → acceder al ámbito concedido.

- Un token caducado o reutilizado no concede control.

## Lista de regresión

Activar esta revisión cuando una entrega cambie la página o uno de sus contratos. Los posibles cambios descritos arriba se evalúan entonces; esta ficha no añade trabajo al piloto por sí sola.

- [ ] Un token caducado o reutilizado no concede control.
- [ ] La capa comercial no modifica esta autoridad.

## Páginas relacionadas

- [Acceso a la instancia](2026-10-21-acceso-instancia.md)
- [Autenticación](2026-10-21-autenticacion.md)
