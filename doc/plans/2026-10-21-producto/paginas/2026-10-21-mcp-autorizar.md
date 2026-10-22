# Autorización de conexión MCP

Fecha: 2026-10-21
Identificador: MCA
Estado de superficie: Existente
Fase de ampliación: F4
Alcance: Regresión cuando cambie esta superficie

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/mcp-connect/:id`
- `/dot-connect/:id`

Fuentes para preparar la implementación:

- [ui/src/pages/McpConnect.tsx](../../../../ui/src/pages/McpConnect.tsx)

## Qué mantendremos y por qué

- Autorización y emparejamiento de agente existentes.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Presentar claramente principal y capacidades comerciales solicitadas. | Un asistente externo no debe saltarse el modelo de gobierno. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Añadir enlaces al alcance efectivo y revocación. | Permite revisar lo autorizado. |

## Datos y contrato de operación

Conexión MCP y principal existente; mantener diferencias del modo de emparejamiento.

## Recorrido y estados

Revisar solicitud → autorizar alcance → confirmar → usar herramientas permitidas.

- La herramienta comercial aplica las mismas comprobaciones del servidor.

## Lista de regresión

Activar esta revisión cuando una entrega cambie la página o uno de sus contratos. Los posibles cambios descritos arriba se evalúan entonces; esta ficha no añade trabajo al piloto por sí sola.

- [ ] La herramienta comercial aplica las mismas comprobaciones del servidor.
- [ ] Una solicitud revocada no puede recuperarse desde un enlace antiguo.

## Páginas relacionadas

- [Conectar asistentes externos](2026-10-21-asistente-conectar.md)
- [Conexiones de asistentes](2026-10-21-asistentes-conexiones.md)
