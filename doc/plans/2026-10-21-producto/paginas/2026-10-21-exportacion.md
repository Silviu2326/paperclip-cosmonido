# Exportación de empresa

Fecha: 2026-10-21
Identificador: EXO
Estado de superficie: Existente
Fase de ampliación: F6
Alcance: Ampliación posterior

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/company/export/*`

Alias o entradas de compatibilidad:

- `/company/settings/cloud-upstream`

Fuentes para preparar la implementación:

- [ui/src/pages/CompanyExport.tsx](../../../../ui/src/pages/CompanyExport.tsx)

## Uso en los pilotos

La ampliación se elige después de observar la necesidad en un piloto. Su fase de referencia no obliga a retrasar los otros recorridos.

## Qué mantendremos y por qué

- Formatos, revisiones y reglas de exportación existentes.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Evaluar compatibilidad de las nuevas entidades antes de exportarlas. | Añadir clientes no debe romper paquetes actuales. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Añadir manifiesto y tratamiento explícito de datos comerciales privados. | Hace inspeccionable el contenido exportado. |

## Datos y contrato de operación

Versiones de formato y procedencia. No exportar secretos, grants ni permisos como si fuesen portables.

## Recorrido y estados

Elegir alcance → revisar contenido → exportar → comprobar paquete.

- Los formatos anteriores siguen tratándose según versión.

## Tareas

Trabajo de ampliación de esta ficha, activable por el [backlog](../2026-10-21-backlog-fases.md). Su validación no bloquea el uso de la página existente.

| ID | Fase | Entregable | Depende de |
| --- | --- | --- | --- |
| EXO.01 | F6 | Precisar alcance y contrato de exportación de empresa. | G02, G03, G12 |
| EXO.02 | F6 | Evaluar compatibilidad de las nuevas entidades antes de exportarlas. Añadir manifiesto y tratamiento explícito de datos comerciales privados. | EXO.01, G24 |
| EXO.03 | F6 | Comprobar: Los formatos anteriores siguen tratándose según versión. El archivo no incorpora credenciales ni contenido sin permiso. | EXO.02 |

## Criterios de aceptación

- Los formatos anteriores siguen tratándose según versión.
- El archivo no incorpora credenciales ni contenido sin permiso.

## Páginas relacionadas

- [Importación de empresa](2026-10-21-importacion.md)
- [Clientes](2026-10-21-clientes.md)
- [Secretos de empresa](2026-10-21-secretos.md)
