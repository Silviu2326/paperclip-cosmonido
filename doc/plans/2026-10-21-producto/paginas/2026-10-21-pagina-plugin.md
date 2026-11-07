# Página aportada por plugin

Fecha: 2026-10-21
Identificador: PLP
Estado de superficie: Existente
Fase de ampliación: F6
Alcance: Ampliación posterior

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/plugins/:pluginId`
- `/:pluginRoutePath/*`

Fuentes para preparar la implementación:

- [ui/src/pages/PluginPage.tsx](../../../../ui/src/pages/PluginPage.tsx)

## Uso en los pilotos

La ampliación se elige después de observar la necesidad en un piloto. Su fase de referencia no obliga a retrasar los otros recorridos.

## Qué mantendremos y por qué

- Resolución de páginas de plugin y aislamiento de sus permisos.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Exigir uso de contratos globales para clientes y resultados. | Las extensiones no deben crear otro CRM opaco. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Añadir reglas de navegación y estados ausentes o fallidos. | Mantiene utilizable la aplicación principal. |

## Datos y contrato de operación

SDK y recursos de plugin; cada página dinámica requerirá especificación propia al añadirse, no puede inventariarse por adelantado.

## Recorrido y estados

Abrir extensión → verificar capacidades → operar bajo permisos.

- Una extensión no puede omitir comprobaciones de empresa.

## Tareas

Trabajo de ampliación de esta ficha, activable por el [backlog](../2026-10-21-backlog-fases.md). Su validación no bloquea el uso de la página existente.

| ID | Fase | Entregable | Depende de |
| --- | --- | --- | --- |
| PLP.01 | F6 | Precisar alcance y contrato de página aportada por plugin. | G01, G03, G12 |
| PLP.02 | F6 | Exigir uso de contratos globales para clientes y resultados. Añadir reglas de navegación y estados ausentes o fallidos. | PLP.01, G24 |
| PLP.03 | F6 | Comprobar: Una extensión no puede omitir comprobaciones de empresa. Plugin ausente permite volver a navegación principal. | PLP.02 |

## Criterios de aceptación

- Una extensión no puede omitir comprobaciones de empresa.
- Plugin ausente permite volver a navegación principal.

## Páginas relacionadas

- [Administración de plugins](2026-10-21-plugins.md)
- [Configuración de plugin](2026-10-21-plugin-configuracion.md)
