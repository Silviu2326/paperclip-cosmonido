# Aplicación sin conexión

Fecha: 2026-10-21
Identificador: APN
Estado de superficie: Existente
Fase de ampliación: F2
Alcance: Regresión cuando cambie esta superficie

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/apps/app/:applicationId`
- `/apps/app/:applicationId/:tab`

Fuentes para preparar la implementación:

- [ui/src/pages/apps/AppNotConnected.tsx](../../../../ui/src/pages/apps/AppNotConnected.tsx)

## Qué mantendremos y por qué

- Ficha de aplicación que todavía no tiene conexión utilizable.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Explicar el requisito concreto y los métodos disponibles. | El usuario necesita saber qué impide el recorrido. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Añadir retorno al trabajo que originó la necesidad. | Evita perder el contexto tras conectar. |

## Datos y contrato de operación

Definición de app y requisitos; no inventar una conexión para renderizar la página.

## Recorrido y estados

Abrir requisito → inspeccionar capacidades → iniciar conexión → regresar.

- Una app sin método compatible muestra ese límite.

## Lista de regresión

Activar esta revisión cuando una entrega cambie la página o uno de sus contratos. Los posibles cambios descritos arriba se evalúan entonces; esta ficha no añade trabajo al piloto por sí sola.

- [ ] Una app sin método compatible muestra ese límite.
- [ ] La página no pide secretos ni ejecuta herramientas al visitarla.

## Páginas relacionadas

- [Aplicaciones](2026-10-21-apps.md)
- [Conectar una aplicación](2026-10-21-conectar-app.md)
