# Comunicaciones

Fecha: 2026-10-21
Identificador: COM
Estado de superficie: Nueva sobre transportes existentes
Fase de ampliación: F3
Alcance: Ampliación candidata; seleccionar por piloto

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/communications`

Fuentes para preparar la implementación:

- [ui/src/api/email.ts](../../../../ui/src/api/email.ts)
- [server/src/routes/email.ts](../../../../server/src/routes/email.ts)

## Uso en los pilotos

El caso comercial elige la parte mínima de esta página que permite atender una entrada y conservar el siguiente paso. Calendario y reunión confirmada se exigen únicamente si ese resultado está prometido.

## Qué mantendremos y por qué

- Correo asociado a tareas y endpoints de comunicación existentes.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Añadir una vista por interlocutor y relación de negocio. | El historial comercial no debe depender de conocer la tarea que lo originó. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Bandeja con cliente, oportunidad, responsable y estado de atención. | Permite dar continuidad a respuestas. |
| Asociación revisable de conversaciones ambiguas. | Evita adjuntar mensajes al cliente equivocado. |
| Indicadores separados de borrador, enviado, entregado e incierto. | Presenta evidencia real de transporte. |

## Datos y contrato de operación

Conversación y mensajes de proveedor, vínculos comerciales, tareas fuente y estado de publicación. No copiar mensajes como simples notas perdiendo identidad externa.

## Ejemplo de pantalla y datos de prueba

Los valores siguientes ilustran el diseño; no son clientes, precios o resultados reales. Los campos finales se cierran con el caso seleccionado.

| Campo o bloque | Ejemplo | Regla visible |
| --- | --- | --- |
| hilo | thread-demo-001 | Identidad externa estable. |
| relación | Oportunidad Demo 001 | Revisable si la coincidencia es ambigua. |
| último resultado | borrador preparado | La interfaz todavía ofrece revisar y enviar. |

## Recorrido y estados

Recibir mensaje → resolver relación → abrir hilo → responder o delegar → fijar siguiente paso.

- Desconexión muestra información guardada con vigencia y acción de reconexión.
- La recepción repetida no duplica mensajes ni dispara el mismo seguimiento.

## Tareas

Trabajo de ampliación de esta ficha, activable por el [backlog](../2026-10-21-backlog-fases.md). Su validación no bloquea el uso de la página existente.

| ID | Fase | Entregable | Depende de |
| --- | --- | --- | --- |
| COM.01 | F3 | Definir proyección de bandeja y reconciliación de identidades externas. | G02, G03, G04, G05 |
| COM.02 | F3 | Construir asociación, filtros y atención de conversaciones. | COM.01, G15 |
| COM.03 | F3 | Comprobar: La respuesta entrante retoma el contexto correcto y aparece en la ficha del cliente. El usuario distingue una conversación sin asignar de una sin respuesta. | COM.02 |

## Criterios de aceptación

- La respuesta entrante retoma el contexto correcto y aparece en la ficha del cliente.
- El usuario distingue una conversación sin asignar de una sin respuesta.

## Páginas relacionadas

- [Detalle de conversación comercial](2026-10-21-comunicacion.md)
- [Ficha del contacto](2026-10-21-contacto.md)
- [Aplicaciones](2026-10-21-apps.md)
- [Detalle del canal](2026-10-21-canal.md)
