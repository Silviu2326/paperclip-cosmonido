# Sprint 4: mantenimiento de artefactos activos

Fecha: 2026-10-22  
Estado: modelo de decisión puro; persistencia e integración pendientes

## Alcance

El atlas de producto sitúa ofertas, marca, calendario, guion, propuesta e informe como materiales vivos vinculados a un objetivo y sus fuentes ([Atlas, `data.js`](https://cosmonido-atlas.shironecocrazy.chatgpt.site/data.js)). Este contrato representa esas clases de artefacto con objetivo, versión aceptada, versión del borrador actual y snapshots explícitos de fuente que guardan empresa, ámbito de cuenta y cliente, objetivo, evidencia y versión revisada frente a la versión actual.

`deriveActiveArtifactMaintenance` deriva una propuesta: `refresh`, `request_material`, `review` o `no_change`. Conserva en el resultado el objetivo, las versiones del artefacto y el snapshot de fuentes que motivó la decisión. No persiste ni modifica artefactos, no publica, no ejecuta agentes y no llama canales externos. Devuelve `inputKey` para que la futura capa servidor deduplique propuestas; esa clave debe derivarse de forma estable de la empresa, artefacto y revisión de entrada. No es un hash ni una garantía criptográfica.

## Reglas del modelo

- Cada artefacto y cada fuente deben pertenecer a la empresa, cuenta y cliente seleccionados. La validación rechaza cruces de empresa/cuenta/cliente y materiales que apuntan a fuentes ausentes.
- Solo una fuente declarada `explicit` y con ambas versiones conocidas permite comparar cambios. Una fuente `inferred` o `unknown` pide confirmación y evidencia. Una versión nula pide evidencia; no prueba que haya cambiado. La falta de fuentes o versiones nunca produce `no_change`.
- Si una fuente cambió y no existe borrador, se propone `refresh`. Si ya existe un borrador, se propone revisar ese borrador como obsoleto, incluso si también faltan materiales; no se crea otra propuesta de refresh.
- Una revisión pendiente produce `review`. Si las fuentes cambiaron desde el borrador, la propuesta indica que está obsoleto.
- Si no hay versión aceptada ni borrador, y las fuentes están confirmadas y versionadas, se propone la preparación inicial (`refresh`), no `no_change`.
- Los materiales pendientes se conservan en la propuesta aunque la acción sea `review`. Sus claves se validan como únicas para evitar duplicar solicitudes.
- `acceptedVersion` y `currentDraftVersion` se conservan como datos del artefacto para que el servidor pueda enlazar la revisión aceptada y el borrador actual. La función no los avanza.
- Se rechaza una revisión pendiente sin borrador y un borrador cuya versión coincide con la aceptada.

## Integración pendiente

Las claves de materiales aportadas por el servidor deben ser únicas. Se reservan
`source-evidence` y los prefijos `confirm-source:` y `version-evidence:` para las
peticiones derivadas, evitando colisiones con los materiales ya solicitados.

El servidor debe leer snapshots bajo empresa/artefacto, elegir un `inputKey` estable con la revisión actual, persistir la propuesta idempotentemente y presentar la decisión a una persona. Debe verificar que las fuentes y versiones proceden de evidencia accesible y vigente. Este módulo no decide permisos, no crea concesiones, no reserva presupuestos, no agenda trabajos y no acredita que las fuentes sean confiables.

La aceptación de una nueva versión debe conservar la versión aceptada anterior y enlazar una revisión explícita; esta función no cambia el historial ni sustituye el registro de revisión existente.

## Casos de validación futura

1. Rechazar un artefacto o una fuente de otra empresa, cuenta o cliente.
2. Rechazar materiales pedidos que mencionen una fuente fuera del snapshot.
3. Con fuente inferida, desconocida, ausente o sin versión, pedir confirmación/evidencia y nunca responder `no_change` por falta de información.
4. Con fuentes explícitas y versionadas sin cambios, devolver `no_change`.
5. Con cambios de fuente y sin borrador, proponer `refresh`.
6. Con cambios de fuente durante un borrador o revisión pendiente, proponer `review` obsoleto sin proponer refresh duplicado y conservar materiales solicitados.
7. Con `reviewPending`, proponer `review` sin publicar ni cambiar versiones.
8. Sin versión aceptada ni borrador y con fuentes versionadas, proponer preparación inicial.
9. Rechazar claves de materiales pendientes duplicadas, revisiones pendientes sin borrador y borrador con versión aceptada actual.
10. Para el mismo snapshot y `inputKey`, producir la misma propuesta para deduplicación del servidor.

Estos casos describen integración pendiente; no se han ejecutado pruebas, compilación ni typecheck.
