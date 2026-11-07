# Crear o editar perfil de conexión

Fecha: 2026-10-21
Identificador: PCE
Estado de superficie: Existente
Fase de ampliación: F4
Alcance: Regresión cuando cambie esta superficie

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/apps/advanced/profiles/new`
- `/apps/advanced/profiles/:profileId/edit`

Fuentes para preparar la implementación:

- [ui/src/pages/tools/profiles/ProfileWizardRoute.tsx](../../../../ui/src/pages/tools/profiles/ProfileWizardRoute.tsx)

## Qué mantendremos y por qué

- Validación y persistencia de perfiles de herramientas.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Mostrar identidad, audiencia y capacidades antes de guardar. | La configuración define una frontera de acceso. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Añadir comprobación del uso esperado por el proceso. | Evita guardar perfiles que no resuelven el requisito. |

## Datos y contrato de operación

Perfil existente y referencias a secretos; conservar revisiones y no copiar valores secretos a documentos.

## Recorrido y estados

Configurar → validar → revisar alcance → guardar.

- Un error no destruye el perfil previo.

## Lista de regresión

Activar esta revisión cuando una entrega cambie la página o uno de sus contratos. Los posibles cambios descritos arriba se evalúan entonces; esta ficha no añade trabajo al piloto por sí sola.

- [ ] Un error no destruye el perfil previo.
- [ ] Cerrar y reabrir mantiene el borrador cuando el flujo lo permita.

## Páginas relacionadas

- [Detalle de perfil de conexión](2026-10-21-perfil-conexion.md)
- [Herramientas avanzadas](2026-10-21-herramientas-avanzadas.md)
