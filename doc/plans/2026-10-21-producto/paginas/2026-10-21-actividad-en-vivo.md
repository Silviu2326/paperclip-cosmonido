# Actividad en vivo

Fecha: 2026-10-21
Identificador: VIV
Estado de superficie: Existente
Fase de ampliación: F5
Alcance: Regresión cuando cambie esta superficie

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/dashboard/live`

Fuentes para preparar la implementación:

- [ui/src/pages/DashboardLive.tsx](../../../../ui/src/pages/DashboardLive.tsx)

## Qué mantendremos y por qué

- Vista dedicada al trabajo activo y actualización de ejecuciones.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Añadir cliente, proyecto y resultado esperado cuando estén disponibles. | La actividad debe tener significado de negocio. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Enlaces a bloqueos y evidencias y hora de última actualización. | Distingue ejecución activa de información antigua. |

## Datos y contrato de operación

Estado confirmado de ejecución y referencias autorizadas. No estimar progreso a partir de tiempo transcurrido.

## Recorrido y estados

Abrir trabajo activo → inspeccionar estado → ir a tarea o detener bajo permisos.

- Reconexión conserva estado visible y marca vigencia.
- Un trabajo finalizado deja de contarse como activo.

## Lista de regresión

Activar esta revisión cuando una entrega cambie la página o uno de sus contratos. Los posibles cambios descritos arriba se evalúan entonces; esta ficha no añade trabajo al piloto por sí sola.

- [ ] No se muestran ejecuciones antiguas como si siguieran trabajando.
- [ ] Los controles de pausa y detención conservan sus garantías actuales.

## Páginas relacionadas

- [Inicio](2026-10-21-inicio.md)
- [Historial de ejecuciones](2026-10-21-ejecuciones.md)
- [Detalle de tarea](2026-10-21-tarea.md)
