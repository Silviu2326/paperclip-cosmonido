# Herramientas avanzadas

Fecha: 2026-10-21
Identificador: ADV
Estado de superficie: Existente
Fase de ampliación: F4
Alcance: Regresión cuando cambie esta superficie

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/apps/advanced`
- `/apps/advanced/:tab`

Alias o entradas de compatibilidad:

- `/company/settings/tools`
- `/company/settings/tools/:tab`
- `/tools`
- `/tools/:tab`
- `/apps/advanced/audit`
- `/apps/advanced/run-your-own`

Fuentes para preparar la implementación:

- [ui/src/pages/tools/AdvancedToolsRoute.tsx](../../../../ui/src/pages/tools/AdvancedToolsRoute.tsx)

## Qué mantendremos y por qué

- Perfiles, configuración manual y herramientas de diagnóstico avanzadas.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Conservar estas opciones como soporte técnico contextual. | No deben convertirse en requisitos para clientes no técnicos. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Añadir referencias desde fallos concretos y requisitos de procesos. | Guía al administrador a una acción útil. |

## Datos y contrato de operación

Conexiones y perfiles existentes; mantener proveedor y origen de configuración.

## Recorrido y estados

Llegar desde diagnóstico → revisar configuración avanzada → volver a validar el trabajo.

- La vista normal evita IDs y detalles que no permiten decidir.

## Lista de regresión

Activar esta revisión cuando una entrega cambie la página o uno de sus contratos. Los posibles cambios descritos arriba se evalúan entonces; esta ficha no añade trabajo al piloto por sí sola.

- [ ] La vista normal evita IDs y detalles que no permiten decidir.
- [ ] Pegar configuración no ejecuta contenido ni acepta acceso arbitrario al host.

## Páginas relacionadas

- [Crear o editar perfil de conexión](2026-10-21-perfil-conexion-editor.md)
- [Pasarelas de herramientas](2026-10-21-pasarelas.md)
- [Aplicaciones](2026-10-21-apps.md)
