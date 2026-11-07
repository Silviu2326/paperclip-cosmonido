# Configuración inicial

Fecha: 2026-10-21
Identificador: ONB
Estado de superficie: Existente
Fase de ampliación: F5
Alcance: Ampliación candidata; seleccionar por piloto

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/onboarding`

Fuentes para preparar la implementación:

- [ui/src/components/OnboardingWizardVariant.tsx](../../../../ui/src/components/OnboardingWizardVariant.tsx)
- [ui/src/lib/onboarding-route.ts](../../../../ui/src/lib/onboarding-route.ts)

## Uso en los pilotos

El emprendedor prueba el recorrido actual de esta página durante F1. Sus ampliaciones comerciales pueden hacerse después del ensayo; una corrección se activa por un bloqueo observado.

## Qué mantendremos y por qué

- Continuidad del asistente y reglas de acceso según empresa y despliegue.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Pedir primero resultado, negocio y camino, permitiendo varios. | La configuración debe responder a un trabajo concreto. |
| Reutilizar equipos y conexiones necesarios para el primer resultado. | Evita exigir un organigrama completo. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Contexto mínimo, alcance, criterio de aceptación y autonomía. | Hace revisable el primer encargo. |
| Reanudar configuración y distinguir guardar de comenzar ejecución. | Reduce ejecuciones accidentales y abandono. |

## Datos y contrato de operación

Preferencias de camino y estado del asistente en empresa; referencias a contexto, equipo y tarea inicial. Guardado idempotente y reanudable.

## Ejemplo de pantalla y datos de prueba

Los valores siguientes ilustran el diseño; no son clientes, precios o resultados reales. Los campos finales se cierran con el caso seleccionado.

| Campo o bloque | Ejemplo | Regla visible |
| --- | --- | --- |
| negocio | Negocio propio seleccionado | Producto aún por concretar. |
| primer encargo | pendiente de fijar | Puede crearse con el flujo actual. |
| presupuesto | pendiente | Fijarlo antes de la ejecución. |

## Recorrido y estados

Elegir recorrido → aportar información → conectar lo imprescindible → revisar permisos y coste → iniciar cuando se solicite.

- Cerrar y volver conserva pasos completos.
- Fallo de una aplicación permite un recorrido manual o explica el bloqueo concreto.

## Tareas

Trabajo de ampliación de esta ficha, activable por el [backlog](../2026-10-21-backlog-fases.md). Su validación no bloquea el uso de la página existente.

| ID | Fase | Entregable | Depende de |
| --- | --- | --- | --- |
| ONB.01 | F5 | Definir tres primeros encargos y sus requisitos mínimos. | G01, G03, G09, G10 |
| ONB.02 | F5 | Adaptar asistente, reanudación y acción explícita de inicio. | ONB.01, G19 |
| ONB.03 | F5 | Comprobar: Los tres caminos llegan a un primer trabajo revisable sin duplicar registros al reanudar. Abrir el asistente o guardar un borrador no inicia gasto. | ONB.02 |

## Criterios de aceptación

- Los tres caminos llegan a un primer trabajo revisable sin duplicar registros al reanudar.
- Abrir el asistente o guardar un borrador no inicia gasto.

## Páginas relacionadas

- [Empresas operadoras](2026-10-21-empresas.md)
- [Catálogo e instalación de equipos](2026-10-21-equipos.md)
- [Aplicaciones](2026-10-21-apps.md)
- [Contexto del negocio](2026-10-21-contexto.md)
- [Inicio](2026-10-21-inicio.md)
