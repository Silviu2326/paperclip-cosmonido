# Organigrama

Fecha: 2026-10-21
Identificador: ORG
Estado de superficie: Existente con redirección según interfaz
Fase de ampliación: F4
Alcance: Regresión cuando cambie esta superficie

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/org`

Fuentes para preparar la implementación:

- [ui/src/pages/OrgChart.tsx](../../../../ui/src/pages/OrgChart.tsx)
- [ui/src/pages/OrgChart.production.tsx](../../../../ui/src/pages/OrgChart.production.tsx)
- [ui/src/App.tsx](../../../../ui/src/App.tsx)

## Qué mantendremos y por qué

- Jerarquía de agentes y reglas de árbol sin ciclos; en interfaz simplificada la ruta redirige a agentes.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Mantenerlo como vista de organización opcional. | No debe bloquear al emprendedor que necesita una capacidad concreta. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Relación entre roles y procedimientos o responsabilidades. | Da utilidad a la estructura más allá de los títulos. |

## Datos y contrato de operación

Reports-to de agentes existentes; asignación de tareas y responsable comercial siguen siendo conceptos distintos.

## Recorrido y estados

Consultar equipo → abrir agente → ajustar dependencia bajo permisos.

- Una baja no concede permisos al sustituto automáticamente.
- Un cambio que genere ciclo se rechaza con el estado original intacto.

## Lista de regresión

Activar esta revisión cuando una entrega cambie la página o uno de sus contratos. Los posibles cambios descritos arriba se evalúan entonces; esta ficha no añade trabajo al piloto por sí sola.

- [ ] La estructura sigue siendo válida y compañía-específica.
- [ ] Los enlaces antiguos funcionan tanto en modo clásico como simplificado.

## Páginas relacionadas

- [Agentes](2026-10-21-agentes.md)
- [Detalle del agente](2026-10-21-agente.md)
- [Catálogo e instalación de equipos](2026-10-21-equipos.md)
