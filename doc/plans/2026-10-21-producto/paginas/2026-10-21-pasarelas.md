# Pasarelas de herramientas

Fecha: 2026-10-21
Identificador: GWS
Estado de superficie: Existente
Fase de ampliación: F4
Alcance: Regresión cuando cambie esta superficie

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/apps/gateways`
- `/apps/advanced/gateways`

Fuentes para preparar la implementación:

- [ui/src/pages/apps/gateways/GatewaysList.tsx](../../../../ui/src/pages/apps/gateways/GatewaysList.tsx)

## Qué mantendremos y por qué

- Inventario de gateways y acceso avanzado.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Mantenerlo fuera del primer recorrido salvo que sea necesario. | La infraestructura debe responder a una necesidad concreta. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Añadir procesos dependientes y diagnóstico resumido. | Ayuda a reparar sin estudiar todo el runtime. |

## Datos y contrato de operación

Gateways existentes y audiencias; listado no concede acceso a herramientas.

## Recorrido y estados

Elegir gateway → abrir capacidades → corregir requisito.

- Una pasarela accesible no prueba autorización de cada app subyacente.

## Lista de regresión

Activar esta revisión cuando una entrega cambie la página o uno de sus contratos. Los posibles cambios descritos arriba se evalúan entonces; esta ficha no añade trabajo al piloto por sí sola.

- [ ] Una pasarela accesible no prueba autorización de cada app subyacente.
- [ ] Un gateway eliminado conserva recibos históricos de acciones.

## Páginas relacionadas

- [Detalle de pasarela](2026-10-21-pasarela.md)
- [Herramientas avanzadas](2026-10-21-herramientas-avanzadas.md)
