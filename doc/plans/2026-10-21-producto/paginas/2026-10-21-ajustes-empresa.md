# Ajustes de empresa

Fecha: 2026-10-21
Identificador: SET
Estado de superficie: Existente
Fase de ampliación: F1
Alcance: Regresión cuando cambie esta superficie

## Estado de implementación (2026-10-22)

La integración local reutiliza navegación contextual para ajustes y ofrece preferencias de notificación con ámbitos diferenciados. La interfaz debe conservar la separación entre preferencias de persona, empresa e instancia, y sus permisos. La configuración efectiva de canales o Web Push requiere comprobación aparte; véase el [registro de implementación](../../2026-10-22-implementacion-ux-simplificada.md).

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/company/settings`
- `/company/settings/instance/general`
- `/company/settings/instance/heartbeats`

Alias o entradas de compatibilidad:

- `/company/settings/instance`
- `/settings`
- `/settings/*`
- `/instance`
- `/instance/settings`
- `/instance/settings/*`

Fuentes para preparar la implementación:

- [ui/src/pages/CompanySettings.tsx](../../../../ui/src/pages/CompanySettings.tsx)

## Qué mantendremos y por qué

- Identidad, logo, gobierno y ajustes generales incrustados con sus permisos.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Añadir preferencias de caminos y vocabulario sin otra empresa. | El mismo negocio puede necesitar los tres usos. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Añadir oferta resumida, zona horaria y requisitos de configuración cuando el contrato los defina. | Da contexto compartido a páginas y agentes. |

## Datos y contrato de operación

Company y preferencias versionadas; distinguir ajustes por empresa y por instancia. Renombrar conserva las reglas del despliegue gestionado.

## Recorrido y estados

Cambiar configuración → revisar alcance → guardar → actualizar vistas dependientes.

- Una preferencia visual no concede permisos ni habilita acciones.

## Lista de regresión

Activar esta revisión cuando una entrega cambie la página o uno de sus contratos. Los posibles cambios descritos arriba se evalúan entonces; esta ficha no añade trabajo al piloto por sí sola.

- [ ] Una preferencia visual no concede permisos ni habilita acciones.
- [ ] Archivar conserva historial y se ejecuta por la vía vigente.

## Páginas relacionadas

- [Empresas operadoras](2026-10-21-empresas.md)
- [Configuración inicial](2026-10-21-onboarding.md)
- [Funciones experimentales](2026-10-21-experimentales.md)
- [Miembros e invitaciones de empresa](2026-10-21-miembros.md)
