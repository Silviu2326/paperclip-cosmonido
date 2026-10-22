# Retorno de autorización OAuth

Fecha: 2026-10-21
Identificador: OAU
Estado de superficie: Existente
Fase de ampliación: F2
Alcance: Regresión cuando cambie esta superficie

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/oauth-handoff`

Fuentes para preparar la implementación:

- [ui/src/pages/apps/PaperclipCloudOAuthHandoff.tsx](../../../../ui/src/pages/apps/PaperclipCloudOAuthHandoff.tsx)

## Qué mantendremos y por qué

- Handoff, estado, un solo uso y origen de conexión existentes.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Conservar continuidad del requisito que inició OAuth. | La autorización no debe perder el trabajo de origen. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Añadir resultado comprobado y retorno seguro al asistente. | Evita aparentar éxito si falta completar la conexión. |

## Datos y contrato de operación

Estado y claim existentes; no guardar tokens o códigos en documentos o logs.

## Recorrido y estados

Recibir retorno → validar estado → canjear por vía normal → regresar.

- Un callback no válido no crea concesiones.

## Lista de regresión

Activar esta revisión cuando una entrega cambie la página o uno de sus contratos. Los posibles cambios descritos arriba se evalúan entonces; esta ficha no añade trabajo al piloto por sí sola.

- [ ] Un callback no válido no crea concesiones.
- [ ] Un resultado incierto se reconcilia antes de reiniciar autorización.

## Páginas relacionadas

- [Conectar una aplicación](2026-10-21-conectar-app.md)
- [Detalle de aplicación conectada](2026-10-21-app.md)
