# S4: integración de catálogo y contratación

Esta tanda conecta el paquete portable estricto con la vista previa de portabilidad de empresa y el panel de contratación ya existente. El flujo es `PortablePackagePreviewPanel` → selección `{ portablePackage, teamId, profile }` → `ProfileHirePanel` → `agentsApi.hire(companyId, request)`. El Workbench entrega la respuesta real o reconciliada a `onHireCompleted` para actualizar agentes y estado de onboarding.

## Vista previa del catálogo

`POST /api/companies/:companyId/productization/catalog/preview` recibe el paquete validado, exige acceso a la empresa y permiso `agents:create`, y construye una fuente inline para `companyPortabilityService.previewImport`. No instala ni activa equipos, perfiles, skills o conexiones. Solo muestra equipos y perfiles `persistent`, con un máximo de 100 perfiles en el plan; el conteo omitido y el resto de incompatibilidades se reportan explícitamente. Perfiles `assignment_specialist`, solicitudes de conexión, referencias de skill no soportadas y las secciones playbooks, plantillas de encargo, presets de marca, formularios y tipos de reunión impiden declarar el paquete compatible.

La resolución de skills compara clave exacta, versión declarada del paquete del catálogo y compatibilidad Markdown. En contratación se adjunta una skill únicamente si ya está instalada en la empresa con esa clave y versión y el adaptador admite skills. Las demás quedan como requisitos pendientes, requieren confirmación explícita para enviar el alta y nunca se instalan desde este panel.

## Solicitud de contratación

`buildProfileHireRequest` valida que el perfil coincide con el paquete y `teamId` seleccionados. Produce exclusivamente el request del endpoint existente con nombre, título, rol elegido, responsable seleccionado, entorno predeterminado y skills ya instaladas que coinciden. No copia propósito, criterios, coste sugerido, instrucciones, configuración opaca, secretos, permisos ni autoridad del paquete. El coste sugerido se presenta como referencia; presupuesto y permisos continúan bajo controles existentes. El panel no contrata perfiles especialista por encargo, porque el endpoint actual crea agentes persistentes.

El endpoint actual crea o solicita la contratación de un agente bajo controles de empresa y política de aprobación. Su lifecycle puede programar preparación de configuración/host/plugins. La pantalla informa de ese efecto; la contratación no crea un encargo ni envía un heartbeat. La decisión final sigue siendo una acción humana sobre el formulario revisado.

## Respuesta incierta e idempotencia

El endpoint existente ofrece idempotencia por `runId` para solicitudes de actores agente dentro de una ejecución. Para una acción de operador humano no hay clave de idempotencia durable. El panel agrega un UUID de intento en `metadata.productizationHireAttemptId`, que el endpoint existente conserva en el agente, y guarda la referencia pendiente en `sessionStorage`. Ante error de red, bloquea el reenvío y permite consultar agentes y aprobaciones de la empresa para reconciliar una coincidencia única. Si hay cero o varias coincidencias o falla la consulta, mantiene el bloqueo.

Esta referencia permite encontrar una creación visible; no vuelve idempotente el endpoint, no evita dos POST concurrentes desde pestañas distintas y no demuestra que una solicitud sin coincidencia vaya a completarse más tarde. El `sessionStorage` cubre recargas en la misma sesión del navegador si está disponible; no es un registro de servidor. No se afirma garantía de no duplicación y no se ofrece un botón de reenvío desde el estado incierto. Una futura garantía durable requeriría soporte de clave idempotente en servidor.

## Límites de revisión

La validación estricta excluye campos declarados de permisos, credenciales y configuración ejecutable, pero no puede certificar que las cadenas descriptivas estén libres de información sensible o instrucciones. El operador debe revisar el contenido de origen y la vista previa. La resolución actual de catálogo describe el estado de las fuentes locales; no acredita por sí sola procedencia confiable del paquete ni sustituye una futura revisión de publicación.

La ruta de preview está montada en la baseline de integración y está separada de cualquier ruta de instalación. Esta integración no modifica el core de hiring, lifecycle, permisos, budgets o gates. La forma del panel de hiring es `{ companyId, profile, teamId?, portablePackage?, onCompleted(result), onCancel? }`; el catálogo añade `teamId` al perfil seleccionado porque los IDs de miembro solo son únicos dentro de un equipo.

## Revisión futura, no ejecutada

- Comprobar permisos company-scoped de preview y hiring para actor permitido y denegado.
- Verificar incompatibilidades por sección y límites de tamaño/cantidad del paquete.
- Comprobar resolución exacta de skills instaladas frente a no instaladas, versiones distintas y adaptadores sin soporte.
- Verificar que solo los campos enumerados llegan a `agentsApi.hire`, y que permisos, presupuesto sugerido, prompts y configuración del paquete no aparecen en la solicitud.
- Simular respuesta incierta, recarga de la misma sesión, una coincidencia, varias coincidencias y ausencia de coincidencia; confirmar bloqueo persistente en esos estados.
- Confirmar con el lifecycle real el efecto de preparación al crear y que el flujo no genera encargos ni heartbeats.
- Verificar que `onCompleted` refresca catálogo de agentes y estado de onboarding.

No se ejecutaron tests, builds, typechecks ni otras comprobaciones por instrucción de esta tanda.
