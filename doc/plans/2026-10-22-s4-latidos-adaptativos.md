# Sprint 4: latidos adaptativos con decisión humana

Fecha: 2026-10-22. Estado: módulo puro nuevo; integración y verificación pendientes.

## Qué procede de Atlas

[Atlas](https://cosmonido-atlas.shironecocrazy.chatgpt.site/#latidos) representa construir, lanzar y operar mediante una simulación. Código pasa de siete a nueve revisiones diarias durante tres días; marketing puede pausarse; tres ciclos consecutivos no cambian la frecuencia diaria. Sus números son ilustrativos, no valores predeterminados ni resultados del producto.

El [plan maestro](2026-10-21-plan-maestro-producto.md) mantiene el alcance de autoservicio del sprint 4. Atlas añade esta propuesta de operación adaptativa. Este documento concreta el contrato preparatorio; no acredita la simulación como funcionalidad instalada.

## Qué conserva y qué añade

Se conservan el scheduler y la cola actuales, las pausas y Stop, la responsabilidad humana, el checkout de una sola persona/agente, los presupuestos y los gates de acciones externas. No se añade otro scheduler ni se modifica `heartbeat.ts`.

Se añade [adaptive-cadence.ts](../../packages/shared/src/productization/adaptive-cadence.ts) con tres operaciones de datos:

- Esquemas estrictos para política y propuesta temporal: empresa, agente, revisión de política, motivo, efecto esperado, referencias de evidencia y fechas.
- `resolveCadenceProposal` prepara una decisión humana y una política para persistir; distingue denegación por ámbito, autoridad, revisión obsoleta, plazo o límites. Nunca guarda, agenda, ejecuta ni aprueba por cuenta propia.
- `getEffectiveCadence` deriva preferencias vigentes: base, cambio temporal o pausa manual. Al caducar el cambio vuelve a la base por comparación temporal, sin depender de un proceso que recuerde revertirlo.

La frecuencia programada, la continuidad máxima y los eventos son controles distintos. Una frecuencia cero no impide eventos autorizados si siguen habilitados; una pausa manual suprime ambas preferencias. Aprobar un cambio no reanuda una pausa ni amplía presupuesto. La pausa de preferencias no confirma que un proveedor en marcha haya terminado.

Las propuestas contienen frecuencia y continuidad completas para que una revisión enseñe exactamente lo que cambia. No pueden modificar límites, presupuesto, permisos, eventos ni pausa. El servidor suministra los techos y la duración máxima; aquí no se inventan planes comerciales ni ritmos predeterminados.

El intervalo activo es `[startsAt, endsAt)`. Se decide antes de `decisionDeadline`, que debe ser anterior o igual al inicio. Solo hay un cambio temporal aprobado a la vez; se rechaza otro mientras exista uno vigente o programado. Se evita así perder silenciosamente el ritmo aprobado al programar un reemplazo futuro. Rechazar no cambia la política. Invalidar o reemplazar anticipadamente requiere un flujo explícito posterior.

## Integración en orden

1. Persistir política y propuestas por empresa/agente con estado pendiente/resuelta/revocada. Comprobar que el proponente, el objetivo y cada referencia pertenecen a ese ámbito; no confiar en IDs del modelo.
2. Usar las decisiones existentes para mostrar ritmo actual y propuesto, continuidad, motivo, efecto y duración. La identidad y `canManageCadence` se calculan en servidor desde la sesión y permisos vigentes, nunca desde el cuerpo HTTP.
3. Resolver en una transacción que reclame una propuesta todavía pendiente y compare `expectedPolicyRevision`. La pureza del módulo no evita duplicados ni carreras por sí misma; rechazo y aprobación deben tener auditoría e idempotencia.
4. Consultar preferencias desde los propietarios de scheduling/admisión existentes. Una cifra de revisiones diarias requiere distribución, zona horaria, deduplicación y cuota duradera para todos los disparadores; aún no hay traducción a `intervalSec`. No debe disparar muchos trabajos juntos para recuperar revisiones omitidas.
5. Revalidar autoridad, ámbito, presupuesto, plan, pausa/Stop, checkout y gates en admisión, despacho y cada continuación. `maxConsecutiveCycles` es un techo, no una orden de ejecutar ese número. Un evento tampoco esquiva esos controles.
6. Tratar paradas en curso con el control de ejecución existente. Mantener separados el cambio de preferencia, la cancelación solicitada y la confirmación de que el proveedor se ha detenido.

No se han editado estos puntos de integración: `server/src/services/heartbeat.ts`, `server/src/services/heartbeat/{queue,scheduling,run-control}.ts`, decisiones, rutas, DB, índices de shared ni UI. Su integración requiere coordinación al cerrar los sprints 1–3.

## Verificación pendiente

Antes de activar: probar ámbito cruzado, permiso revocado, propuesta vencida, revisión obsoleta, doble resolución, carreras con Stop, expiración y reinicio del servidor. Cubrir frecuencia cero frente a pausa, eventos, continuidad bajo presupuesto agotado y pérdida de autoridad entre admisión y despacho. Comprobar el recorrido desde la decisión hasta el scheduler real; el módulo puro no basta como aceptación.

Solo se ha revisado el código fuente. No se han ejecutado tests, typecheck, build, comprobaciones automatizadas ni agentes de producto, por instrucción del usuario.
