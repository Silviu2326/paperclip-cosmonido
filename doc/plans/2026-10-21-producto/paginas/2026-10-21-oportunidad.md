# Ficha de la oportunidad

Fecha: 2026-10-21
Identificador: OPD
Estado de superficie: Nueva
Fase de ampliación: F3
Alcance: Ampliación candidata; seleccionar por piloto

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/opportunities/:opportunityId`

Fuentes para preparar la implementación:

Página propuesta: no se ha identificado una implementación propia en las fuentes inventariadas.

## Uso en los pilotos

El caso comercial elige la parte mínima de esta página que permite atender una entrada y conservar el siguiente paso. Calendario y reunión confirmada se exigen únicamente si ese resultado está prometido.

## Qué mantendremos y por qué

- Contexto de cliente, contacto, tareas y documentos en sus entidades originales.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Vincular la decisión comercial con el alcance que se entrega. | Ganar una oportunidad debe tener un resultado de negocio rastreable. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Necesidad, contactos, importe, siguiente acción y cronología. | Centraliza el contexto de la venta. |
| Propuestas versionadas y vínculo a compromiso aceptado. | Impide ejecutar una versión distinta de la acordada. |
| Transferencia a proyecto o servicio con conciliación de reintentos. | Permite comenzar la entrega sin duplicar trabajo. |

## Datos y contrato de operación

Oportunidad, propuestas, evidencias de cierre y vínculos a compromisos y proyectos. Una oportunidad puede originar varios trabajos según su oferta.

## Ejemplo de pantalla y datos de prueba

Los valores siguientes ilustran el diseño; no son clientes, precios o resultados reales. Los campos finales se cierran con el caso seleccionado.

| Campo o bloque | Ejemplo | Regla visible |
| --- | --- | --- |
| estado | Cualificación | Conservar actor y evidencia de cambio. |
| próximo paso | Proponer reunión | Registrar si es propuesta o reserva real. |
| propuesta aceptada | ninguna | No mostrar venta cerrada sin evidencia. |

## Recorrido y estados

Cualificar → preparar propuesta → registrar aceptación o pérdida → crear trabajo cuando corresponda.

- Marcar ganada no significa cobrada; el producto muestra ambos hechos por separado.
- Si la transferencia falla después de crear el proyecto, el reintento recupera ese vínculo.

## Tareas

Trabajo de ampliación de esta ficha, activable por el [backlog](../2026-10-21-backlog-fases.md). Su validación no bloquea el uso de la página existente.

| ID | Fase | Entregable | Depende de |
| --- | --- | --- | --- |
| OPD.01 | F3 | Definir ficha y contrato de cierre y transferencia con evidencia. | G02, G03, G04, G06, G07 |
| OPD.02 | F3 | Construir propuesta, seguimiento y creación vinculada de trabajo. | OPD.01, G16 |
| OPD.03 | F3 | Comprobar: La entrega se origina en la versión aceptada de la propuesta. El historial conserva quién cerró, por qué y con qué evidencia. | OPD.02 |

## Criterios de aceptación

- La entrega se origina en la versión aceptada de la propuesta.
- El historial conserva quién cerró, por qué y con qué evidencia.

## Páginas relacionadas

- [Oportunidades](2026-10-21-oportunidades.md)
- [Detalle de propuesta y compromiso](2026-10-21-propuesta.md)
- [Detalle de proyecto](2026-10-21-proyecto.md)
- [Ficha del cliente](2026-10-21-cliente.md)
