# Acceso a la instancia

Fecha: 2026-10-21
Identificador: IAC
Estado de superficie: Existente
Fase de ampliación: F1
Alcance: Regresión cuando cambie esta superficie

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/company/settings/instance/access`

Fuentes para preparar la implementación:

- [ui/src/pages/InstanceAccess.tsx](../../../../ui/src/pages/InstanceAccess.tsx)

## Qué mantendremos y por qué

- Roles y control de acceso a la instancia bajo modos de despliegue actuales.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Explicar diferencias entre instancia, empresa y acceso de cliente. | Evita tratar multiempresa como SaaS aislado automáticamente. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Añadir enlaces al alcance administrado y a sus miembros. | Ayuda a ubicar responsabilidades. |

## Datos y contrato de operación

Instance roles y autenticación existentes; no mezclar la concesión de portal con administración de instancia.

## Recorrido y estados

Revisar alcance → administrar acceso autorizado → comprobar restricciones.

- Los modos local_trusted y authenticated mantienen sus contratos.

## Lista de regresión

Activar esta revisión cuando una entrega cambie la página o uno de sus contratos. Los posibles cambios descritos arriba se evalúan entonces; esta ficha no añade trabajo al piloto por sí sola.

- [ ] Los modos local_trusted y authenticated mantienen sus contratos.
- [ ] No se modifica exposición privada o pública al habilitar un módulo comercial.

## Páginas relacionadas

- [Miembros e invitaciones de empresa](2026-10-21-miembros.md)
- [Ajustes de empresa](2026-10-21-ajustes-empresa.md)
- [Autenticación](2026-10-21-autenticacion.md)
