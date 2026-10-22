# Conectar asistentes externos

Fecha: 2026-10-21
Identificador: ASL
Estado de superficie: Existente
Fase de ampliación: F4
Alcance: Regresión cuando cambie esta superficie

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/apps/assistant-connection`

Fuentes para preparar la implementación:

- [ui/src/pages/apps/AssistantConnection.tsx](../../../../ui/src/pages/apps/AssistantConnection.tsx)

## Qué mantendremos y por qué

- Conexión autorizada de asistentes externos a Paperclip.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Explicar capacidades de negocio que se exponen y alcance del principal. | La conexión no debe conceder control total implícito. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Añadir selección o explicación de herramientas comerciales publicadas. | Permite operar sobre el mismo contrato de dominio. |

## Datos y contrato de operación

Conexión de asistente y herramientas nativas; aplicar permisos de empresa y sujeto en servidor.

## Recorrido y estados

Elegir asistente → revisar alcance → conectar → comprobar acción permitida.

- Revocar impide nuevas acciones aunque el asistente tenga contexto previo.

## Lista de regresión

Activar esta revisión cuando una entrega cambie la página o uno de sus contratos. Los posibles cambios descritos arriba se evalúan entonces; esta ficha no añade trabajo al piloto por sí sola.

- [ ] Revocar impide nuevas acciones aunque el asistente tenga contexto previo.
- [ ] El cliente externo no puede saltarse aprobaciones por usar otra interfaz.

## Páginas relacionadas

- [Conexiones de asistentes](2026-10-21-asistentes-conexiones.md)
- [Autorización de conexión MCP](2026-10-21-mcp-autorizar.md)
- [Detalle del agente](2026-10-21-agente.md)
