# Página no encontrada

Fecha: 2026-10-21
Identificador: NFD
Estado de superficie: Existente
Fase de ampliación: F1
Alcance: Regresión cuando cambie esta superficie

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- Ruta de fallback de empresa o global

Alias o entradas de compatibilidad:

- `/*`

Fuentes para preparar la implementación:

- [ui/src/pages/NotFound.tsx](../../../../ui/src/pages/NotFound.tsx)

## Qué mantendremos y por qué

- Tratamiento de ruta no encontrada y ámbito global o de empresa.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Distinguir enlace retirado de pérdida de contexto sin revelar recursos privados. | El usuario necesita recuperar navegación. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Añadir destinos de recuperación compatibles con la empresa activa. | Evita redirigir a otra cartera. |

## Datos y contrato de operación

Solo información de navegación autorizada; no confirmar existencia de IDs ocultos.

## Recorrido y estados

Abrir enlace inválido → ofrecer navegación válida → volver al trabajo.

- Un ID privado y uno inexistente no se distinguen mediante mensajes indebidos.

## Lista de regresión

Activar esta revisión cuando una entrega cambie la página o uno de sus contratos. Los posibles cambios descritos arriba se evalúan entonces; esta ficha no añade trabajo al piloto por sí sola.

- [ ] Un ID privado y uno inexistente no se distinguen mediante mensajes indebidos.
- [ ] El retorno no conserva datos de otra empresa.

## Páginas relacionadas

- [Inicio](2026-10-21-inicio.md)
- [Búsqueda](2026-10-21-busqueda.md)
