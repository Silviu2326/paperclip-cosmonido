# Fuentes de skills

Fecha: 2026-10-21
Identificador: SKS
Estado de superficie: Existente
Fase de ampliación: F4
Alcance: Regresión cuando cambie esta superficie

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/skills/sources`
- `/skills/sources/:sourceId`

Fuentes para preparar la implementación:

- [ui/src/pages/SkillSources.tsx](../../../../ui/src/pages/SkillSources.tsx)

## Qué mantendremos y por qué

- Fuentes GitHub, ramas, refresco, versiones preservadas y procedencia de acceso por proyecto.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Explicar cambios que afecten procedimientos utilizados. | Una actualización de fuente puede cambiar nuevas ejecuciones. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Añadir vínculos autorizados a capacidades y procesos dependientes. | Ayuda a revisar impacto. |

## Datos y contrato de operación

Fuentes y versiones actuales, tracking y restricciones heredadas. No publicar skills privadas al desconectarlas.

## Recorrido y estados

Revisar fuente → inspeccionar cambios → actualizar bajo reglas vigentes → verificar uso futuro.

- Un fallo upstream conserva la versión instalada.

## Lista de regresión

Activar esta revisión cuando una entrega cambie la página o uno de sus contratos. Los posibles cambios descritos arriba se evalúan entonces; esta ficha no añade trabajo al piloto por sí sola.

- [ ] Un fallo upstream conserva la versión instalada.
- [ ] Cambiar rama valida acceso y no redirige fuentes de otro proyecto.

## Páginas relacionadas

- [Skills y capacidades](2026-10-21-skills.md)
- [Editor de skill](2026-10-21-skill-editor.md)
- [Detalle de rutina](2026-10-21-rutina.md)
