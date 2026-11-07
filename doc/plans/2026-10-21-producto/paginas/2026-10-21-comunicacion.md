# Detalle de conversación comercial

Fecha: 2026-10-21
Identificador: CMD
Estado de superficie: Nueva sobre transportes existentes
Fase de ampliación: F3
Alcance: Ampliación candidata; seleccionar por piloto

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/communications/:conversationId`

Fuentes para preparar la implementación:

- [packages/shared/src/types/email.ts](../../../../packages/shared/src/types/email.ts)

## Uso en los pilotos

El caso comercial elige la parte mínima de esta página que permite atender una entrada y conservar el siguiente paso. Calendario y reunión confirmada se exigen únicamente si ese resultado está prometido.

## Qué mantendremos y por qué

- Identidad de mensajes, adjuntos y resultados de publicación del transporte.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Presentar contexto comercial junto al hilo sin convertirlo en chat de administración. | El interlocutor externo no adquiere autoridad por escribir. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Resumen de cliente, oportunidad, compromisos y siguiente acción. | Facilita contestar con contexto. |
| Composición, borradores, destinatarios y revisión de adjuntos. | Reduce errores de envío. |
| Transferencia a humano o tarea con contexto enlazado. | Permite resolver peticiones fuera del alcance del agente. |

## Datos y contrato de operación

Mensaje externo, identificadores de hilo, destinatarios, publicación y vínculos autorizados. Separar notas internas de lo publicable.

## Ejemplo de pantalla y datos de prueba

Los valores siguientes ilustran el diseño; no son clientes, precios o resultados reales. Los campos finales se cierran con el caso seleccionado.

| Campo o bloque | Ejemplo | Regla visible |
| --- | --- | --- |
| para | contacto@cliente-demo.example | Dirección sintética. |
| nota interna | Revisar alcance antes de responder | Se queda fuera de la publicación. |
| resultado | incierto tras pérdida de respuesta | Conciliar con el proveedor antes de repetir. |

## Recorrido y estados

Leer petición → preparar respuesta → verificar destinatario y contenido → enviar bajo permiso → confirmar resultado.

- Un mensaje entrante malicioso no cambia permisos ni instrucciones internas.
- Una edición concurrente del borrador exige reconciliar antes de enviar.

## Tareas

Trabajo de ampliación de esta ficha, activable por el [backlog](../2026-10-21-backlog-fases.md). Su validación no bloquea el uso de la página existente.

| ID | Fase | Entregable | Depende de |
| --- | --- | --- | --- |
| CMD.01 | F3 | Definir compositor y contrato de publicación con notas separadas. | G02, G03, G05 |
| CMD.02 | F3 | Implementar respuesta contextual y transferencia con resultado verificable. | CMD.01, G15 |
| CMD.03 | F3 | Comprobar: La nota interna nunca aparece en el mensaje externo. Un envío fallido o incierto no se presenta como completado. | CMD.02 |

## Criterios de aceptación

- La nota interna nunca aparece en el mensaje externo.
- Un envío fallido o incierto no se presenta como completado.

## Páginas relacionadas

- [Comunicaciones](2026-10-21-comunicaciones.md)
- [Ficha del cliente](2026-10-21-cliente.md)
- [Detalle de tarea](2026-10-21-tarea.md)
- [Revisión de acciones de aplicaciones](2026-10-21-apps-revision.md)
