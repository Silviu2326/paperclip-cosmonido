# Conexiones de IA de la empresa

Fecha: 2026-10-21
Identificador: CCN
Estado de superficie: Existente
Fase de ampliación: F4
Alcance: Regresión cuando cambie esta superficie

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/company/settings/connections`

Fuentes para preparar la implementación:

- [ui/src/pages/CompanyConnections.tsx](../../../../ui/src/pages/CompanyConnections.tsx)

## Qué mantendremos y por qué

- Ajustes de modelos de decisión y respuestas rápidas bajo su flag actual.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Distinguir conexiones de IA y aplicaciones de negocio. | Comparten lenguaje pero tienen propósitos y permisos distintos. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Añadir diagnóstico de modelo y capacidad para los procesos previstos. | Ayuda a resolver una ejecución bloqueada. |

## Datos y contrato de operación

Configuración de modelos y respuestas rápidas existentes; no desviar herramientas comerciales a este panel.

## Recorrido y estados

Revisar modelo efectivo → corregir autorización o configuración → comprobar.

- El flag desactivado conserva su redirección actual.

## Lista de regresión

Activar esta revisión cuando una entrega cambie la página o uno de sus contratos. Los posibles cambios descritos arriba se evalúan entonces; esta ficha no añade trabajo al piloto por sí sola.

- [ ] El flag desactivado conserva su redirección actual.
- [ ] Una cuenta visible no implica que el ejecutor tenga una concesión utilizable.

## Páginas relacionadas

- [Aplicaciones](2026-10-21-apps.md)
- [Detalle del agente](2026-10-21-agente.md)
- [Ajustes de empresa](2026-10-21-ajustes-empresa.md)
