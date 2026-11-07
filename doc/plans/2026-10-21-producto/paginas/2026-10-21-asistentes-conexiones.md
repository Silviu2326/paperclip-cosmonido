# Conexiones de asistentes

Fecha: 2026-10-21
Identificador: ASC
Estado de superficie: Existente
Fase de ampliación: F4
Alcance: Regresión cuando cambie esta superficie

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/assistant-connections`

Fuentes para preparar la implementación:

- [ui/src/pages/McpConnect.tsx](../../../../ui/src/pages/McpConnect.tsx)

## Qué mantendremos y por qué

- Listado y revocación de asistentes conectados.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Explicar qué agente o principal representa cada conexión. | Permite atribuir acciones comerciales. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Añadir capacidades de negocio y última actividad segura. | Ayuda a decidir qué revocar. |

## Datos y contrato de operación

Conexiones existentes y permisos efectivos; no almacenar copias de secretos.

## Recorrido y estados

Revisar conexión → inspeccionar alcance → revocar cuando proceda.

- Revocar bloquea nuevas acciones.

## Lista de regresión

Activar esta revisión cuando una entrega cambie la página o uno de sus contratos. Los posibles cambios descritos arriba se evalúan entonces; esta ficha no añade trabajo al piloto por sí sola.

- [ ] Revocar bloquea nuevas acciones.
- [ ] El listado no revela sujetos privados por actividad.

## Páginas relacionadas

- [Conectar asistentes externos](2026-10-21-asistente-conectar.md)
- [Autorización de conexión MCP](2026-10-21-mcp-autorizar.md)
- [Auditoría](2026-10-21-auditoria.md)
