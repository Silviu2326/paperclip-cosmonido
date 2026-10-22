# Portal del cliente

Fecha: 2026-10-21
Identificador: POR
Estado de superficie: Nueva y posterior al piloto
Fase de ampliación: F6
Alcance: Ampliación posterior

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/portal/:portalId`

Fuentes para preparar la implementación:

Página propuesta: no se ha identificado una implementación propia en las fuentes inventariadas.

## Uso en los pilotos

La ampliación se elige después de observar la necesidad en un piloto. Su fase de referencia no obliga a retrasar los otros recorridos.

## Qué mantendremos y por qué

- Los entregables y compromisos internos como fuente de lo publicado.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Introducir acceso externo específico en lugar de otorgar contexto de operador. | La colaboración externa necesita una audiencia y permisos propios. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Identificación, invitación y acceso limitado a los proyectos publicados. | Aísla a cada destinatario. |
| Entrega, petición de cambios y aceptación de una revisión concreta. | Reduce coordinación manual. |
| Entrada de archivos con audiencia y revisión definidas. | Permite recibir briefs sin dar acceso a otros clientes. |

## Datos y contrato de operación

Principal externo, concesión limitada, publicación de entregable y evidencia de revisión. La autenticación y los permisos se deciden antes de exponer rutas.

## Recorrido y estados

Recibir invitación → acceder a entrega autorizada → solicitar cambios o aceptar revisión → registrar resultado interno.

- Un enlace caducado o revocado no filtra la existencia de otros clientes.
- Una nueva versión no queda aceptada por heredar la aceptación anterior.

## Tareas

Trabajo de ampliación de esta ficha, activable por el [backlog](../2026-10-21-backlog-fases.md). Su validación no bloquea el uso de la página existente.

| ID | Fase | Entregable | Depende de |
| --- | --- | --- | --- |
| POR.01 | F6 | Definir identidad externa, publicación y revocación del portal. | G02, G03, G07, G12 |
| POR.02 | F6 | Construir revisión externa y entrada de archivos con aislamiento. | POR.01, G22 |
| POR.03 | F6 | Comprobar: Dos clientes no acceden al mismo contenido salvo concesión explícita. Revocar el acceso impide nuevas lecturas, sin borrar evidencias históricas. | POR.02 |

## Criterios de aceptación

- Dos clientes no acceden al mismo contenido salvo concesión explícita.
- Revocar el acceso impide nuevas lecturas, sin borrar evidencias históricas.

## Páginas relacionadas

- [Ficha del cliente](2026-10-21-cliente.md)
- [Detalle de propuesta y compromiso](2026-10-21-propuesta.md)
- [Artefactos de entrada y salida](2026-10-21-artefactos.md)
- [Miembros e invitaciones de empresa](2026-10-21-miembros.md)
