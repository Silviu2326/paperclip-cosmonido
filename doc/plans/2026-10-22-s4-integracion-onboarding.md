# Sprint 4: integración de onboarding en baseline S1

## Alcance

Esta tanda conecta el contrato de onboarding con almacenamiento propio por empresa y endpoints de board. El estado queda en `productization_onboarding`, no en `company_onboarding_seeds`, ajustes de instancia ni recursos públicos. La clave de empresa es única; cada escritura usa `expectedRevision` y una comparación CAS. En self-hosted, `accountId` es explícitamente `null`: el repositorio no tiene una entidad cuenta que se pueda usar como ámbito real.

El backend crea evidencia y timestamps. Las llamadas de browser solo pueden escoger camino, registrar una URL para revisión, confirmar oferta/contexto, elegir agentes existentes, pedir activación del equipo ya elegido y vincular un encargo existente. Ninguna petición puede enviar `Evidence`, marcar conexión comprobada, crear un encargo, iniciar heartbeat o cambiar lifecycle de agentes.

## Contrato API

Todas las rutas están bajo `/api` y requieren board auth más acceso activo a la empresa.

| Ruta | Uso |
| --- | --- |
| `GET /companies/:companyId/productization/onboarding` | Lee jornada, revisión, `serverNow`, agentes elegibles y objetivos cuyo root issue ya inició. Sin jornada devuelve 404 `onboarding_journey_not_found`. |
| `PUT /companies/:companyId/productization/onboarding` | `{ expectedRevision, path }`. Revisión `0` crea la única jornada de la empresa; una revisión actual permite cambiar camino antes de que se registren hechos. |
| `POST .../onboarding/events` | `{ expectedRevision, event }` con solo `business_suggestion_recorded`, `business_confirmed` o `context_confirmed`. Las evidencias se construyen en servidor. |
| `POST .../onboarding/team` | `{ expectedRevision, agentIds }`. Comprueba que cada ID pertenece a la empresa y está `ready` con estado utilizable antes de guardar el equipo escogido y evidencia del servidor. |
| `POST .../onboarding/activate` | `{ expectedRevision }`. Revalida exactamente los agentes escogidos y registra la activación explícita del recorrido; no altera lifecycle ni ejecuta agentes. |
| `POST .../onboarding/first-job` | `{ expectedRevision, goalId }`. Acepta únicamente un goal de la empresa cuyo root issue real tiene `startedAt` y estado iniciado después de activar el equipo. |

Todas las respuestas snapshot (GET y mutaciones) comparten `{ journey, revision, serverNow, availableAgents, availableAgentsTruncated, eligibleGoals, eligibleGoalsTruncated }`; así la UI reemplaza el snapshot completo sin mezclar candidatos de revisiones distintas. Las listas se limitan a 100 y exponen truncamiento para que la interfaz indique que existen más resultados. Los objetivos candidatos solo incluyen assignments no cancelados, creados tras activar el equipo, con root issue iniciado después de activar y asignado a uno de los agentes seleccionados. El evento de intake incluye `result: { accepted, reason? }`. Una revisión obsoleta devuelve 409 `onboarding_revision_conflict` con la revisión y jornada actuales para que el cliente recargue. Los subpath exports permiten consumir los esquemas y tipos de `packages/shared/src/productization/onboarding-api.ts` sin cambiar un barrel global.

## Evidencia y límites

- Selección de equipo no se infiere por tener agentes en la empresa. Los agentes deben ser elegidos y el servidor verifica su alcance, aprobación reflejada en lifecycle `ready` y estado utilizable (`active`/`idle`). `activate` requiere esa selección persistida y la vuelve a comprobar.
- No se requieren conectores en esta integración; `connections` empieza vacío. No se declara Gmail u otra conexión lista sin verificación real.
- Una web se guarda como URL HTTP(S) sin credenciales embebidas. No se hace fetch ni extracción. La oferta y el contexto solo se confirman mediante texto enviado expresamente por el usuario.
- El primer encargo no se elige de tareas previas por antigüedad. La persona vincula un `goalId`; el servidor exige un assignment no cancelado creado tras activar el equipo y une su root issue company-scoped, que debe estar iniciado después de la activación y asignado a un agente del equipo seleccionado.
- El primer entregable aceptado se proyecta de forma derivada y de solo lectura desde `deliverable_reviews`, si está aceptado, corresponde al mismo goal (y al mismo issue cuando la revisión lo referencia) y `reviewedAt` no antecede el inicio. La proyección no se persiste ni cambia revision al leer; la tabla de reviews conserva su registro. El tiempo se calcula desde la creación de la jornada; completar el flujo no demuestra ventas, pagos ni demanda.
- El servidor devuelve `serverNow` para vigencia y presentación. `revision` versiona el documento de jornada, no cada hecho externo de S1; el host no debe sobrescribir una respuesta nueva con una instantánea vieja de la misma jornada.

## Montaje e integración pendiente

`productizationOnboardingRoutes(db)` queda exportado y montado desde `server/src/app.ts`. La UI integrada consume los agentes y goals devueltos para elegir equipo y encargo, indica cuando una lista está truncada, reenvía `revision`, trata 409 recargando la jornada y pasa `serverNow` al panel. Las mutaciones también devuelven listas completas con el mismo límite. La ejecución del journey real y sus validaciones quedan pendientes.

La migración SQL `0363_s4_productization_onboarding.sql` y la entrada correspondiente del journal preparan la tabla. No se generó snapshot: la regla del repositorio permite migraciones SQL-only, y el generador está fuera de los límites de esta tanda. Se debe ejecutar el flujo de migración/generación y validaciones cuando la raíz autorice checks.

No se ejecutaron tests, migraciones, typecheck, build ni checks por instrucción de la tanda.
