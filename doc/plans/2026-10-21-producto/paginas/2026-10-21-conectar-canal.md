# Conectar canal de comunicación

Fecha: 2026-10-21
Identificador: CHC
Estado de superficie: Existente
Fase de ampliación: F4
Alcance: Regresión cuando cambie esta superficie

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/apps/chat/connect`

Fuentes para preparar la implementación:

- [ui/src/pages/apps/chat/ChatEndpointSetup.tsx](../../../../ui/src/pages/apps/chat/ChatEndpointSetup.tsx)

## Qué mantendremos y por qué

- Setup por proveedor, agente y endpoint bajo la opción experimental correspondiente.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Definir para qué recorrido se usará y quién puede interactuar. | Evita mezclar canal de control y atención comercial. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Añadir prueba de recepción, respuesta y audiencia autorizada. | La existencia del endpoint no prueba un canal funcional. |

## Datos y contrato de operación

ChatEndpoint y propiedad de conexión; seguir fronteras específicas de cada plataforma al implementar.

## Recorrido y estados

Elegir canal y agente → configurar → verificar identidad y publicación → activar.

- Un setup interrumpido se reanuda sin crear bots o números duplicados.

## Lista de regresión

Activar esta revisión cuando una entrega cambie la página o uno de sus contratos. Los posibles cambios descritos arriba se evalúan entonces; esta ficha no añade trabajo al piloto por sí sola.

- [ ] Un setup interrumpido se reanuda sin crear bots o números duplicados.
- [ ] No se concede autoridad por nombre, teléfono o pertenencia a grupo.

## Páginas relacionadas

- [Detalle del canal](2026-10-21-canal.md)
- [Confirmación de identidad de canal](2026-10-21-canal-identidad.md)
- [Comunicaciones](2026-10-21-comunicaciones.md)
