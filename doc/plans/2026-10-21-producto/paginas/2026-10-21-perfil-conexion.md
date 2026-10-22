# Detalle de perfil de conexión

Fecha: 2026-10-21
Identificador: PCD
Estado de superficie: Existente
Fase de ampliación: F4
Alcance: Regresión cuando cambie esta superficie

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/apps/advanced/profiles/:profileId`

Fuentes para preparar la implementación:

- [ui/src/pages/tools/profiles/ProfileDetailRoute.tsx](../../../../ui/src/pages/tools/profiles/ProfileDetailRoute.tsx)

## Qué mantendremos y por qué

- Detalle y operaciones autorizadas del perfil.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Mostrar consumidores y requisitos antes de cambiar o retirar. | Permite entender impacto sobre agentes y procesos. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Añadir enlaces a diagnóstico y última validación. | Reduce reparación manual. |

## Datos y contrato de operación

Perfil y relaciones existentes; los consumidores se filtran por permisos antes de contarlos.

## Recorrido y estados

Inspeccionar → editar o validar → revisar consumidores afectados.

- Retirar un perfil no borra evidencias de ejecuciones pasadas.

## Lista de regresión

Activar esta revisión cuando una entrega cambie la página o uno de sus contratos. Los posibles cambios descritos arriba se evalúan entonces; esta ficha no añade trabajo al piloto por sí sola.

- [ ] Retirar un perfil no borra evidencias de ejecuciones pasadas.
- [ ] Un usuario no ve referencias a proyectos privados por la lista de consumidores.

## Páginas relacionadas

- [Crear o editar perfil de conexión](2026-10-21-perfil-conexion-editor.md)
- [Detalle del agente](2026-10-21-agente.md)
- [Detalle de aplicación conectada](2026-10-21-app.md)
