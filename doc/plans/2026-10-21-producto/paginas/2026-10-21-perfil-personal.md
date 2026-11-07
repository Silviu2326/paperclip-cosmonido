# Preferencias personales

Fecha: 2026-10-21
Identificador: PER
Estado de superficie: Existente
Fase de ampliación: F5
Alcance: Regresión cuando cambie esta superficie

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/company/settings/instance/profile`

Fuentes para preparar la implementación:

- [ui/src/pages/ProfileSettings.tsx](../../../../ui/src/pages/ProfileSettings.tsx)

## Qué mantendremos y por qué

- Identidad y preferencias personales vigentes.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Mantener preferencias personales separadas de políticas de empresa. | La vista elegida no define derechos ni configuración global. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Añadir preferencias de notificación o vista comercial solo si se validan. | Permite adaptar el uso sin afectar al equipo. |

## Datos y contrato de operación

User preferences existentes y ámbito correcto de persistencia.

## Recorrido y estados

Cambiar preferencia → guardar → comprobar persistencia personal.

- Una preferencia no activa automatizaciones de la empresa.

## Lista de regresión

Activar esta revisión cuando una entrega cambie la página o uno de sus contratos. Los posibles cambios descritos arriba se evalúan entonces; esta ficha no añade trabajo al piloto por sí sola.

- [ ] Una preferencia no activa automatizaciones de la empresa.
- [ ] Cambiar de empresa respeta qué ajustes son personales y cuáles contextuales.

## Páginas relacionadas

- [Perfil de miembro](2026-10-21-usuario.md)
- [Ajustes de empresa](2026-10-21-ajustes-empresa.md)
