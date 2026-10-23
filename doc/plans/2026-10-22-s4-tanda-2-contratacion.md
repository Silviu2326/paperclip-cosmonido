# Sprint 4 — Tanda 2: contratación desde perfil portable

Esta tanda añade una base reutilizable de contratación para perfiles persistentes. No conecta todavía el panel a la navegación ni declara Sprint 4 terminado.

## Contrato y uso

- `packages/shared/src/productization/profile-hire.ts` exporta `PortableTeamMemberProfile`, `ProfileHireBuildResult` y `buildProfileHireRequest(input: unknown)`. El builder valida entrada, deriva el perfil canónico del paquete cuando se proporciona, y construye el payload contra el schema existente de contratación. `teamId` es opcional cuando los IDs de miembro son inequívocos; si hay paquete y no hay una coincidencia única de contenido perfil/equipo, falla cerrado.
- `ui/src/features/productization/hiring/index.ts` exporta `ProfileHirePanel` y `ProfileHirePanelProps`: `{ companyId, profile, teamId?, portablePackage?, onCompleted, onCancel? }`. `onCompleted` recibe la respuesta real `{ agent, approval }` de `agentsApi.hire`; `onCancel` permite al workbench volver a su catálogo.
- El padre debe pasar el paquete validado y `teamId` para una selección inequívoca, además de su `companyId` de contexto. El panel se puede montar dentro de un workbench independiente.

## Límites de autoridad

El botón envía únicamente después de una acción explícita. Se usa el endpoint de contratación existente, que mantiene sus comprobaciones actuales de acceso, permiso y aprobación. La respuesta distingue el estado real del agente y de la aprobación según la política de la empresa: esa política puede requerir aprobación o crear el agente en estado `idle`. Este panel no inicia un encargo ni altera esa política, los permisos o la configuración de credentials, ni convierte texto del paquete en instrucciones ejecutables.

Los perfiles `assignment_specialist` se bloquean con una validación visible: el lifecycle de encargos temporales aún no está implementado aquí. Propósito y criterios se muestran como contexto para revisión; no se envían como instrucciones. Un coste sugerido se presenta en unidades menores de la moneda indicada como referencia, no como presupuesto y no altera el control de presupuesto que ya tenga el agente.

Las skills instaladas solo se adjuntan si su clave/versión activa coincide con el inventario de la empresa consultada y el adaptador cargado declara soporte. Referencias no resueltas quedan visibles como pendientes. El usuario debe aceptar explícitamente omitirlas antes de enviar; el consentimiento se reinicia si cambia esa lista. No se instala ni importa contenido. Errores de inventario también se muestran y dejan las skills pendientes.

El servidor sigue siendo autoridad final sobre elegibilidad, pertenencia a empresa, permisos y aprobación. La lista de entornos se obtiene desde la API con scope de empresa (el contrato `Environment` no expone `companyId`), y el selector de responsable se limita a agentes cuyo `companyId` coincide con la empresa recibida. No se consideran estas comprobaciones del cliente una garantía de autorización.

Una respuesta tardía de una empresa/perfil anterior no se entrega al callback del workbench. Tras una respuesta confirmada, una segunda contratación requiere la acción explícita «Preparar otra contratación». Si la petición da error o se pierde su respuesta, el panel no reintenta automáticamente y bloquea reenvíos en ese formulario. No se desbloquea mediante una certificación manual del usuario. La integración debe implementar reconciliación e idempotencia duraderas para el actor board antes de habilitar una recuperación automática: el endpoint actual deduplica por ejecución de agente, y esa garantía no se aplica a una solicitud board sin `runId`. Recargar o volver a montar el componente elimina su bloqueo local y no demuestra que una contratación anterior no se completase.

## Pendiente de integración y verificación

El panel todavía no está registrado en `App`, Sidebar ni una ruta; el workbench padre decide dónde componerlo. No se ejecutaron tests, typecheck, build ni otros checks por instrucción. Antes de integración deberían verificarse: perfil persistente válido e inválido; IDs locales ambiguos con y sin `teamId`; especialista bloqueado; skills instaladas, pendientes, inventario fallido y consentimiento; IDs de manager/entorno fuera del scope visible; errores de consulta y de hire sin perder los campos; respuesta con aprobación pendiente, aprobada y nula; cambios de empresa/perfil durante una respuesta tardía.
