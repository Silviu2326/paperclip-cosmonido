# Sprint 4: revisión de cobertura y siguientes paquetes

Fecha: 2026-10-22. Estado: revisión de fuentes y propuesta de ejecución; no implementación de estos paquetes.

Referencias: [plan maestro, S4](2026-10-21-plan-maestro-producto.md#sprint-4-producto-que-se-vende-solo), [adelanto aislado](2026-10-22-sprint-4-adelanto.md) y [Atlas](https://cosmonido-atlas.shironecocrazy.chatgpt.site).

## Conclusión de la revisión

Hay trabajo adicional que puede prepararse sin modificar los archivos donde se cierran S1–3. El siguiente paso útil es adaptar e integrar funciones existentes en un recorrido acotado. Añadir más contratos desconectados ampliaría la integración pendiente.

Los cinco módulos de `packages/shared/src/productization/` preparan políticas, estado y validación. En la búsqueda de consumidores en server, UI y paquetes no aparecieron llamadas externas a sus funciones ni una superficie de producto que las use. No equivalen a catálogo portable instalado, onboarding operativo, mantenimiento automático, negociación de ritmos o control efectivo de cuotas.

Esta revisión se hizo con el agente principal y los tres subagentes GPT-6 Luna del adelanto. Los subagentes trabajaron en lectura: cuentas/API; catálogo/agentes/medios; onboarding/conexiones/experiencia. No ejecutaron tests, scripts, servidor, build o typecheck. No se auditaron interacciones en navegador ni el funcionamiento conjunto. El árbol puede seguir cambiando por trabajo de otros agentes.

## Base que se debe reutilizar

| Área | Evidencia en el código revisado | Qué significa para S4 |
| --- | --- | --- |
| Registro | [Auth.tsx](../../ui/src/pages/Auth.tsx), línea 60; [auth API](../../ui/src/api/auth.ts), línea 178 | Existe alta por correo. La falta de `/signup` como ruta separada no significa que haya que reconstruir autenticación. Falta enlazarla con cuenta, plan, verificación y onboarding de producto. |
| Equipos | [teams-catalog routes](../../server/src/routes/teams-catalog.ts), líneas 94 y 110; [servicio](../../server/src/services/teams-catalog.ts), líneas 841, 902 y 949 | Hay preview, importación y preparación de skills. Se necesita adaptar el paquete portable y representar resultados parciales; no crear otro instalador. |
| Contratación | [agents routes](../../server/src/routes/agents.ts), líneas 4214, 4385 y 4551 | Existe contratación gobernada y creación condicionada por aprobación. Un perfil se puede convertir en solicitud, sin activar directamente. |
| Onboarding | [OnboardingWizard](../../ui/src/components/OnboardingWizard.tsx), línea 2041; [onboarding-seed](../../server/src/services/onboarding-seed.ts), línea 238 | La base crea empresa y tarea inicial. Falta componer los tres caminos con oferta confirmada, conexiones, equipo y encargo real. |
| Conexiones | [ConnectionSetupFlow](../../ui/src/features/connections/ConnectionSetupFlow.tsx), línea 885; [ai-connections routes](../../server/src/routes/ai-connections.ts), línea 190 | Hay flujos de configuración y comprobación. S4 necesita orquestarlos y derivar disponibilidad real, sin otro OAuth. |
| Versiones y revisión | [company-files routes](../../server/src/routes/company-files.ts), línea 316; [deliverable-reviews](../../server/src/routes/deliverable-reviews.ts), línea 26 | Existen versiones y aceptación interna. Mantenimiento automático y acceso de cliente requieren otra integración, conservando esas fuentes. |
| Idiomas | [locales](../../ui/src/i18n/locales.ts), línea 5; [i18n](../../ui/src/i18n/index.ts), línea 6 | Hay ES/EN y portugués de Brasil/Portugal. El punto pendiente observado es selección y persistencia de idioma; no empezar duplicando traducciones. La cobertura completa no se verificó. |
| Móvil | [MobileBottomNav](../../ui/src/components/MobileBottomNav.tsx), línea 45; [manifest](../../ui/public/site.webmanifest), línea 8 | Existe navegación móvil; el manifiesto declara `browser`. No se encontró un recorrido de suscripción push de producto en las ubicaciones revisadas. Eso no acredita la PWA y las decisiones móviles del plan. |
| Medios | [media-studio](../../packages/media-studio/src/index.ts); [media service](../../server/src/services/media-studio.ts); [schema](../../packages/db/src/schema/media_studio.ts) | Hay operaciones y trabajos. Falta componer plantillas, presets y producción híbrida; cuota/prioridad/duración y coste por minuto requieren acordar el contrato final de medios S3. |
| Acceso | [memberships](../../packages/db/src/schema/company_memberships.ts), línea 4; [access routes](../../server/src/routes/access.ts), línea 4488 | Ya hay membresías y permisos. Cuenta de facturación y rol comercial deben componerse con esos permisos; no reemplazarlos. |
| API y entrega de eventos | [OpenAPI](../../server/src/routes/openapi.ts); [MCP event webhooks](../../server/src/services/public-mcp/event-webhooks.ts), línea 13 | Hay especificación y transporte firmado con protección de destinos. No son todavía una API comercial versionada ni suscripciones a eventos de negocio. |

La existencia de estos archivos demuestra una base de implementación; no demuestra que sus recorridos hayan pasado aceptación.

## Siguiente trabajo útil, con límites concretos

### P0. Paquete portable → vista previa del catálogo actual

**Resultado:** escoger un paquete, resolver sus referencias/versiones, ver qué se crearía y qué no es compatible, y decidir si continuar. Primer corte recomendado: equipo, perfiles y referencias de skills del subconjunto admitido.

Preparar un servicio nuevo, por ejemplo `server/src/services/productization/portable-package-preview.ts`, que consuma el contrato existente y se adapte al preview/importador de equipos. Añadir modelos de presentación y componentes nuevos bajo una carpeta propia de S4. La ruta y la pantalla actuales se conectan cuando su propietario esté disponible.

Tareas:

1. Resolver referencias fijando versión y procedencia; no seguir instrucciones de texto como configuración ejecutable.
2. Transformar solo el subconjunto que soporte el importador. Devolver incompatibilidades explícitas para formularios, tipos de reunión, presets o playbooks que aún no tengan adaptador; nunca descartarlos silenciosamente ni decir que están instalados.
3. Mostrar diferencias, requisitos pendientes, coste sugerido y permisos que la persona deberá conceder aparte.
4. Conservar preview separado de instalación. Al instalar, revalidar referencias, ámbito y permisos; la revisión previa no garantiza que nada haya cambiado.
5. Representar instalación parcial, avisos de skills y reanudación/idempotencia. El servicio actual prepara skills después de importar el equipo; un fallo en ese tramo no debe presentarse como instalación completa ni repetirse creando agentes duplicados.

**Puede adelantarse ahora:** adaptador y presentación en archivos propios. **Requiere coordinación:** consumidor de ruta/UI, persistencia y aplicación real. No se propone activar instalaciones durante esta revisión.

### P0. Perfil seleccionado → solicitud de contratación

**Resultado:** una persona elige un perfil, responsable y entorno/adaptador; revisa una propuesta y la envía al flujo de contratación/aprobación existente.

Preparar un servicio nuevo que traduzca datos permitidos del perfil al contrato de contratación. No escribir configuración de adaptador opaca desde texto, no copiar credenciales y no activar el agente por haber importado el perfil. Reutilizar roles y catálogo existentes.

El primer corte puede cubrir perfiles persistentes. El perfil `assignment_specialist` ya distingue una intención en el formato, pero **todavía no implementa un especialista temporal**: necesita encargo propietario, coste/tiempo, entrega, expiración y cierre bajo el checkout de una sola asignación. Esa parte toca ejecución y debe esperar coordinación con S1–3.

El creador libre por descripción añade después la generación de la propuesta acotada. Un sandbox técnico, un chequeo de credenciales o un test de una skill no equivalen a un entorno de prueba de agente sin efectos externos. Ese entorno exige un límite real a herramientas, conexiones, gasto y cancelación.

### P0. Onboarding por camino con conexiones comprobadas

**Resultado:** elegir emprendedor/agencia/comercial, confirmar negocio/oferta, completar contexto mínimo, resolver conexiones necesarias, instalar equipo, activar explícitamente y llegar al primer encargo. Reanudar no duplica esos efectos.

Reutilizar el contrato del adelanto y los servicios actuales. Preparar paneles nuevos para oferta inferida frente a confirmada, materiales faltantes y lista de conexiones con estado y evidencia. Una conexión autorizada no implica que la comprobación sea vigente ni que una herramienta concreta sea utilizable.

El servidor debe persistir el recorrido, atribuir hechos a servicios reales y conservar las marcas del primer encargo/aceptación aunque una conexión se revoque después. El paso almacenado no concede permisos. La importación inicial de contactos requiere el contrato CRM y deduplicación; no convertirla en requisito de un emprendedor que no necesita clientes.

**Puede adelantarse ahora:** paneles, adaptadores de presentación y composición propuesta del recorrido. **Requiere coordinación:** asistente actual, persistencia, conexiones e instalación/creación del encargo. No crear otro asistente sin acordar cuál será el punto de entrada definitivo.

### P1. Plantillas de producción y presets de marca

**Resultado:** briefs concretos para clips, demo, testimonio, tutorial y anuncio; cada plantilla declara entrada, materiales obligatorios, guion/escenas, formato, criterios de aceptación y operaciones admitidas.

Preparar contenido y adaptadores nuevos que traduzcan esos briefs a las operaciones ya disponibles. Un preset debe identificar fuente, colores, voz y recursos autorizados; una música indicada no acredita licencia. Las capacidades que dependan de proveedor o conexión aparecen como requisito, no como servicio disponible.

No modificar ahora `packages/media-studio/src/index.ts`, el runner ni `server/src/services/media-studio.ts`. La prioridad de cola, reserva de minutos y coste por minuto se conectan al contrato de medios S3. El denominador debe ser duración producida comprobada, con cobertura del coste; contar trabajos no mide minutos ni convierte un coste desconocido en cero.

### P1. Métricas de resultado e idioma elegible

Son dos paquetes independientes, no una nueva infraestructura transversal:

- **Resultados:** adaptadores de lectura sobre encargos, aceptación y costes existentes; emprendedor: tiempo/coste hasta resultado aceptado; agencia: puntualidad y rondas de revisión por encargo; comercial: respuesta, reuniones, propuestas y ganadas. Cada dato indica fuente, periodo, cobertura y moneda. Mostrar ausencia de datos, no ceros inventados. La comparación entre periodos necesita la misma definición y cobertura.
- **Idioma:** selector y preferencia persistida que use los recursos existentes, con decisión explícita entre variantes de portugués. Reutilizar traducciones, respetar idioma del contacto en sus superficies y no cambiar globalmente el idioma de todos por cambiar el de un usuario.

**Puede adelantarse ahora:** adaptadores de resultados y componentes de presentación nuevos; selector aislado. **Requiere coordinación:** consumir hechos finales S1–3, Inicio, configuración i18n y perfil. No son métricas verificadas ni cambios visibles hasta integrar.

## Fundamentos que deben avanzar en paralelo, con un dueño de integración

### Cuenta, plan y consumo

Faltan el titular del producto, relación con empresas, planes comerciales, medidores y facturas de la cuenta. Las [suscripciones IA](../../packages/db/src/schema/ai_subscriptions.ts) son otro dominio. Las [facturas actuales](../../packages/db/src/schema/accounting.ts), línea 75, importan costes de proveedores. No deben reinterpretarse como suscripción o factura de Cosmonido al usuario.

Antes de activar el `plan-gate` se necesita lectura de cuenta/plan y **reserva atómica e idempotente de capacidad/consumo**, confirmación/liberación y reconciliación. Las [reservas de presupuesto](../../packages/db/src/schema/accounting.ts), línea 52, sirven de referencia, pero su unidad es dinero por ejecución y no cuota comercial por cuenta. El gate de lectura adelantado por sí solo no evita que dos solicitudes consuman el último cupo.

Se pueden preparar el diseño de persistencia y servicios en archivos propios. Cambios a schema/exportaciones/migraciones y activación en creación de agentes/encargos/conexiones/medios/envíos requieren coordinar un único integrador. Precios, descuentos y promesas de servicio no se inventan para rellenar pantallas.

### Identidad de API pública y eventos

Las [board_api_keys](../../packages/db/src/schema/board_api_keys.ts), línea 4, pertenecen al usuario y no persisten una frontera de empresa/alcances. Las claves de agente son identidad de agente. Ninguna debe publicitarse automáticamente como clave comercial por empresa.

Definir un primer conjunto pequeño de recursos `/api/v1`, claves de empresa con alcances efectivos, caducidad/revocación y OpenAPI consistente. Preparar adaptación a los servicios finales S1–3; no abrir un alias de todas las rutas internas ni heredar la autoridad completa de board.

Para webhooks, preparar los cuatro hechos del plan: lead creado, propuesta aceptada, entregable aceptado y conversación nueva. Reutilizar piezas de transporte/firma del servicio MCP cuando sean compatibles. El modelo de suscripción comercial y sus productores necesitan ámbito, versión, idempotencia, entrega durable/reintentos y revocación propios. Una fila de actividad genérica no demuestra que se haya confirmado el hecho de negocio.

### Aclaración de agencia y cliente

Un cliente CRM dentro de una empresa no equivale a una empresa operadora nueva. La agencia que entrega servicios a varios clientes puede mantenerlos en su empresa; la agencia implantadora de S4 gestiona instalaciones/empresas cliente bajo una cuenta. Pagar o pertenecer a la cuenta no concede lectura de todas las empresas. La autorización sigue usando membresías y permisos de cada empresa; las conexiones conservan su propietario autorizado.

## Qué conviene posponer mientras se cierran S1–3

| Trabajo | Motivo concreto |
| --- | --- |
| Conectar cadencias y especialistas al motor | Modifica scheduling, continuidad, checkout, presupuesto y decisiones que están estabilizándose. El contrato adelantado no es permiso de ejecución. |
| Automatizar mantenimiento/publicación de artefactos | Depende de versiones, audiencia/cliente, aceptación y eventos finales. Empezar después por una clase de material, por ejemplo oferta, conservando revisión humana. |
| Portal público completo | La revisión interna exige acceso de empresa/board. Falta el límite de acceso de contacto, token/cuenta ligera, caducidad/revocación y superficies públicas S2–3; no exponer la vista interna con un enlace. |
| Push y decisiones remotas completas | Requieren suscripción/autorización, entrega y resolución de una decisión real. Cambiar el manifiesto no completa el recorrido. |
| SaaS alojado completo, marketplace pagado y marca blanca total | El alojamiento es ambición condicionada en S4; el marketplace pagado y marca blanca total pertenecen a apuestas posteriores. No desplazar con ellos el primer resultado y el cobro básico. |

## Orden propuesto y reparto posible

1. **Primera tanda paralela:** adaptador portable→preview; perfil→solicitud de contratación; paneles de onboarding/conexiones. Cada responsable trabaja en archivos nuevos y acuerda sus contratos con quien posee las rutas actuales.
2. **En paralelo, un integrador de fundamentos:** cerrar cuenta/empresa/plan y reservas; definir identidad y superficie mínima de API pública. No repartir migraciones e índices entre varios agentes.
3. **Segunda tanda:** briefs/presets de medios, adaptadores de métricas e idioma. Son piezas separables, pero su integración usa los contratos ya estabilizados.
4. **Cuando se liberen las superficies de S1–3:** conectar el primer recorrido catálogo→preview→contratación/equipo→onboarding→encargo, con resultados parciales y errores accionables. Después, acceso externo, continuidad y notificaciones.

El primer recorrido reduce una incertidumbre concreta: si una persona puede convertir un paquete en trabajo inicial con controles y evidencia. No sustituye el resto del S4 ni acredita disposición a pagar. Peluguau y los tres pilotos externos siguen siendo aceptación pendiente.

Esta entrega añade únicamente este documento de revisión. No se implementaron las tareas propuestas, no se modificaron archivos de los otros sprints y no se ejecutaron verificaciones ni acciones de publicación/Git.
