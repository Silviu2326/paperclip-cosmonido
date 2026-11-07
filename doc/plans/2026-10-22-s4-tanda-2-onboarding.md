# Sprint 4, tanda 2: panel de onboarding

## Entrega

Se añade `ProductOnboardingPanel` como una superficie React consumidora de `getOnboardingProgress` y de los tipos de `packages/shared/src/productization/onboarding-journey.ts`. Presenta el camino asignado (emprendedor, agencia o comercial), confirma oferta y contexto mediante callbacks del host, muestra conexiones requeridas y hechos de instalación, activación, primer encargo y primer entregable aceptado.

El panel no crea una empresa, no inventa `accountId`/`companyId`, no persiste por sí mismo ni simula extracción, OAuth, autorización, comprobación, instalación, activación o encargos. Guardar una URL registra únicamente una fuente sugerida. Las confirmaciones humanas envían texto sin evidencia; los callbacks anfitriones deben validar alcance y devolver el estado autorizado con evidencia real. Los controles operativos se presentan como estado de solo lectura salvo el enlace delegado `onConfigureConnection`.

El componente acepta `nowISOString` del host para calcular progreso y vigencia de comprobaciones. El padre debe recargar/sincronizar la jornada devuelta con su fuente autoritativa y evitar reemplazarla luego con una instantánea anterior del mismo recorrido: la versión del contrato no es un número de revisión del estado. El cambio de empresa o jornada desmonta el formulario para no trasladar borradores entre alcances, y las respuestas tardías de una instancia desmontada no alteran otra empresa.

## Interfaz de integración

`ui/src/features/productization/onboarding/ProductOnboardingPanel.tsx` exporta `ProductOnboardingPanel` y `ProductOnboardingPanelProps`:

- `journey` y `nowISOString` son datos ya cargados por el host.
- `onConfirmBusiness({ businessName, offer })` y `onConfirmContext({ audience, desiredOutcome, constraints? })` deben devolver una jornada autoritativa o rechazar con error. No reciben evidencia del cliente.
- `onSubmitEvent(event)` recibe intenciones del contrato y debe devolver `OnboardingEventResult` producido por el dueño de persistencia/evidencia.
- `onConfigureConnection(connectionId)` debe abrir el conector ya existente bajo el alcance de empresa verificado por el host. El panel no compone URLs ni inventa rutas OAuth.
- `connectionLabels` permite pasar nombres de presentación para evitar exponer IDs técnicos; si falta un nombre, el panel usa una etiqueta genérica.
- `onBack`/`onCancel` son opcionales. El panel no avanza hitos al pulsar el footer.

Las respuestas se aplican solo si conservan `journey.id`, `accountId`, `companyId` y versión. Los refrescos del mismo recorrido actualizan datos visibles sin invalidar solicitudes pendientes. Un cambio de alcance desmonta la instancia; los errores y resultados tardíos quedan descartados. Un guardado en curso bloquea otros envíos hasta terminar. Antes del primer encargo, los cambios en oferta/contexto habilitan guardar cambios desde la acción principal; después del primer encargo se bloquea la edición para conservar la coherencia histórica.

El servicio futuro debe comprobar cuenta/empresa y permisos, tomar timestamps y referencias de evidencia en el servidor, y devolver el estado actualizado. El `reducer` del contrato compartido no constituye por sí mismo validación runtime para datos JSON.

## Semántica de progreso

Una sugerencia extraída o copiada permanece distinta de `confirmedBusinessName`/`confirmedOffer`; una URL no prueba el negocio. La conexión aparece como comprobada solo con evidencia vigente según el contrato, y la evidencia invalidada se presenta como acceso revocado o requiere actualización. Los hitos de equipo y trabajo son de solo lectura. El recorrido completado y el tiempo hasta el encargo/entregable son métricas de hechos registrados, no validación de demanda, conversión, pago o retención.

## Integración pendiente

Este cambio no monta el panel en `OnboardingWizard`, ni modifica rutas, API, almacenamiento, traducciones globales o conectores. El equipo que integre la experiencia debe:

1. Resolver o crear la jornada dentro de contexto de cuenta y empresa autorizado y mantenerla sincronizada con el servicio dueño.
2. Implementar los callbacks de confirmación e intención con persistencia y evidencia del servidor; validar runtime todos los datos recibidos.
3. Mapear cada conexión requerida a la superficie real ya existente y volver a cargar el estado tras completar/revocar acceso.
4. Conectar eventos reales de instalación, activación, inicio de encargo y aceptación de entregables; no inferirlos desde la navegación del usuario.
5. Añadir traducciones globales cuando el componente se monte dentro de la app.

## Revisión manual futura

- Probar los tres caminos con jornadas y empresas reales; verificar que el panel no permite cambiar el camino desde el cliente.
- Confirmar que una sugerencia/URL nunca aparece como oferta confirmada sin acción del usuario.
- Simular éxito, rechazo y error de cada callback: el formulario conserva borradores si falla y solo refleja datos que devuelve el host.
- Verificar que una respuesta de callback con otra jornada/cuenta/empresa/versión se rechaza y no se representa.
- Cambiar empresa durante una solicitud: la respuesta anterior no debe contaminar el formulario nuevo.
- Verificar comprobación reciente, caducada, futura, inválida y revocada; y que abrir conexión no la marca como autorizada o comprobada.
- Verificar que equipo, activación, encargo y entregable solo cambian después de recargar hechos del servicio; los tiempos usan timestamps canónicos.
- Confirmar que completar el recorrido no se presenta como pago o validación de mercado.
- Revisar teclado, lector de pantalla, diseño móvil y fila de acciones.

No se ejecutaron tests, typecheck, build ni checks por instrucción de la tanda.
