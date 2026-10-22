# Configuración de plugin

Fecha: 2026-10-21
Identificador: PLC
Estado de superficie: Existente
Fase de ampliación: F6
Alcance: Ampliación posterior

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/company/settings/instance/plugins/:pluginId`

Fuentes para preparar la implementación:

- [ui/src/pages/PluginSettings.tsx](../../../../ui/src/pages/PluginSettings.tsx)

## Uso en los pilotos

La ampliación se elige después de observar la necesidad en un piloto. Su fase de referencia no obliga a retrasar los otros recorridos.

## Qué mantendremos y por qué

- Formulario y permisos de configuración del plugin.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Mostrar ámbito y efectos sobre procesos antes de aplicar. | Una extensión puede afectar varias empresas. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Añadir diagnóstico de requisitos de negocio cuando la extensión los soporte. | Facilita soporte contextual. |

## Datos y contrato de operación

Configuración y secretos según SDK existente, sin exponer valores a la página o documentos.

## Recorrido y estados

Revisar configuración → validar → guardar → comprobar estado.

- Un fallo de validación conserva configuración previa.

## Tareas

Trabajo de ampliación de esta ficha, activable por el [backlog](../2026-10-21-backlog-fases.md). Su validación no bloquea el uso de la página existente.

| ID | Fase | Entregable | Depende de |
| --- | --- | --- | --- |
| PLC.01 | F6 | Definir contrato de configuración de plugin para el alcance de negocio. | G03, G12 |
| PLC.02 | F6 | Mostrar ámbito y efectos sobre procesos antes de aplicar. Añadir diagnóstico de requisitos de negocio cuando la extensión los soporte. | PLC.01, G24 |
| PLC.03 | F6 | Comprobar: Un fallo de validación conserva configuración previa. No se elevan permisos por instalar una extensión. | PLC.02 |

## Criterios de aceptación

- Un fallo de validación conserva configuración previa.
- No se elevan permisos por instalar una extensión.

## Páginas relacionadas

- [Administración de plugins](2026-10-21-plugins.md)
- [Página aportada por plugin](2026-10-21-pagina-plugin.md)
