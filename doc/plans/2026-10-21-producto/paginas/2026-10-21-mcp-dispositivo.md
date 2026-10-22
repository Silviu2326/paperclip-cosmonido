# Autorización por dispositivo MCP

Fecha: 2026-10-21
Identificador: MCD
Estado de superficie: Existente
Fase de ampliación: F4
Alcance: Regresión cuando cambie esta superficie

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/mcp-device`

Fuentes para preparar la implementación:

- [ui/src/pages/McpConnect.tsx](../../../../ui/src/pages/McpConnect.tsx)

## Qué mantendremos y por qué

- Código de dispositivo y validación de identidad.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Mostrar cliente, empresa y operación solicitante antes de autorizar. | Reduce autorizaciones equivocadas. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Añadir resultado y próximo paso de conexión. | Evita repetir autorizaciones. |

## Datos y contrato de operación

Dispositivo y solicitud con expiración; no intercambiar el código con una API key.

## Recorrido y estados

Introducir código → revisar solicitud → autorizar → confirmar.

- Código inválido o usado no filtra información.

## Lista de regresión

Activar esta revisión cuando una entrega cambie la página o uno de sus contratos. Los posibles cambios descritos arriba se evalúan entonces; esta ficha no añade trabajo al piloto por sí sola.

- [ ] Código inválido o usado no filtra información.
- [ ] Autorizar no inicia un trabajo de negocio por sí solo.

## Páginas relacionadas

- [Autorización de conexión MCP](2026-10-21-mcp-autorizar.md)
- [Conexiones de asistentes](2026-10-21-asistentes-conexiones.md)
