# Detalle del espacio de proyecto

Fecha: 2026-10-21
Identificador: WSP
Estado de superficie: Existente
Fase de ampliación: F1
Alcance: Regresión cuando cambie esta superficie

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/projects/:projectId/workspaces/:workspaceId`

Fuentes para preparar la implementación:

- [ui/src/pages/ProjectWorkspaceDetail.tsx](../../../../ui/src/pages/ProjectWorkspaceDetail.tsx)

## Qué mantendremos y por qué

- Repositorio y configuración del espacio de proyecto.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Explicar su uso por el proyecto sin presentarlo como carpeta del cliente. | El espacio puede contener información con otra audiencia. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Añadir retorno al encargo y diagnóstico de requisitos. | Reduce pasos técnicos en soporte. |

## Datos y contrato de operación

Project workspace y repositorios; no es un executionWorkspaceId intercambiable.

## Recorrido y estados

Abrir desde proyecto → revisar origen → configurar por vía actual.

- Los permisos del repositorio se mantienen al ejecutar.

## Lista de regresión

Activar esta revisión cuando una entrega cambie la página o uno de sus contratos. Los posibles cambios descritos arriba se evalúan entonces; esta ficha no añade trabajo al piloto por sí sola.

- [ ] Los permisos del repositorio se mantienen al ejecutar.
- [ ] Una selección no concede credenciales al agente.

## Páginas relacionadas

- [Detalle de proyecto](2026-10-21-proyecto.md)
- [Detalle del espacio de ejecución](2026-10-21-espacio-ejecucion.md)
