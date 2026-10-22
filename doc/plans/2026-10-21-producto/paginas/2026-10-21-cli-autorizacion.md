# Autorización de CLI

Fecha: 2026-10-21
Identificador: CLA
Estado de superficie: Existente
Fase de ampliación: F4
Alcance: Regresión cuando cambie esta superficie

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/cli-auth/:id`

Fuentes para preparar la implementación:

- [ui/src/pages/CliAuth.tsx](../../../../ui/src/pages/CliAuth.tsx)

## Qué mantendremos y por qué

- Autorización de cliente CLI y expiración actuales.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Explicar empresa y alcance cuando se expongan acciones de negocio. | La CLI debe usar los mismos permisos que la interfaz. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Añadir retorno y resultado claro de concesión. | Hace verificable la conexión. |

## Datos y contrato de operación

Solicitud de autorización existente; no publicar tokens en documentos.

## Recorrido y estados

Revisar cliente y alcance → autorizar → comprobar estado.

- No se concede autoridad global por usar CLI.

## Lista de regresión

Activar esta revisión cuando una entrega cambie la página o uno de sus contratos. Los posibles cambios descritos arriba se evalúan entonces; esta ficha no añade trabajo al piloto por sí sola.

- [ ] No se concede autoridad global por usar CLI.
- [ ] El identificador de solicitud no sustituye la identidad autorizada.

## Páginas relacionadas

- [Autorización de conexión MCP](2026-10-21-mcp-autorizar.md)
- [Detalle del agente](2026-10-21-agente.md)
