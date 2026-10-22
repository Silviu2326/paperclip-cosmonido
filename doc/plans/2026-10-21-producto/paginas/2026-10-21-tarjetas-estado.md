# Tarjetas de estado

Fecha: 2026-10-21
Identificador: STA
Estado de superficie: Existente experimental
Fase de ampliación: F5
Alcance: Regresión cuando cambie esta superficie

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/status`
- `/status/:cardId`
- `/status-cards`
- `/status-cards/:cardId`

Fuentes para preparar la implementación:

- [ui/src/pages/StatusCards/index.tsx](../../../../ui/src/pages/StatusCards/index.tsx)

## Qué mantendremos y por qué

- Tarjetas, archivo, configuración y dependencias experimentales de resumen.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Resumir resultados y compromisos con fuente y vigencia. | Una síntesis de IA no equivale a estado confirmado. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Contexto por cliente o proceso autorizado y enlace a evidencia. | Hace útil la síntesis para los tres caminos. |

## Datos y contrato de operación

StatusCards y resúmenes actuales; mantener fuente, fecha y audiencia de los datos usados.

## Recorrido y estados

Leer resumen → abrir evidencia → actuar en origen.

- Fuente no disponible mantiene el último resumen identificado como antiguo.
- Una tarjeta no puede publicar detalles de proyectos privados a toda la empresa.

## Lista de regresión

Activar esta revisión cuando una entrega cambie la página o uno de sus contratos. Los posibles cambios descritos arriba se evalúan entonces; esta ficha no añade trabajo al piloto por sí sola.

- [ ] Todo estado relevante se comprueba en la fuente.
- [ ] Los alias y flags siguen dirigiendo al comportamiento vigente.

## Páginas relacionadas

- [Inicio](2026-10-21-inicio.md)
- [Decisiones y pendientes humanos](2026-10-21-decisiones.md)
- [Ficha del cliente](2026-10-21-cliente.md)
