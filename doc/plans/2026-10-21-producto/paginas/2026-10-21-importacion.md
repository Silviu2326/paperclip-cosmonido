# Importación de empresa

Fecha: 2026-10-21
Identificador: IMP
Estado de superficie: Existente
Fase de ampliación: F6
Alcance: Ampliación posterior

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/company/import`

Fuentes para preparar la implementación:

- [ui/src/pages/CompanyImport.tsx](../../../../ui/src/pages/CompanyImport.tsx)

## Uso en los pilotos

La ampliación se elige después de observar la necesidad en un piloto. Su fase de referencia no obliga a retrasar los otros recorridos.

## Qué mantendremos y por qué

- Restricciones de despliegue, importación y agentes inicialmente pausados según reglas vigentes.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Añadir política explícita para identidades comerciales y sus vínculos. | Las coincidencias de nombre no permiten fusionar carteras. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Añadir validación del manifiesto y resumen de conflictos. | Evita pérdidas y duplicados. |

## Datos y contrato de operación

Paquete versionado y mapeo de identidades; la importación CSV de leads es otro recorrido.

## Recorrido y estados

Validar paquete → revisar conflictos → importar → comprobar → activar solo bajo autoridad.

- Reintentar no duplica el paquete ya aplicado.

## Tareas

Trabajo de ampliación de esta ficha, activable por el [backlog](../2026-10-21-backlog-fases.md). Su validación no bloquea el uso de la página existente.

| ID | Fase | Entregable | Depende de |
| --- | --- | --- | --- |
| IMP.01 | F6 | Precisar alcance y contrato de importación de empresa. | G02, G03, G12 |
| IMP.02 | F6 | Añadir política explícita para identidades comerciales y sus vínculos. Añadir validación del manifiesto y resumen de conflictos. | IMP.01, G24 |
| IMP.03 | F6 | Comprobar: Reintentar no duplica el paquete ya aplicado. Importar no envía mensajes ni activa automatizaciones por sorpresa. | IMP.02 |

## Criterios de aceptación

- Reintentar no duplica el paquete ya aplicado.
- Importar no envía mensajes ni activa automatizaciones por sorpresa.

## Páginas relacionadas

- [Exportación de empresa](2026-10-21-exportacion.md)
- [Empresas operadoras](2026-10-21-empresas.md)
- [Leads](2026-10-21-leads.md)
