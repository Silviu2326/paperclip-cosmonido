# Editor de skill

Fecha: 2026-10-21
Identificador: SKE
Estado de superficie: Existente
Fase de ampliación: F4
Alcance: Regresión cuando cambie esta superficie

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/skills/studio`
- `/skills/studio/new`
- `/skills/studio/:skillId`
- `/skills/:skillId/studio`

Fuentes para preparar la implementación:

- [ui/src/pages/SkillStudio.tsx](../../../../ui/src/pages/SkillStudio.tsx)

## Qué mantendremos y por qué

- Edición, pruebas y versiones bajo las reglas actuales de seguridad y política.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Expresar entradas, resultado y límites de las capacidades de negocio. | Facilita reutilización sin instrucciones ambiguas. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Añadir ejemplos de prueba de cada recorrido y requisitos declarados. | Permite calificar antes de asignar. |

## Datos y contrato de operación

Contenido y revisiones existentes. Mantener versiones inmutables en ejecuciones y acceso heredado.

## Recorrido y estados

Editar capacidad → validar → probar con caso controlado → guardar versión.

- Guardar no activa efectos externos ni relaja política de seguridad.

## Lista de regresión

Activar esta revisión cuando una entrega cambie la página o uno de sus contratos. Los posibles cambios descritos arriba se evalúan entonces; esta ficha no añade trabajo al piloto por sí sola.

- [ ] Guardar no activa efectos externos ni relaja política de seguridad.
- [ ] La edición no modifica la versión fijada a una ejecución en curso.

## Páginas relacionadas

- [Skills y capacidades](2026-10-21-skills.md)
- [Fuentes de skills](2026-10-21-skill-fuentes.md)
- [Catálogo e instalación de equipos](2026-10-21-equipos.md)
