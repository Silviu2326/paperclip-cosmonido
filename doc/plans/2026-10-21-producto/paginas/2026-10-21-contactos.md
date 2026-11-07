# Contactos

Fecha: 2026-10-21
Identificador: CON
Estado de superficie: Nueva
Fase de ampliación: F2
Alcance: Ampliación candidata; seleccionar por piloto

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/contacts`

Fuentes para preparar la implementación:

Página propuesta: no se ha identificado una implementación propia en las fuentes inventariadas.

## Uso en los pilotos

La agencia utiliza solo alta e identificación del cliente, brief, trabajo y revisión del servicio elegido. Importación masiva, fusión, portal y propuesta comercial se seleccionan aparte.

## Qué mantendremos y por qué

- Identidad de usuarios y miembros de Paperclip separada de personas externas.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Introducir una agenda comercial independiente del directorio de miembros. | Un interlocutor externo no es un usuario autorizado. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Listado, creación, roles en organizaciones y métodos de contacto. | Permite trabajar con varios interlocutores de una cuenta. |
| Normalización, origen y revisión de duplicados. | Mejora importaciones y continuidad del historial. |

## Datos y contrato de operación

Persona, canales de contacto, relación con una o varias organizaciones y preferencias de contacto registradas. No asumir que una persona solo pertenece a una organización.

## Ejemplo de pantalla y datos de prueba

Los valores siguientes ilustran el diseño; no son clientes, precios o resultados reales. Los campos finales se cierran con el caso seleccionado.

| Campo o bloque | Ejemplo | Regla visible |
| --- | --- | --- |
| persona | Persona Demo | Identidad independiente de la organización. |
| correo | contacto@cliente-a.example | Dirección sintética; no es una cuenta para envío. |
| organización y rol | Cliente Demo A; revisora | La misma persona puede tener otra relación. |

## Recorrido y estados

Crear persona → añadir organización y rol → elegir interlocutor en una oportunidad.

- Correo compartido o ausente no impide registrar un contacto válido.
- Una fusión requiere revisar diferencias y preservar todas las relaciones autorizadas.

## Tareas

Trabajo de ampliación de esta ficha, activable por el [backlog](../2026-10-21-backlog-fases.md). Su validación no bloquea el uso de la página existente.

| ID | Fase | Entregable | Depende de |
| --- | --- | --- | --- |
| CON.01 | F2 | Definir identidad, búsqueda y vínculos de contacto. | G02, G03, G04 |
| CON.02 | F2 | Construir agenda y revisión de duplicados sin mezclar miembros. | CON.01, G13 |
| CON.03 | F2 | Comprobar: Una persona puede figurar en dos organizaciones sin duplicar su identidad. Importar el mismo identificador externo no crea registros repetidos. | CON.02 |

## Criterios de aceptación

- Una persona puede figurar en dos organizaciones sin duplicar su identidad.
- Importar el mismo identificador externo no crea registros repetidos.

## Páginas relacionadas

- [Ficha del contacto](2026-10-21-contacto.md)
- [Clientes](2026-10-21-clientes.md)
- [Leads](2026-10-21-leads.md)
