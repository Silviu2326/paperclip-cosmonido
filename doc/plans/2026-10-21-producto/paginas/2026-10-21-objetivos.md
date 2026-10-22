# Objetivos

Fecha: 2026-10-21
Identificador: OBJ
Estado de superficie: Existente
Fase de ampliación: F2
Alcance: Ampliación candidata; seleccionar por piloto

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/goals`

Fuentes para preparar la implementación:

- [ui/src/pages/Goals.tsx](../../../../ui/src/pages/Goals.tsx)

## Uso en los pilotos

El emprendedor prueba el recorrido actual de esta página durante F1. Sus ampliaciones comerciales pueden hacerse después del ensayo; una corrección se activa por un bloqueo observado.

## Qué mantendremos y por qué

- Jerarquía de objetivos y vínculo del trabajo con la misión.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Expresar resultados medibles por camino y separar progreso de actividad. | Completar tareas no prueba que se haya conseguido una venta. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Indicador y evidencia asociada cuando se defina una meta medible. | Da un criterio verificable al emprendedor y al equipo. |

## Datos y contrato de operación

Goals existentes y definición de medida, fuente, periodo y objetivo cuando aplique. No inferir achievement a partir de subtareas terminadas.

## Ejemplo de pantalla y datos de prueba

Los valores siguientes ilustran el diseño; no son clientes, precios o resultados reales. Los campos finales se cierran con el caso seleccionado.

| Campo o bloque | Ejemplo | Regla visible |
| --- | --- | --- |
| resultado | Oferta lista para revisar | El producto específico sigue pendiente. |
| criterio | Definido por propietario antes de ejecutar | El número de tareas terminadas es otra medida. |

## Recorrido y estados

Definir resultado → asociar iniciativas → revisar evidencia → registrar cumplimiento.

- Objetivo sin datos muestra medida pendiente, no cero progreso.
- Eliminar o archivar conserva trazabilidad de proyectos previos según contrato.

## Tareas

Trabajo de ampliación de esta ficha, activable por el [backlog](../2026-10-21-backlog-fases.md). Su validación no bloquea el uso de la página existente.

| ID | Fase | Entregable | Depende de |
| --- | --- | --- | --- |
| OBJ.01 | F2 | Definir medidas de resultado y su vínculo con evidencias. | G03, G07, G11 |
| OBJ.02 | F2 | Añadir revisión de objetivos por camino sin romper jerarquía. | OBJ.01, G14 |
| OBJ.03 | F2 | Comprobar: Un objetivo cuantitativo muestra unidad y periodo. Un objetivo cualitativo conserva su criterio de aceptación. | OBJ.02 |

## Criterios de aceptación

- Un objetivo cuantitativo muestra unidad y periodo.
- Un objetivo cualitativo conserva su criterio de aceptación.

## Páginas relacionadas

- [Detalle de objetivo](2026-10-21-objetivo.md)
- [Proyectos](2026-10-21-proyectos.md)
- [Inicio](2026-10-21-inicio.md)
