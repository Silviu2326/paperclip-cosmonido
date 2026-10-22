# Detalle de propuesta y compromiso

Fecha: 2026-10-21
Identificador: PRD
Estado de superficie: Nueva
Fase de ampliación: F3
Alcance: Ampliación candidata; seleccionar por piloto

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/proposals/:proposalId`

Fuentes para preparar la implementación:

Página propuesta: no se ha identificado una implementación propia en las fuentes inventariadas.

## Qué mantendremos y por qué

- Editor documental, revisiones y publicación de artefactos cuando satisfagan el caso.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Separar edición, autorización de envío y aceptación comercial. | Cada paso tiene efectos y actores distintos. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Contenido estructurado de alcance, precio, entradas y entrega. | Permite convertir el acuerdo en trabajo. |
| Versiones inmutables al enviar y registro de aceptación con evidencia. | Protege la trazabilidad del compromiso. |
| Acción de envío o preparación según los permisos disponibles. | Evita presentar un borrador como enviado. |

## Datos y contrato de operación

Revisión de propuesta, instantánea de condiciones, destinatario, evidencias y compromiso. La firma electrónica completa queda fuera del mínimo inicial.

## Ejemplo de pantalla y datos de prueba

Los valores siguientes ilustran el diseño; no son clientes, precios o resultados reales. Los campos finales se cierran con el caso seleccionado.

| Campo o bloque | Ejemplo | Regla visible |
| --- | --- | --- |
| alcance | Paquete Demo según brief-v1 | Referencia verificable. |
| destinatario | Persona Demo | Comprobar identidad antes de publicar. |
| aceptación | pendiente | Registrar evidencia para la revisión aceptada. |

## Recorrido y estados

Editar → revisar condiciones → publicar revisión → registrar respuesta → vincular compromiso a proyecto.

- Aceptar una revisión anterior no acepta cambios posteriores.
- Un resultado de envío incierto se reconcilia antes de volver a enviar.

## Tareas

Trabajo de ampliación de esta ficha, activable por el [backlog](../2026-10-21-backlog-fases.md). Su validación no bloquea el uso de la página existente.

| ID | Fase | Entregable | Depende de |
| --- | --- | --- | --- |
| PRD.01 | F3 | Definir contrato de revisión publicada y aceptación. | G02, G03, G05, G07 |
| PRD.02 | F3 | Implementar edición, publicación, evidencia y transferencia del compromiso. | PRD.01, G16 |
| PRD.03 | F3 | Comprobar: El proyecto conserva el alcance exacto aceptado. La aceptación manual identifica actor, fecha y documento o mensaje que la respalda. | PRD.02 |

## Criterios de aceptación

- El proyecto conserva el alcance exacto aceptado.
- La aceptación manual identifica actor, fecha y documento o mensaje que la respalda.

## Páginas relacionadas

- [Propuestas comerciales](2026-10-21-propuestas.md)
- [Detalle de proyecto](2026-10-21-proyecto.md)
- [Detalle de conversación comercial](2026-10-21-comunicacion.md)
- [Aprobaciones](2026-10-21-aprobaciones.md)
