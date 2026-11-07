# Notificaciones y revisión explícita

Fecha: 2026-10-22. Complementa la pista J del plan maestro; el resultado de integración y las comprobaciones finales están en [el corte S95](2026-10-22-sprints-95.md).

## Qué se mantiene

Las preferencias, permisos, outbox de push y resolutores de decisiones/revisiones existentes siguen siendo la autoridad. Una notificación no concede acceso ni acepta un entregable. Las decisiones mantienen sus snapshots, efectos gobernados e idempotencia. Una revisión acepta únicamente la versión enviada; no aprueba automáticamente otras versiones.

## Qué cambia y por qué

- El enlace apunta a `/notifications/decision/:sourceId` o `/notifications/deliverable_review/:sourceId` dentro de la empresa, para abrir el elemento concreto con un botón explícito de acción.
- `NotificationAction` valida tipo e ID, consulta de nuevo la bandeja autenticada y exige encontrar ese elemento en la empresa seleccionada. Muestra estados de carga, error y elemento inaccesible o ya retirado.
- El snapshot y los datos de los resolutores usan claves de consulta que incluyen la identidad. Las lecturas del recorrido enfocado omiten el coalescing HTTP por URL y solicitan `no-store`; cambiar de usuario no puede reutilizar una respuesta pendiente de otro usuario.
- El service worker admite únicamente rutas internas de la lista cerrada, sin parámetros ni fragmentos. El push conserva contenido genérico; abrirlo solo navega.
- La UI envía `expectedRevision` al resolver entregables. El servidor comprueba la revisión y hace el cambio con CAS por `updatedAt` y `state=pending`, también frente a una actualización concurrente después de leerla.
- Antes de resolver una revisión de archivo, el servidor exige que la versión enviada exista y que el archivo no esté eliminado ni en proceso de purga. Las revisiones de documentos exigen que siga existiendo la revisión inmutable indicada. El bloqueo de la fila coordina esta comprobación con la retención.

## Comprobación y límites

La revisión de Claude Code fue de lectura: comprobó la navegación sin efectos, el aislamiento de empresa y el CAS; identificó la necesidad de particionar las cachés de los componentes hijos. El integrador aplicó esa corrección. Typecheck/build o pruebas de backend no demuestran entrega de push, instalación PWA, usabilidad móvil ni recepción de WhatsApp.

La entrega real de push requiere configuración y un navegador suscrito. WhatsApp sigue necesitando canal autorizado y consentimiento; no se muestra como enviado. El tratamiento de revisiones de work products que se vuelven obsoletas mientras están pendientes requiere una política explícita de sustitución: se bloquea su aceptación, pero no se inventa un rechazo humano ni una aceptación de la versión nueva. Las comprobaciones ejecutadas, incluidas las regresiones de disponibilidad, se registran en el documento integrador.
