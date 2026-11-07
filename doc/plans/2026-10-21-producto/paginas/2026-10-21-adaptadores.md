# Adaptadores de agentes

Fecha: 2026-10-21
Identificador: ADA
Estado de superficie: Existente
Fase de ampliación: F4
Alcance: Regresión cuando cambie esta superficie

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/company/settings/instance/adapters`

Alias o entradas de compatibilidad:

- `/instance/settings/adapters`

Fuentes para preparar la implementación:

- [ui/src/pages/AdapterManager.tsx](../../../../ui/src/pages/AdapterManager.tsx)

## Qué mantendremos y por qué

- Registro de adaptadores y su frontera de ejecución.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Presentar capacidades y requisitos comprobados para los recorridos. | Un adaptador disponible no garantiza uso de correo o archivos. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Añadir enlaces a agentes afectados y diagnóstico de compatibilidad. | Reduce configuración repetida. |

## Datos y contrato de operación

Adaptadores y configuración existentes. Si se modifica un adaptador se seguirá su skill y contratos; esta tarea solo lo documenta.

## Recorrido y estados

Inspeccionar soporte → resolver requisito → configurar agente → probar tarea autorizada.

- No se cambia de runtime para eludir una denegación de acceso.

## Lista de regresión

Activar esta revisión cuando una entrega cambie la página o uno de sus contratos. Los posibles cambios descritos arriba se evalúan entonces; esta ficha no añade trabajo al piloto por sí sola.

- [ ] No se cambia de runtime para eludir una denegación de acceso.
- [ ] Los cambios de adaptador no alteran recibos históricos.

## Páginas relacionadas

- [Detalle del agente](2026-10-21-agente.md)
- [Entornos de ejecución](2026-10-21-entornos.md)
- [Catálogo e instalación de equipos](2026-10-21-equipos.md)
