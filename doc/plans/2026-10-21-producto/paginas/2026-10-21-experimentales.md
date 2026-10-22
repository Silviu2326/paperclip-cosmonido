# Funciones experimentales

Fecha: 2026-10-21
Identificador: EXP
Estado de superficie: Existente
Fase de ampliación: F1
Alcance: Regresión cuando cambie esta superficie

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/company/settings/instance/experimental`

Fuentes para preparar la implementación:

- [ui/src/pages/InstanceExperimentalSettings.tsx](../../../../ui/src/pages/InstanceExperimentalSettings.tsx)

## Qué mantendremos y por qué

- Flags y dependencias a nivel de instancia.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Distinguir experimento técnico y capacidad de producto calificada. | Encender un flag no prueba un recorrido vendible. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Añadir impacto, dependencias y vuelta al estado anterior cuando proceda. | Permite activar sin desorientar a otras empresas. |

## Datos y contrato de operación

Ajustes de instancia existentes; las preferencias de camino son de empresa y no deben reutilizar flags globales.

## Recorrido y estados

Revisar alcance → activar experimento autorizado → verificar comportamiento → mantener o revertir.

- Desactivar no elimina datos salvo contrato explícito.

## Lista de regresión

Activar esta revisión cuando una entrega cambie la página o uno de sus contratos. Los posibles cambios descritos arriba se evalúan entonces; esta ficha no añade trabajo al piloto por sí sola.

- [ ] Desactivar no elimina datos salvo contrato explícito.
- [ ] La UI explica cuando el cambio afecta a toda la instancia.

## Páginas relacionadas

- [Ajustes de empresa](2026-10-21-ajustes-empresa.md)
- [Procesos y pipelines](2026-10-21-pipelines.md)
- [Tarjetas de estado](2026-10-21-tarjetas-estado.md)
