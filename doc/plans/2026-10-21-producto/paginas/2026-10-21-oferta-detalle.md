# Detalle de producto o servicio

Fecha: 2026-10-21
Identificador: OFD
Estado de superficie: Nueva
Fase de ampliación: F3
Alcance: Ampliación candidata; seleccionar por piloto

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/offerings/:offeringId`

Fuentes para preparar la implementación:

Página propuesta: no se ha identificado una implementación propia en las fuentes inventariadas.

## Qué mantendremos y por qué

- Los procedimientos y plantillas existentes sin copiarlos a un catálogo paralelo.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Mostrar qué se promete y qué hace falta para entregarlo. | Evita vender trabajo sin entradas, revisiones o capacidad definida. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Alcance, entregables, revisiones incluidas y dependencias. | Hace explícito el compromiso. |
| Relación con plantilla de proyecto o rutina y requisitos del cliente. | Conecta venta y ejecución sin iniciar trabajo al editar. |

## Datos y contrato de operación

Versión editable o publicada de oferta y referencias a procedimientos autorizados. Los acuerdos guardan su propia versión aceptada.

## Ejemplo de pantalla y datos de prueba

Los valores siguientes ilustran el diseño; no son clientes, precios o resultados reales. Los campos finales se cierran con el caso seleccionado.

| Campo o bloque | Ejemplo | Regla visible |
| --- | --- | --- |
| entrada | Brief y guía de marca | Documentos con versión y acceso. |
| salida | Cuatro publicaciones revisables | Definir formato con el comprador. |
| límite | Una ronda de cambios | Guardar versión de la oferta que se use. |

## Recorrido y estados

Definir resultado → entradas y límites → asociar procedimiento → publicar versión para nuevas propuestas.

- Una plantilla no disponible bloquea la automatización, no la lectura de la oferta.
- Despublicar no elimina acuerdos históricos.

## Tareas

Trabajo de ampliación de esta ficha, activable por el [backlog](../2026-10-21-backlog-fases.md). Su validación no bloquea el uso de la página existente.

| ID | Fase | Entregable | Depende de |
| --- | --- | --- | --- |
| OFD.01 | F3 | Definir edición y publicación de versiones de oferta. | G02, G03, G07 |
| OFD.02 | F3 | Implementar selección de procedimiento y comprobación de requisitos. | OFD.01, G16 |
| OFD.03 | F3 | Comprobar: El usuario identifica entradas y límites antes de preparar un presupuesto. Las modificaciones crean una revisión sin reescribir acuerdos existentes. | OFD.02 |

## Criterios de aceptación

- El usuario identifica entradas y límites antes de preparar un presupuesto.
- Las modificaciones crean una revisión sin reescribir acuerdos existentes.

## Páginas relacionadas

- [Catálogo de productos y servicios](2026-10-21-oferta.md)
- [Detalle de propuesta y compromiso](2026-10-21-propuesta.md)
- [Detalle de rutina](2026-10-21-rutina.md)
- [Detalle de proyecto](2026-10-21-proyecto.md)
