# Propuestas comerciales

Fecha: 2026-10-21
Identificador: PRO
Estado de superficie: Nueva
Fase de ampliación: F3
Alcance: Ampliación candidata; seleccionar por piloto

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/proposals`

Fuentes para preparar la implementación:

Página propuesta: no se ha identificado una implementación propia en las fuentes inventariadas.

## Qué mantendremos y por qué

- Documentos y artefactos existentes como soporte de contenido y exportación.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Añadir estado comercial a las propuestas sin usar el estado de una tarea. | Redactado, enviado y aceptado representan hechos diferentes. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Listado por cliente, oportunidad, versión, estado y vencimiento. | Permite saber qué requiere seguimiento. |
| Creación desde oferta y oportunidad. | Reduce entradas duplicadas y conserva procedencia. |

## Datos y contrato de operación

Propuesta, revisiones, cliente, oportunidad, moneda, validez y evidencias de publicación y aceptación.

## Ejemplo de pantalla y datos de prueba

Los valores siguientes ilustran el diseño; no son clientes, precios o resultados reales. Los campos finales se cierran con el caso seleccionado.

| Campo o bloque | Ejemplo | Regla visible |
| --- | --- | --- |
| referencia | Propuesta Demo 001 | Vinculada a una oportunidad. |
| revisión | v1 | No sobrescribir la publicada. |
| estado | borrador | Todavía no equivale a envío. |

## Recorrido y estados

Seleccionar oportunidad → crear borrador → revisar → preparar envío → seguir su resultado.

- Una propuesta vencida conserva su contenido y requiere revisar condiciones antes de reactivarla.
- Fallo de envío mantiene el documento y muestra que no hay envío confirmado.

## Tareas

Trabajo de ampliación de esta ficha, activable por el [backlog](../2026-10-21-backlog-fases.md). Su validación no bloquea el uso de la página existente.

| ID | Fase | Entregable | Depende de |
| --- | --- | --- | --- |
| PRO.01 | F3 | Definir listado y ciclo de vida de propuestas. | G02, G03, G07 |
| PRO.02 | F3 | Construir creación contextual y seguimiento de vencimientos. | PRO.01, G16 |
| PRO.03 | F3 | Comprobar: Se puede filtrar lo enviado y pendiente de respuesta. La versión mostrada coincide con la versión compartida o aceptada. | PRO.02 |

## Criterios de aceptación

- Se puede filtrar lo enviado y pendiente de respuesta.
- La versión mostrada coincide con la versión compartida o aceptada.

## Páginas relacionadas

- [Detalle de propuesta y compromiso](2026-10-21-propuesta.md)
- [Ficha de la oportunidad](2026-10-21-oportunidad.md)
- [Artefactos de entrada y salida](2026-10-21-artefactos.md)
