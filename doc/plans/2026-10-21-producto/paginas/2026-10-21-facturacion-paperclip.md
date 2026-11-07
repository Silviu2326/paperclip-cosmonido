# Plan consumo y facturación de Paperclip

Fecha: 2026-10-21
Identificador: FAC
Estado de superficie: Nueva y posterior al piloto
Fase de ampliación: F6
Alcance: Ampliación posterior

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- Propuesta: /company/billing

Fuentes para preparar la implementación:

Página propuesta: no se ha identificado una implementación propia en las fuentes inventariadas.

## Uso en los pilotos

La ampliación se elige después de observar la necesidad en un piloto. Su fase de referencia no obliga a retrasar los otros recorridos.

## Qué mantendremos y por qué

- La separación entre gasto de ejecución, cuentas de proveedores y economía de los clientes del comprador.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Crear una superficie propia para la relación comercial entre Paperclip y su comprador. | No debe confundirse con las facturas que una agencia emite a sus clientes. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Plan, capacidades, consumo, límites e historial de facturas contratadas. | Permite comprender qué se paga y por qué. |
| Cambio o cancelación con efecto y fecha revisables y enlace a proveedor de pago elegido. | Evita modificaciones comerciales ambiguas. |

## Datos y contrato de operación

Cuenta de facturación del comprador, plan y revisiones de precio, consumo medido y recibos del proveedor. El proveedor y la unidad de cobro quedan pendientes de decisión.

## Recorrido y estados

Revisar plan y consumo → inspeccionar cambio y efectos → confirmar por el flujo contratado → verificar recibo.

- Un webhook repetido no duplica factura ni modifica dos veces la suscripción.
- Un pago incierto no se muestra como confirmado ni corta trabajo fuera de la política definida.

## Tareas

Trabajo de ampliación de esta ficha, activable por el [backlog](../2026-10-21-backlog-fases.md). Su validación no bloquea el uso de la página existente.

| ID | Fase | Entregable | Depende de |
| --- | --- | --- | --- |
| FAC.01 | F6 | Definir unidad de cobro, consumo y políticas del plan contratado. | G03, G11, G12 |
| FAC.02 | F6 | Construir gestión de plan e historial con proveedor y reconciliación elegidos. | FAC.01, G21 |
| FAC.03 | F6 | Comprobar: Se distingue claramente coste de IA, precio de Paperclip y cobros a clientes de la agencia. Cambiar o cancelar conserva recibos, fecha efectiva y responsabilidades de acceso y datos. | FAC.02 |

## Criterios de aceptación

- Se distingue claramente coste de IA, precio de Paperclip y cobros a clientes de la agencia.
- Cambiar o cancelar conserva recibos, fecha efectiva y responsabilidades de acceso y datos.

## Páginas relacionadas

- [Resultados económicos del negocio](2026-10-21-finanzas.md)
- [Costes de ejecución](2026-10-21-costes.md)
- [Presupuestos de ejecución](2026-10-21-presupuestos.md)
- [Ajustes de empresa](2026-10-21-ajustes-empresa.md)
