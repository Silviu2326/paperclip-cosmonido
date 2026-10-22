# Cronología de trabajo

Fecha: 2026-10-21
Identificador: TIM
Estado de superficie: Existente
Fase de ampliación: F5
Alcance: Regresión cuando cambie esta superficie

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/activity/timeline`
- `/audit/timeline`
- `/timeline`

Fuentes para preparar la implementación:

- [ui/src/pages/Timeline.tsx](../../../../ui/src/pages/Timeline.tsx)

## Qué mantendremos y por qué

- Vista temporal de trabajo y alias de navegación vigentes.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Separar fecha prevista, fecha comprometida y hecho ocurrido. | Evita presentar una planificación como entrega confirmada. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Filtros por cliente y entregas relacionadas. | Ayuda a gestionar capacidad de una agencia. |

## Datos y contrato de operación

Fechas de tareas y proyectos y compromisos explícitos. Las reuniones siguen en Agenda y se enlazan, sin duplicar calendarios.

## Recorrido y estados

Consultar periodo → detectar conflicto o retraso → abrir proyecto o compromiso.

- Trabajos sin fecha se muestran como no planificados.
- Zonas horarias y fechas sin hora mantienen semánticas diferentes.

## Lista de regresión

Activar esta revisión cuando una entrega cambie la página o uno de sus contratos. Los posibles cambios descritos arriba se evalúan entonces; esta ficha no añade trabajo al piloto por sí sola.

- [ ] Una fecha real de entrega no se sustituye al mover una previsión.
- [ ] La vista solo agrega trabajo autorizado.

## Páginas relacionadas

- [Detalle de proyecto](2026-10-21-proyecto.md)
- [Agenda comercial](2026-10-21-agenda.md)
- [Tareas](2026-10-21-tareas.md)
