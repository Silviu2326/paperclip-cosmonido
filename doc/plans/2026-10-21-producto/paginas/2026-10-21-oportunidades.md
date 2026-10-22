# Oportunidades

Fecha: 2026-10-21
Identificador: OPO
Estado de superficie: Nueva
Fase de ampliación: F3
Alcance: Ampliación candidata; seleccionar por piloto

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/opportunities`

Fuentes para preparar la implementación:

Página propuesta: no se ha identificado una implementación propia en las fuentes inventariadas.

## Uso en los pilotos

El caso comercial elige la parte mínima de esta página que permite atender una entrada y conservar el siguiente paso. Calendario y reunión confirmada se exigen únicamente si ese resultado está prometido.

## Qué mantendremos y por qué

- El motor de pipelines como candidato a etapas y transiciones; no abrir otro motor sin evaluar compatibilidad.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Dar nombres y campos comerciales a la vista de oportunidades. | Un pipeline genérico no expresa por sí solo importe, próxima acción o previsión. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Vista por etapas y tabla con responsable, valor, moneda y seguimiento. | Permite gestionar el trabajo comercial. |
| Filtros por servicio, cliente y fecha y cierres con motivo. | Hace posible revisar cartera y pérdidas. |
| Totales que separen monedas y previsión de ventas cerradas. | Evita métricas engañosas. |

## Datos y contrato de operación

Oportunidad, cliente, contactos, etapa, valor estimado, moneda, siguiente acción y fechas. La decisión de reutilización del motor pertenece a G06.

## Ejemplo de pantalla y datos de prueba

Los valores siguientes ilustran el diseño; no son clientes, precios o resultados reales. Los campos finales se cierran con el caso seleccionado.

| Campo o bloque | Ejemplo | Regla visible |
| --- | --- | --- |
| título | Servicio Demo para Cliente Demo A | Abrir ficha con fuente del lead. |
| etapa | Cualificación | Nombre de muestra; acordar etapas del piloto. |
| siguiente acción | Responder a la solicitud | Elemento operativo principal. |
| importe | desconocido | La ausencia de valoración no es cero ingresos. |

## Recorrido y estados

Abrir cartera → detectar seguimiento vencido → abrir oportunidad → completar acción → registrar el nuevo estado.

- Mover una tarjeta no envía mensajes ni compromete una entrega salvo automatización autorizada.
- Una transición rechazada devuelve la tarjeta al estado confirmado y explica el bloqueo.

## Tareas

Trabajo de ampliación de esta ficha, activable por el [backlog](../2026-10-21-backlog-fases.md). Su validación no bloquea el uso de la página existente.

| ID | Fase | Entregable | Depende de |
| --- | --- | --- | --- |
| OPO.01 | F3 | Definir proyección comercial y reglas de transición sobre el motor elegido. | G02, G03, G04, G06 |
| OPO.02 | F3 | Construir tabla y tablero con seguimiento y cierres trazables. | OPO.01, G16 |
| OPO.03 | F3 | Comprobar: Una oportunidad siempre muestra responsable y próxima acción o explica su ausencia. No se suman importes de distintas monedas como si fueran una sola. | OPO.02 |

## Criterios de aceptación

- Una oportunidad siempre muestra responsable y próxima acción o explica su ausencia.
- No se suman importes de distintas monedas como si fueran una sola.

## Páginas relacionadas

- [Ficha de la oportunidad](2026-10-21-oportunidad.md)
- [Procesos y pipelines](2026-10-21-pipelines.md)
- [Leads](2026-10-21-leads.md)
- [Resultados económicos del negocio](2026-10-21-finanzas.md)
