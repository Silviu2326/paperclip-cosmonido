# Ajustes de empresa aportados por plugin

Fecha: 2026-10-21
Identificador: CSP
Estado de superficie: Existente
Fase de ampliación: F6
Alcance: Ampliación posterior

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/company/settings/:settingsRoutePath/*`

Fuentes para preparar la implementación:

- [ui/src/pages/CompanySettingsPluginPage.tsx](../../../../ui/src/pages/CompanySettingsPluginPage.tsx)

## Uso en los pilotos

La ampliación se elige después de observar la necesidad en un piloto. Su fase de referencia no obliga a retrasar los otros recorridos.

## Qué mantendremos y por qué

- Registro de ajustes y ámbito de empresa del plugin.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Distinguir configuración compartida y de instancia. | Evita cambiar otras empresas desde un formulario local. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Añadir declaración de dependencias de proceso y validación de permisos. | Hace revisable la extensión. |

## Datos y contrato de operación

Contrato de settings de plugin y almacenamiento existente.

## Recorrido y estados

Abrir ajustes → comprobar ámbito → guardar → verificar.

- Un plugin sin página configurada presenta salida segura.

## Tareas

Trabajo de ampliación de esta ficha, activable por el [backlog](../2026-10-21-backlog-fases.md). Su validación no bloquea el uso de la página existente.

| ID | Fase | Entregable | Depende de |
| --- | --- | --- | --- |
| CSP.01 | F6 | Precisar alcance y contrato de ajustes de empresa aportados por plugin. | G01, G03, G12 |
| CSP.02 | F6 | Distinguir configuración compartida y de instancia. Añadir declaración de dependencias de proceso y validación de permisos. | CSP.01, G24 |
| CSP.03 | F6 | Comprobar: Un plugin sin página configurada presenta salida segura. El formulario no lee configuración de otra empresa. | CSP.02 |

## Criterios de aceptación

- Un plugin sin página configurada presenta salida segura.
- El formulario no lee configuración de otra empresa.

## Páginas relacionadas

- [Ajustes de empresa](2026-10-21-ajustes-empresa.md)
- [Administración de plugins](2026-10-21-plugins.md)
