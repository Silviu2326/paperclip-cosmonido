# Conectar una aplicación

Fecha: 2026-10-21
Identificador: APC
Estado de superficie: Existente
Fase de ampliación: F2
Alcance: Regresión cuando cambie esta superficie

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/apps/connect`
- `/apps/byo`
- `/apps/vercel-connect`

Fuentes para preparar la implementación:

- [ui/src/pages/apps/AppsConnect.tsx](../../../../ui/src/pages/apps/AppsConnect.tsx)

## Qué mantendremos y por qué

- Asistente de conexión y métodos permitidos por proveedor y despliegue.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Explicar capacidades y propietario antes del consentimiento. | Una conexión no debe ampliar audiencia o permisos implícitamente. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Añadir comprobación de la capacidad usada por el primer recorrido. | Autenticar no demuestra que la acción necesaria esté disponible. |

## Datos y contrato de operación

Concesión, secretos en almacén existente y configuración de capacidades. Conservar callbacks, estado OAuth y límites del proveedor.

## Recorrido y estados

Elegir cuenta y capacidad → autorizar → comprobar → guardar resultado.

- Cerrar y reanudar no crea otra conexión o aplicación externa.

## Lista de regresión

Activar esta revisión cuando una entrega cambie la página o uno de sus contratos. Los posibles cambios descritos arriba se evalúan entonces; esta ficha no añade trabajo al piloto por sí sola.

- [ ] Cerrar y reanudar no crea otra conexión o aplicación externa.
- [ ] Un fallo conserva diagnóstico seguro y nunca expone tokens.

## Páginas relacionadas

- [Aplicaciones](2026-10-21-apps.md)
- [Detalle de aplicación conectada](2026-10-21-app.md)
- [Retorno de autorización OAuth](2026-10-21-oauth-retorno.md)
