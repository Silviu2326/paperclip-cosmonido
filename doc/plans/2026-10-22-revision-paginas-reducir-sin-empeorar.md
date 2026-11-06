# Revisión de páginas: reducir superficies sin empeorar las existentes

Fecha: 2026-10-22. Estado: propuesta de producto tras revisión de código, no implementación.

Revisión con tres subagentes GPT-6 Luna: ajustes/cuentas, trabajo/equipo/archivos y CRM/páginas públicas. Fuente revisada: checkout `paperclip-int`, rama `integracion`; referencia anterior: `paperclip/tmp/ux-implementation-20261022/before`. El código de esta integración sigue siendo local. No se inspeccionó una sesión de producción ni se ejecutaron pruebas en esta revisión.

Este documento corrige las decisiones de presentación del [plan anterior](2026-10-22-plan-ux-conservar-y-simplificar.md). Sus requisitos de privacidad, compatibilidad, idempotencia, revisión y presupuesto siguen vigentes. La [implementación anterior](2026-10-22-implementacion-ux-simplificada.md) registra trabajo realizado; no demuestra que la organización resultante sea cómoda.

## 1. Conclusión y decisiones

La primera reorganización redujo enlaces de la sidebar principal, pero conservó prácticamente todas las pantallas. En Ajustes añadió una lista secundaria de 11 destinos al menú existente. Eso trasladó complejidad y no basta para considerar el producto simplificado.

Hay cinco candidatas concretas a perder su condición de página independiente:

| Página | Destino existente que debe asumir su trabajo | Qué falta antes de retirarla |
| --- | --- | --- |
| Idioma (`LanguageSettings`) | Perfil del usuario (`ProfileSettings`), como selector pequeño. | Extraer control y sincronización sin perder errores, carga de idioma ni aislamiento al cambiar de usuario. |
| Navegación (`NavigationPreferences`) | Preferencias del perfil, desplegable pequeño «Accesos para esta empresa». | Mantener la clave usuario + empresa + navegador, guardado inmediato y errores. No convertir tres toggles en un editor de menús. |
| Eliminar cuenta comercial (`SecuritySettings`, modalidad account) | Cuenta comercial concreta en `ProductAccounts`, acción contextual de zona de peligro. | Identificar cuenta y dueño; conservar confirmación, estado, plazo de cancelación y cancelación de solicitud. |
| Contexto (`Context`) | Explorador de Archivos, con propiedades y filtros de contexto. | Incorporar rol, audiencia, proyecto autorizado, caducidad y consulta de expirados; hoy faltan controles en el explorador. |
| Resultados independientes (`OutcomeMetrics`, modalidad standalone) | Informe ya embebido en Inicio (`BusinessHome`). | Abrir el bloque desde URL y conservar camino/periodo. La página antigua arranca en emprendedor/30 días; Inicio usa el camino guardado. |

Son cinco retiradas propuestas, no cinco páginas ya eliminadas. Las primeras tres requieren menos integración; las dos últimas exigen trasladar controles o navegación de estado antes de retirar nada.

La ampliación global añade una **sexta candidata: el listado independiente de Aprobaciones**, si la bandeja asume pendientes, histórico y filtros sin perder capacidad. El detalle de cada aprobación se conserva. La revisión global, sidebar y páginas técnicas/públicas están en las secciones 6 y 6A; el [apéndice de rutas](2026-10-22-inventario-global-paginas.md) permite recorrer el router completo.

No se recomienda eliminar Retención por ahora: es una operación destructiva con previsualización y confirmación propias. Tampoco eliminar pantallas de negocio con tareas diferentes sólo para alcanzar una cifra. Reducir una página a un modal gigante o llenar General con todos los formularios tampoco es una mejora.

## 2. Qué está mal en Ajustes, exactamente

1. `BusinessSettingsLinks` añade **11 enlaces: 4 + 3 + 4**, no 13. Se suman a los ajustes originales y a entradas condicionadas por flags, plugins y despliegue. El problema es la cantidad y el alcance mezclado, no sólo los títulos de los grupos.
2. El perfil modifica al usuario autenticado, pero está montado bajo `/company/settings/instance/profile`. El nombre de la ruta no describe al titular de los datos.
3. Entornos y Acceso de instancia son operaciones de infraestructura/administración; no son preferencias de la empresa ni del usuario corriente.
4. La versión antigua de la sidebar incluye entradas legacy como invitaciones y heartbeats que la nueva no presenta igual. No hay un inventario único coherente de qué se muestra en cada variante.
5. En móvil se usa `CompanySettingsNav`: su lista conoce los destinos antiguos y no los nuevos. `getCompanySettingsTab` devuelve General como fallback. Una página nueva puede estar seleccionada de forma engañosa como General; no basta con revisar el menú de escritorio.
6. `SettingsScopeHeader` añade una caja con explicación, badge, volver y enlaces relacionados en varias páginas. Aclara algunos alcances, pero también ocupa espacio y repite navegación. No sustituye una buena composición del formulario.
7. `DailyBriefPreferences` se renderiza tanto en Perfil como en Inicio. Es el mismo editor en dos destinos. Inicio debería mostrar el resumen y un acceso a configurarlo; la edición debe tener un solo hogar.

Evidencia principal: `ui/src/components/BusinessSettingsLinks.tsx:7`, `CompanySettingsSidebar.tsx:119`, `CompanySettingsSidebar.production.tsx:115`, `components/access/CompanySettingsNav.tsx:10`, `:97`, `components/Layout.tsx:670`, `pages/ProfileSettings.tsx:24`, `:276`, `features/productization/BusinessHome.tsx:60`.

### Una composición concreta, sin inventar otra página contenedora

- **Mi perfil existente:** nombre/avatar, idioma y preferencias personales. El desplegable de accesos señala explícitamente la empresa y navegador a los que afecta. Idioma y navegación dejan de ser destinos de menú.
- **Notificaciones existentes:** avisos personales para la empresa seleccionada y configuración del resumen diario. No es la política de notificaciones de todos los miembros de la empresa. Inicio enlaza al editor, no lo vuelve a montar.
- **Seguridad de acceso existente:** 2FA y sesiones del usuario. Conserva pantalla propia por su interacción y recuperación de credenciales.
- **Ajustes de empresa originales:** General, miembros, secretos, datos/retención y API. Conservar formularios originales; las operaciones técnicas extensas no se incrustan todas en General.
- **Cuenta comercial existente:** cuentas y su facturación. Eliminar una cuenta se hace desde la cuenta identificada, no desde un destino genérico de seguridad.
- **Administración de instancia existente:** acceso administrativo, entornos, plugins, adaptadores y opciones experimentales. Se muestra a quien administra la instalación, con los permisos efectivos actuales.
- **Apps existente:** conexiones y configuración de canales, webchat y CRM. No aparece una segunda copia del mismo formulario en Ajustes.

Estos son hogares de controles ya existentes, no una propuesta de siete nuevos dashboards. En cada contexto debe haber una sola navegación, adaptada a escritorio/móvil. No reemplazar los 11 enlaces con 11 tarjetas.

### Precisión de los alcances

`ProfileSettings` sí es perfil de usuario. `InboxAgentPolicyControl` regula qué agentes pueden ordenar **mi** bandeja y usa endpoints per-user; no debe moverse a General como política global. `DailyBriefPreferences` también se persiste por usuario y empresa (`server/src/routes/daily-brief.ts:13–42`). Su dependencia de empresa no lo convierte en ajuste compartido por toda la compañía. Si se mueve a Notificaciones, se mantiene esa titularidad. El almacenamiento del avatar usa una empresa seleccionada en el flujo actual; esa dependencia no se elimina cambiando el título de Perfil.

## 3. Ajustes: revisión página por página

| Página / superficie | Decisión | Qué hacer y por qué |
| --- | --- | --- |
| General de empresa | Conservar | Identidad, apariencia y controles existentes. No usarla para alojar todos los módulos nuevos. |
| Perfil | Conservar y limpiar | Reutilizar su formulario de usuario; absorber Idioma y accesos pequeños. Corregir ubicación personal sin crear otro perfil. |
| Idioma | Retirar pantalla | Un selector no justifica una página. Mantener el cargador, las preferencias y el control de cambio de cuenta. El selector actual ofrece cuatro opciones aunque existan más diccionarios; no confundir ambas cosas. |
| Navegación | Retirar pantalla | Tres toggles y enlaces repetidos. Absorber controles en preferencias del perfil, con alcance empresa/navegador visible. |
| Notificaciones: preferencias | Conservar | Tiene categorías, navegador, push y dispositivos. Incorporar el editor de resumen diario; diferenciarlo de los avisos pendientes. |
| Avisos: listado | Conservar dentro de Bandeja | No es configuración. Abrir el origen para actuar; no crear otra bandeja de aprobación. No se declara redundante con leer o resolver el trabajo. |
| Seguridad: acceso y sesiones | Conservar | 2FA, códigos de recuperación y revocación de sesiones tienen un flujo propio y sensible. |
| Retención de datos | Conservar por ahora | Previsualiza registros y confirma políticas de purga/redacción. Su parecido visual a un formulario no implica duplicación con seguridad de acceso. |
| Eliminación de cuenta comercial | Retirar pantalla | Acción de la cuenta seleccionada en ProductAccounts. No trasladarla a seguridad del usuario ni a borrado de empresa. |
| Cuentas comerciales | Conservar | Gestiona titularidad, empresas vinculadas y miembros de la cuenta. No son clientes del CRM. |
| Facturación de Paperclip | Conservar | Plan, facturas y proveedor de pago; no duplica el consumo de agentes. Puede reutilizar el contexto de cuenta sin repetir selectores en cada bloque. |
| API y webhooks | Conservar | Crear/revocar credenciales y administrar entregas requiere más que un ajuste simple. Mantener junto a empresa/desarrolladores. |
| Miembros | Conservar | Roles e invitaciones de la empresa. No añadir un segundo administrador de las mismas invitaciones. |
| Invitaciones separadas | Mantener sólo compatibilidad | Ya tienen destino en Miembros; quitar entradas legacy divergentes cuando ambos layouts cubran el recorrido. No contar como nueva retirada una absorción ya hecha. |
| Secretos | Conservar | Gestión de credenciales con permisos propios. No fusionar visualmente con API keys públicas ni con credenciales de usuario. |
| Conexiones de respuestas rápidas | Conservar si el flag aplica | No equivale automáticamente a canales CRM ni a todas las Apps; verificar proveedor y audiencia antes de fusionar. |
| Entornos | Conservar para administrador | Es alcance de instancia/runtime. No anunciarlo como ajuste de la empresa corriente. |
| Acceso de instancia | Conservar para administrador | Gestiona usuarios, rol de administrador y acceso a varias empresas. No duplicarlo con Miembros. |
| Exportar | Conservar herramienta | Flujo de portabilidad con opciones y datos; no es un ajuste cotidiano. |
| Importar | Conservar herramienta | Asistente con validación y efectos propios; respetar que cloud puede bloquearlo. |
| Plugins y detalle | Conservar para administrador | Extensiones y configuración aportada por plugins. Mantener sus slots y permisos. |
| Adaptadores | Conservar para administrador | Operación técnica distinta de contratar un agente. No ponerla en el camino inicial del usuario de negocio. |
| Opciones experimentales / heartbeats legacy | Conservar en administración aplicable | No son producto comercial. Resolver diferencias de navegación entre layouts sin activar funciones para llenar menús. |
| Canales de clientes | Conservar en Apps | Provisiona/configura canales; no mezclar con conversación con agentes. |
| Chat web | Conservar en Apps | Configura instalación e identidad del widget. La conversación cotidiana se atiende en Conversaciones. |
| Sincronización CRM | Conservar en Apps | Configuración, sincronización y conflictos; no es otro editor de clientes. |
| Instalaciones gestionadas | Apartar del producto inicial general | Crea/administra empresas Paperclip para terceros. No es necesario para una agencia que presta servicios desde Clientes y Proyectos. Conservar si existe ese caso de venta; no seguir ampliándolo por inercia. |

## 4. Trabajo, archivos y equipo: revisión página por página

| Página / superficie | Decisión | Qué hacer y por qué |
| --- | --- | --- |
| Inicio / Dashboard | Conservar | Panorama operativo. Quitar de aquí formularios de configuración repetidos, no añadir otra página de Inicio para cada piloto. |
| BusinessHome | Conservar como bloque, simplificar | Mostrar resultados y preparación pendiente; enlazar a configurar. No otro catálogo de módulos dentro del dashboard. |
| Resultados independientes | Retirar pantalla después de integración de URL | El mismo OutcomeMetrics está embebido en BusinessHome con los mismos selectores de camino y 7/30/90 días. Abrir/seleccionar desde URL antes del alias. |
| DashboardLive | Conservar como diagnóstico técnico | Su utilidad es operación en vivo. No es un segundo Inicio para el cliente de negocio ni candidato demostrado a eliminación funcional. |
| Tareas | Conservar | Entrada al trabajo. Evitar columnas, paneles y filtros comerciales obligatorios para una tarea interna. |
| Detalle de tarea | Conservar | Conversación, ejecución, archivos y resultado en el original. El resultado ocupa un desplegable, no varias tarjetas administrativas permanentes. |
| Encargos | Ya absorbida | Las rutas ya redirigen a Tareas. Limpiar código de compatibilidad no equivale a retirar una pantalla que siga existiendo. Conservar el contrato backend. |
| Bandeja | Conservar bajo su flag | No eliminar pendientes propios ni participación por unificar etiquetas con Tareas. |
| Proyectos | Conservar | Agrupación útil y opcional; no obligar a crear un proyecto antes de trabajar. |
| Detalle de proyecto | Conservar | Tareas, configuración y workspaces. Cliente opcional; no crear una segunda ficha comercial del proyecto. |
| Archivos / explorador | Conservar y absorber Contexto | Reutilizar navegación, carga, versiones y vista previa ya existentes. |
| Contexto | Retirar pantalla al completar metadatos | Usa CompanyFile, igual que el explorador. Añadir rol, audiencia, caducidad y filtros en los editores existentes antes de borrar su formulario. No crear otro almacén. |
| Plantillas de vídeo / Crear vídeo | Conservar flujo | Presets, operaciones, formato, marca y coste aportan decisiones distintas de ver un archivo. |
| Estado de producción repetido | Unificar componente | Templates y MediaProjectPanel repiten polling/estado y transcripción. Un solo componente operacional que admita preset; no eliminar parámetros del render para reutilizarlo. |
| Cola de medios | Conservar vista operativa | Prioridad, fallos, reintentos y trabajos globales no se resuelven sólo con el estado de un vídeo. Su ubicación en Producción ya es secundaria. |
| Agentes | Conservar | Roster, búsqueda, creación y vista de organigrama; reutilizar el original. |
| Ficha de agente | Conservar | Instrucciones, configuración, actividad, ejecución y permisos. No duplicar un editor de agente en el constructor de negocio. |
| Organigrama | Ya absorbido en layout nuevo; compatibilidad antigua | Agents tiene vista org; `/org` redirige en streamlined. No contar como nueva reducción ni borrar el renderer que use el otro layout antes de cubrirlo. |
| Oficina | Opcional | Visualización distinta, no administrador duplicado. No añadir controles para convertirla en otro panel de gestión. Prioridad baja frente al trabajo real. |
| Rutinas | Conservar | Horarios, disparadores, revisiones y ejecuciones; no es sólo una lista de pasos. |
| Procedimientos / Playbooks | Conservar | Secuencias versionadas con publicación y avance/pausa de ejecuciones. No son el mismo modelo ni acciones de Rutinas. |
| Autonomía | Conservar | Gobernanza, evaluación y revocación. En la ficha del agente basta un resumen y enlace; no clonar el editor completo. |
| Puesta en marcha | Conservar recorrido | Ayuda a preparar negocio/equipo/primer resultado. No debe ser requisito periódico ni dashboard paralelo. |
| Constructor avanzado | Candidato condicionado a retirar editor independiente | Concentra borradores/versiones, extracción web y pruebas de autonomía. Separar esas responsabilidades: configuración en el recorrido/editores originales, pruebas en Autonomía y Apps. No borrarlo hasta trasladar las acciones y lectura de versiones que se usen. |
| Catálogo privado | Conservar sólo donde aporta plantillas reutilizables | No confundir biblioteca/versiones con selección inicial de equipo. Reducir accesos y selectores duplicados; no borrar formatos instalables. |
| Catálogo compartido / marketplace | Fuera del recorrido inicial, validar su producto | Publicación, valoraciones y moderación son un producto adicional. No llamarlo inútil por no ser diario, ni invertir en él antes de validar el negocio principal. |
| Habilidades | Conservar | Capacidad distinta de equipo instalado y de plantillas de agentes; mantener descubrimiento y administración existentes. |

### Requisitos concretos para las dos absorciones de trabajo

**Archivos:** `Context` utiliza `companyFilesApi.upload/update` y campos `contextRole`, `audienceKind`, `audienceId`, `validUntil`. El explorador aún no ofrece todos esos controles en carga/edición. Deben aparecer como propiedades progresivas y filtros, sin convertir cada subida en un formulario obligatorio de contexto. Conservar expirados, indicador de truncado, búsqueda, versiones y proyecto autorizado. Las URLs de Contexto abren el explorador con filtro; los endpoints de contexto para agentes se mantienen.

**Resultados:** conservar el componente y sus dos selectores. Primero leer/escribir `path` y `days` en la URL y permitir abrir el bloque de Inicio. El alias antiguo mantiene emprendedor/30 días cuando no hay parámetros explícitos; no sustituirlo silenciosamente por el camino guardado ni dejar el informe dentro de un bloque cerrado sin indicación.

## 5. Clientes y ventas: revisión página por página

| Página / superficie | Decisión | Qué hacer y por qué |
| --- | --- | --- |
| Clientes | Conservar | Cuenta/persona para quien se trabaja; búsqueda, alta y archivo propios. |
| Ficha de cliente | Conservar, evitar crecer en pestañas | Mostrar primero trabajo, relación y próxima acción. Propuestas/servicios y enlaces públicos deben usar sus componentes existentes, no nuevos editores repetidos. |
| Contactos | Conservar directorio secundario | Personas con identidad y posibles relaciones con clientes. Un contacto sin cliente sigue siendo válido. |
| Importar contactos | Conservar asistente como acción | Mapeo, previsualización y deduplicación justifican una herramienta de varios pasos. No sustituirla por pegar CSV en un formulario pequeño. |
| Leads | Conservar | Entrada por cualificar. Corregir la conversión rápida y la de detalle para que no ofrezcan resultados distintos sin explicación. |
| Detalle de lead | Conservar | Contexto, historial y cualificación. No exigir pasar por detalle cuando una decisión rápida está resuelta. |
| Oportunidades | Conservar | Pipeline comercial, responsable, etapa y previsión. No es otra ficha de la persona; representa una venta potencial. |
| Propuestas | Conservar colección | Seguimiento de ofertas y estados entre clientes. En cliente, mostrar el mismo listado filtrado, no volver a implementarlo. |
| Detalle de propuesta | Conservar | Documento, versiones y aceptación. No fusionarlo con un servicio activo. |
| Servicios recurrentes | Conservar cartera secundaria | Control global de periodos y próximos vencimientos. En cliente se reutiliza la lista filtrada. Eliminarla obligaría a abrir cada cliente para supervisar la cartera. |
| Detalle de servicio | Conservar | Periodos, renovación y trabajo generado. Es una responsabilidad posterior a una propuesta aceptada. |
| Formularios de leads | Conservar configuración secundaria | Captación pública de nuevas solicitudes. No duplica importación de contactos ni la bandeja de leads. |
| Conversaciones | Conservar | Bandeja de hilos externos. No sustituye al directorio de clientes ni al chat con agentes. |
| Detalle de conversación | Conservar | Leer, responder y seguir el hilo. Evitar clonar todo el CRM en su lateral. |
| Llamadas | Conservar operación del canal | Llamadas/callbacks y vínculo a contacto no se resuelven con una agenda. No convertir su configuración de proveedor en otra página de Apps duplicada. |
| Agenda | Conservar | Reuniones, cancelaciones y tipos de reserva. Configurar tipos es secundario; consultar reuniones es operación cotidiana. |
| Configuración de portal | Ya contextual en cliente | Administrar enlaces y permisos desde ese cliente. No contar un componente embebido como otra página a eliminar. |
| Portal público | Conservar | Experiencia externa con permisos limitados. Nunca redirigirlo a la ficha interna del cliente. |
| Revisión pública de entregable | Conservar | Decisión sobre una versión concreta. No es el mismo recurso ni la misma autorización que el portal general. |
| Reserva pública | Conservar | Acción externa con disponibilidad y confirmación; no equivale a la agenda interna. |
| Precios / compra | Conservar sujeto al modelo de venta | No forma parte del CRM interno ni prueba que el proveedor de pagos esté configurado. |
| Login / registro / invitación | Conservar | Entradas y autorización del producto. No mezclarlas con preferencias ni convertirlas en un wizard de negocio obligatorio. |

No se ha encontrado justificación suficiente para borrar las capacidades CRM completas. Su backend existe en código; esta revisión no demuestra que proveedores, llamadas o pagos estén configurados y validados en producción. La simplificación aquí pasa por una sola edición de cada dato y acciones contextuales, no por eliminar etapas comerciales diferentes.

## 6. Revisión global: trabajo avanzado, infraestructura y entradas públicas

Ampliación solicitada: los mismos tres subagentes GPT-6 Luna revisaron también estas familias y la navegación global. El [inventario completo de declaraciones de rutas](2026-10-22-inventario-global-paginas.md) permite contrastar cada URL con `App.tsx`. Contiene 405 declaraciones, incluyendo índices, aliases, layouts y alternativas por flags: **no son 405 páginas**. Los 245 archivos TSX bajo pages tampoco equivalen a 245 pantallas: incluyen auxiliares y variantes. Las decisiones siguientes son por tarea del usuario, no por cantidad de archivos.

### Trabajo avanzado y supervisión

| Pantalla o familia | Mantener / cambiar / retirar y justificación | Ubicación propuesta |
| --- | --- | --- |
| Objetivos y detalle | Mantener metas, jerarquía y relación con proyectos. No duplica tareas. | Acceso avanzado condicionado por la capacidad actual; enlaces desde proyectos. |
| Decisiones y colas | Mantener escritorio de decisiones y filtros. Agrupa más situaciones que las aprobaciones formales. | Un solo acceso cuando esté habilitado; colas dentro de la sección. |
| Listado de aprobaciones | **Sexta candidata a absorber**, en Inbox o su vista dentro de Tareas. Antes hay que garantizar pendientes/todas, historial, filtros y enlaces. | Filtro de la bandeja existente; no otro escritorio. |
| Detalle de aprobación | Mantener: contexto y decisión de gobernanza, con URL directa. No borrar el gate ni convertir aprobación en un cambio de estado ordinario. | Desde bandeja, tarea y enlaces directos. |
| Actividad / AuditHub | Mantener como entrada única de consulta: actividad, ejecuciones, costes, presupuestos y cronología son vistas relacionadas. | Administración → Actividad. No añadir enlaces principales para cada pestaña. |
| Costs / Timeline / aliases audit, runs, budgets | La interfaz streamlined ya los integra/redirige hacia Activity. Conservar componentes y compatibilidad; no contarlo otra vez como reducción nueva. La variante legacy aún presenta destinos propios. | Pestañas de Actividad, conservando filtros y query al redirigir. |
| Casos y detalle | Mantener detrás de su capacidad: documentos versionados, eventos, jerarquía y relaciones con tareas. Tener tabla distinta no prueba valor por sí solo; sí evita asumir equivalencia con Pipelines. | Avanzado, no obligatorio en la experiencia básica. |
| Pipelines / ítem / settings / ReviewQueue / Learnings | Mantener el flujo de etapas, entrada, revisión y automatización; no promover configuración, cola y aprendizajes a módulos principales. | Dentro de Pipelines, condicionado por capacidad. |
| StatusCards y detalle | Mantener experimental: resúmenes vivos elegidos y acciones de refrescar, recompilar y archivar. El detalle es drawer del mismo tablero. | Acceso avanzado; no segundo Inicio obligatorio. |
| Workspaces / ProjectWorkspaceDetail / ExecutionWorkspaceDetail | Mantener ámbitos distintos: inventario global, configuración del proyecto y operación de runtime con servicios/logs/cierre. | Proyecto/tarea como entrada habitual; inventario global avanzado. |
| DashboardLive | Mantener vista de ejecuciones activas/recientes. | Enlace contextual desde panel de agentes activos; sin nueva entrada principal. |

Evidencia: `pages/Goals.tsx:15`, `GoalDetail.tsx:87`, `WhatNeedsMe.tsx:523`, `Approvals.tsx:91`, `ApprovalDetail.tsx:251`, `lib/inbox.ts:830`, `pages/audit/AuditHub.tsx:21`, `Costs.tsx:731`, `Cases.tsx:803`, `CaseDetail.tsx:675`, `Pipelines.tsx:349`, `PipelineSettings.tsx:1279`, `StatusCards/index.tsx:21`, `Workspaces.tsx:80`, `ProjectWorkspaceDetail.tsx:249`, `ExecutionWorkspaceDetail.tsx:777`, `DashboardLive.tsx:12`.

### Apps, Skills, chats e identidad

| Pantalla o familia | Decisión y justificación | Entrada |
| --- | --- | --- |
| Apps Browse | Mantener catálogo y estado de conexiones. | Una entrada Apps. |
| AppNotConnected / AppDetail | Mantener estados antes/después de conectar; no dos catálogos. | Desde la aplicación correspondiente. |
| AppsConnect, BYO, Vercel, AssistantConnection | Mantener flujos de conexión y sus gates; no destinos permanentes del menú. La tarjeta reutilizada de AssistantConnection no cuenta como otra página. | Acción Conectar de Apps. |
| AdvancedTools / perfiles / wizard / gateways | Mantener configuración avanzada real, con perfiles y ejecución. Revisar discrepancia del gate visual: admite member mientras el comentario requiere tools:admin; contrastar autorización efectiva del servidor antes de cambiarlo. | Apps → Avanzado, según permiso efectivo. |
| ChatEndpointSetup / Detail | Mantener configuración, verificación y operación de canal, tras gate experimental. | Desde proveedor/conexión. |
| Skills / variantes production | Mantener biblioteca, instalación, agentes, archivos y versiones. No sustituir el explorador bueno por tarjetas nuevas sin una acción adicional. | Equipo → Skills. |
| SkillSources | Mantener gestión de fuentes de repositorios; secundaria a la biblioteca. | Dentro de Skills. |
| SkillStudio | Mantener edición/ejecución avanzada; compartir editor básico si se solapa con archivos de Skills. | Abrir Studio desde el skill, no otra biblioteca paralela. |
| AgentChats / AgentChat | Mantener lista e hilo de conversación con agente. | Un acceso Chat cuando esté habilitado, o desde agente. |
| BoardChat | Conservar condicionado a la función; es conversación general de compañía, no el mismo hilo de un agente. Evitar dos accesos con el mismo nombre Chat. | Contextual, claramente «Chat de la empresa». |
| UserProfile | Mantener perfil compartible; distinto del formulario para editar mi perfil. | Avatar/persona. |
| Companies / onboarding / NewAgent | Mantener selección/creación y contratación como flujos concretos. No añadir un segundo onboarding obligatorio por cada módulo comercial. | Selector de empresa y acción crear/añadir agente. |
| Auth / signup / invitación / BoardClaim | Mantener acceso y aceptación/reclamación. Login y signup comparten experiencia; dos URLs no implican dos productos. | Entradas por sesión/token, fuera de sidebar. |
| JoinRequestQueue | Mantener aprobar/rechazar solicitudes con permiso. | Acceso o bandeja, sin módulo principal propio. |
| OAuth handoff / CLI auth / MCP connect / Dot connect / device / assistant-connections / chat identity | Mantener consentimiento, emparejamiento, retorno y revocación. No absorber autorizaciones sensibles en un formulario de General. | URL puntual y administración de conexiones correspondiente. |
| PluginPage / CompanySettingsPluginPage | Mantener infraestructura dinámica. No son un número fijo de páginas: depende del plugin instalado y sus permisos. | Contribución contextual, sin duplicar entradas declaradas por el plugin. |
| DesignGuide / UX labs / perf lab | Herramientas internas, fuera del producto cotidiano. Revisar qué rutas están disponibles en build de producción y aplicar política explícita de entorno; no borrar sin revisar consumidores. | Desarrollo, nunca en sidebar del comprador. |
| NotFound / redirects / gates / layouts | Conservar infraestructura de navegación. No contarlos como pantallas de negocio eliminables. | Automático. |

Fuentes: `App.tsx:265–344`, `:675`, `:951–966`; `pages/apps/Browse.tsx:356`, `AppDetail.tsx:79`, `AppNotConnected.tsx:25`, `tools/AdvancedToolsRoute.tsx:12`, `tools/profiles/ProfileDetail.tsx:106`, `CompanySkills.tsx:4066`, `SkillSources.tsx:34`, `SkillStudio.tsx:276`, `AgentChats.tsx:13`, `AgentChat.tsx:16`, `BoardChat.tsx:92`, `McpConnect.tsx:32`, `PluginPage.tsx:26`.

### Público no equivale a desorden interno

Portal, revisión pública, precios, catálogo y facturación tienen destinatarios/acciones distintos. Mantener sus permisos y accesos externos; que no aparezcan en sidebar no los convierte en pantallas huérfanas. La reserva pública se genera como `/api/p/:companyId/book/:slug` desde `api/calendar.ts:103`: es superficie del backend, no página React que falte en App. No se ha probado reserva, pago, proveedor de llamadas ni conexión real en esta auditoría.

No se revisó el contenido de cada plugin instalado ni una sesión de producción. El inventario cubre las declaraciones del router principal; no garantiza exhaustividad de interfaces servidas por backend, entradas alternativas o imports dinámicos. La comparación con el snapshot anterior evalúa la reorganización reciente, no demuestra que todo el código previo a los sprints fuera idéntico a upstream.

## 6A. Sidebar y navegación del producto completo

### Lo que existe y lo que realmente falla

La sidebar streamlined ya agrupa negocio en **Clientes, Ventas y Conversaciones**, con Agenda opcional. Sus pestañas secundarias no son duplicados: Clientes contiene clientes/contactos/servicios; Ventas contiene leads/oportunidades/propuestas/formularios; Conversaciones contiene sus operaciones de canal. Se conservan estas agrupaciones. No volver a crear seis o diez accesos de negocio ni eliminar entidades por tener una pestaña propia.

Hay dos shells y flags que cambian la estructura. En legacy aparecen Organización, Timeline y Costs por separado; streamlined agrupa varias vistas. Esto exige revisar ambos layouts al editar rutas. No basta con limpiar un archivo Sidebar y declarar coherente toda la aplicación.

| Superficie | Cambio concreto | Qué conservar y por qué |
| --- | --- | --- |
| Principal de escritorio | Priorizar Inicio, Tareas, Proyectos, Archivos, Rutinas, Clientes, Ventas, Conversaciones y Equipo. Apps/Actividad en zona administrativa; Ajustes accesible de forma estable. No crear otra página para elegir entre estos destinos. | Crear tarea como acción destacada; selección de empresa y búsqueda existentes. Son acciones frecuentes y ya reconocibles. |
| Inbox / Tareas | Respetar el modo activo. Con combined habilitado Inbox ya se redirige a vista de Tareas y desaparece como enlace móvil propio. Sin combined ambos tienen trabajos distintos. | Contadores, filtros y enlaces directos. No declarar duplicación que el código ya evita ni activar flags silenciosamente durante la poda. |
| Equipo | Revisar «Ver equipo» y «ver todos» de la lista de agentes que llevan al mismo roster. Dejar un acceso de exploración claro y accesos directos útiles. | Agentes frecuentes; no multiplicar roster, organigrama y directorio como tres destinos principales. Org ya redirige en streamlined. |
| Proyectos / favoritos / recientes | Acotar listas, evitar varios accesos equivalentes a ver todos y preservar estado colapsado. | Acceso directo a objetos frecuentes. Recientes también ofrece acciones: no eliminar esas operaciones por considerarlo sólo menú. |
| Casos / Pipelines / Objetivos / Status / Workspaces | Mantener acceso condicionado a capacidades actuales; no activar todo por defecto para completar navegación. | Trabajo avanzado existente, URLs y datos. Validar qué perfil comprador lo necesita antes de promoverlo. |
| Chats | Diferenciar chat con agente, chat general y conversación con cliente en etiqueta/contexto. | Historial y destino de cada hilo; no mezclarlos en una bandeja sin modelo común. |
| Administración / Ajustes | Sacar Navegación como destino independiente al completar su absorción en Perfil. No mover todo a General. Mantener acceso identificable a Apps, Actividad y Ajustes. | Separación usuario/empresa/instancia/cuenta comercial; permisos reales. |
| CommandPalette / búsqueda | Alinear destinos buscables con los destinos principales y permisos/flags; el catálogo estático actual no representa toda la navegación nueva. No convertir búsquedas de entidades en enlaces redundantes. | Atajos existentes y búsqueda por entidad. Buscar «Clientes» o «Ajustes» debe encontrar la sección correcta. |
| Móvil | Aplicar la misma jerarquía y estado activo. La barra inferior cambia con Chat/combined; evitar nuevas pestañas hasta observar recorridos. Corregir CompanySettingsNav para rutas nuevas. | Barra rápida y drawer como accesos complementarios: repetir un destino en ambos no constituye por sí mismo una pantalla duplicada. |
| Subnav de Archivos / CRM / Apps / Skills | Pestañas para vistas de la misma responsabilidad, detalle desde el objeto; mantener volver al listado/contexto. | Los flujos de conectar, importar, revisar y editar no tienen que ser enlaces permanentes. |

Fuentes: `components/Sidebar.tsx:229–384`, `Sidebar.production.tsx`, `SidebarAgents.tsx`, `MobileBottomNav.tsx:33–74`, `CommandPalette.tsx`, `AccountMenu.tsx`, `pages/crm/CrmNavigation.tsx:35–57`, `components/Layout.tsx`, `Layout.production.tsx`, `hooks/useCombinedInboxTasksEnabled.ts:8–33`.

### Criterio de producto para simplificar sin empobrecer

La propuesta no es una sidebar mínima a cualquier precio. Hay que distinguir tres decisiones: retirar una pantalla duplicada, mantener una capacidad con entrada contextual y dejar una capacidad avanzada desactivada para el comprador básico. Sólo la primera reduce pantallas. Ocultar un módulo o convertirlo en otra pestaña no se presentará como eliminación.

Vocabulario cotidiano: **tarea** para ejecutar trabajo, **proyecto** para agruparlo, **cliente** para la relación comercial. «Encargo» no necesita otra entidad visible si termina creando la misma tarea. Casos, pipelines y objetivos deben explicar qué acción adicional aportan a su usuario; no imponerse a los tres caminos iniciales. La existencia de backend o de una tabla distinta ayuda a entender el modelo, pero no sustituye evidencia de uso.

## 7. Orden para ejecutar sin volver a acumular

| Orden | Trabajo concreto | Entrega y aceptación | Paralelismo |
| --- | --- | --- | --- |
| R0 | Congelar nuevas pantallas de organización. Contrastar el inventario de rutas adjunto con enlaces, aliases, componentes embebidos y editores. | Router principal inventariado; comprobar además entradas dinámicas/backend al tocar cada destino. No vender como reducción lo ya absorbido. | Coordinador de rutas y navegación; sin modificar el shell en paquetes independientes. |
| R1 | Perfil absorbe Idioma y accesos; Account elimina destino genérico de borrado; reducir cajas decorativas de scope. | Tres páginas menos. Un único control por preferencia/acción; claro usuario/empresa/cuenta; errores y confirmaciones conservados. | Un dueño para Perfil/Idioma/Navegación; otro para ProductAccounts/eliminación. Coordinador único para App, menús, locales y ambos layouts. |
| R2 | Unificar el editor de resumen diario y corregir el inventario de Ajustes móvil/escritorio. | Inicio muestra información y enlaza; editar en Notificaciones. Ninguna página nueva activa General por fallback. Los accesos se filtran con permisos reales y modo de despliegue. | Puede avanzar con R1 si se reserva ProfileSettings al primer dueño y éste retira el editor cuando el destino esté entregado. |
| R3 | Archivos incorpora propiedades/filtros de contexto; después se retira Context. | Misma gestión de rol, audiencia, caducidad y versiones. Subir un archivo normal sigue siendo rápido. | Independiente de Ajustes; no tocar rutas/locales globales desde este paquete. |
| R4 | Inicio asume todo el informe de resultados con URL; retirar standalone. | Mismos filtros/datos, acceso directo y volver/adelante; sin clonar informe ni añadir dashboard. | Puede avanzar en paralelo a R3; un único dueño de BusinessHome/OutcomeMetrics. |
| R5 | Revisar constructor, catálogo e instalaciones con caso de uso concreto. | Retirar editor sólo tras identificar destino de cada acción y versiones existentes; apartar productos adicionales sin borrar datos. | Posterior; no bloquear R1–R4 ni ampliarlos para resolver marketplace. |
| R6 | Reducir duplicación de operación de medios y acciones CRM divergentes. | Un componente de estado por proyecto; conversión de lead consistente; listas de propuestas/servicios reutilizadas. | Paquetes independientes con propiedad de archivos explícita. |
| R7 | Absorber lista de aprobaciones en bandeja/Tareas según modo activo. | Pendientes, todas, histórico, filtros y decisiones accesibles; detalle y gates intactos; alias conserva intención y filtros. | Dueño de Inbox/Approvals/StreamlinedTasks; coordinar cambios de App con responsable global. No competir por esos archivos con otro sprint. |
| R8 | Aplicar coherencia global de sección 6A: escritorio/móvil, palette, menús contextuales y shells. | Mismo destino reconocible, estado activo correcto, ningún enlace a editor retirado; no activar flags ni añadir páginas contenedoras. | Responsable global después de cada absorción; puede preparar inventario en paralelo, integrar secuencialmente rutas/locales/layouts. |

No ejecutar a la vez varios agentes sobre App, sidebar, ProfileSettings o locales. Un agente entrega el bloque y sus contratos; el coordinador elimina el editor antiguo sólo al verificar el destino. No hacen falta otras cien fichas MD para esta poda: éste es el registro de decisiones.

## 8. Cómo decidir si la siguiente reducción mejora el producto

Antes de retirar una pantalla, escribir la acción de usuario que permite y dónde se completa después. Una retirada sólo cuenta cuando:

1. El usuario hace la misma acción desde un lugar ya existente, con los mismos errores y permisos.
2. No aparecen dos formularios para el mismo dato ni una segunda fuente de verdad.
3. La entrada cotidiana exige igual o menos navegación; no se añade un paso «elige módulo».
4. El destino no obliga a atravesar formularios ajenos. Lo avanzado permanece cerrado hasta solicitarlo.
5. URLs antiguas y selección de empresa/cuenta abren el destino correcto; no se pierde estado sensible ni se cambia el objeto de una acción destructiva.
6. Funciona en móvil y teclado con foco y scroll coherentes. Se observa el recorrido, además de compilar.

Recorridos mínimos de aceptación: cambiar idioma; elegir accesos para una empresa sin cambiar otra; gestionar una sesión; solicitar/cancelar borrado de la cuenta comercial correcta; subir referencia con caducidad y encontrarla desde tarea/proyecto; abrir resultados de 7/30/90 días y volver conservando filtros; lead → conversación → oportunidad/propuesta; cliente → trabajo → revisión.

Las pruebas de contratos y componentes son necesarias, pero no acreditan comprensión. Comparar los recorridos con la interfaz original y observar dudas, retrocesos y tiempo con datos representativos. No introducir telemetría para esta revisión.

## 9. Fuentes inspeccionadas y confianza

Rutas relativas al checkout canónico `paperclip-int`:

- Ajustes: `ui/src/components/BusinessSettingsLinks.tsx`, `CompanySettingsSidebar*.tsx`, `access/CompanySettingsNav.tsx`, `Layout*.tsx`, `product-settings/SettingsScopeHeader.tsx`.
- Titularidad de preferencias: `ui/src/pages/ProfileSettings.tsx`, `LanguageSettings.tsx`, `NavigationPreferences.tsx`, `NotificationSettings.tsx`, `SecuritySettings.tsx`; `ui/src/components/InboxAgentPolicyControl.tsx`; `server/src/routes/daily-brief.ts`.
- Cuenta y configuración: `ProductAccounts.tsx`, `ProductBilling.tsx`, `AgencyWorkspace.tsx`, `PublicApiSettings.tsx`, `ChannelsSettings.tsx`, `WebchatSettings.tsx`, `CrmSync.tsx`, `InstanceAccess.tsx`, `CompanySettings.tsx`.
- Trabajo: `Issues.tsx`, `IssueDetail.tsx`, `Assignments.tsx`, `ProjectDetail.tsx`, `Agents.tsx`, `Org.tsx`, `OrgChart.tsx`, `Routines.tsx`, `Playbooks.tsx`, `Autonomy.tsx`, `Productization.tsx`, `BusinessBuilder.tsx`.
- Solapamientos: `features/productization/BusinessHome.tsx`, `pages/OutcomeMetrics.tsx`, `api/context.ts`, `pages/Context.tsx`, `pages/artifacts/ArtifactsExplorer.tsx`, `components/artifacts/explorer/inbox/InboxDialogs.tsx`, `MediaProjectPanel.tsx`, `MediaTemplates.tsx`, `MediaQueue.tsx`.
- CRM: `pages/crm/*`, `Proposals.tsx`, `ProposalDetail.tsx`, `ServiceAgreements.tsx`, `ServiceAgreementDetail.tsx`, `LeadForms.tsx`, `ConversationInbox.tsx`, `ConversationDetail.tsx`, `Schedule.tsx`, `CrmPhone.tsx`, `CustomerPortalSettings.tsx`, `PublicCustomerPortal.tsx`, `PublicReview.tsx`; registro en `App.tsx`.

Confianza alta en los cinco solapamientos descritos porque se identificaron controles, entidad o componente compartido y el hueco concreto del destino. Confianza condicionada en retirar constructor/catálogos/instalaciones: falta evidencia de uso por comprador, no basta con que la pantalla sea grande o técnica. No hay evidencia de uso que permita declararlas inútiles ni de aceptación que permita declarar cómoda la integración anterior.

Esta entrega sólo añade la revisión. No cambia UI, rutas, datos, commits, push ni despliegue. Documento local, sin contexto de issue Paperclip al que adjuntarlo.

## 10. Estado de ejecución

**R1 ejecutado el 2026-10-23 en `paperclip-int` (rama `integracion`), sin commitear.**

- Idioma y Navegación dejan de ser páginas. `LanguagePreferenceControl` (selector + `useLanguagePreferenceSync`) y `NavigationAccessPreferences` (desplegable «Accesos para esta empresa», cerrado por defecto, misma clave usuario + empresa + navegador) viven en `ProfileSettings`. Las URLs `/company/settings/language`, `/company/settings/navigation` y `/language-settings` redirigen al perfil.
- Eliminar cuenta comercial deja de ser un destino de Seguridad. `AccountDeletionZone` se muestra en la tarjeta de cada cuenta de la que el usuario es dueño, dentro de `ProductAccounts`; no consulta nada hasta abrirse y conserva frase de confirmación, estado, plazo y cancelación. `/company/settings/account-deletion` redirige a Cuentas comerciales. `SecuritySettings` queda con `access` y `retention`.
- `BusinessSettingsLinks` pasa de 11 a 9 enlaces (quita 3, añade «Mi perfil»). La sidebar streamlined sustituye el enlace «Navegación» por «Ajustes».
- Verificación: `tsc --noEmit` de `ui` limpio; tests de Perfil, Seguridad, Sidebar, Cuentas, selector de idioma, eliminación de cuenta e i18n pasan; `check-token-gates` y `check-maps` limpios. No se observó el recorrido en navegador ni en móvil (criterio 6 de la sección 8 sigue pendiente).
- `SettingsScopeHeader` pierde su caja con borde: queda una línea de alcance, descripción corta y enlaces.
- Sólo existía en el árbol sin commitear: `LanguageSettings.tsx`, `NavigationPreferences.tsx` y su test se borraron y no están en git; su lógica está íntegra en los componentes nuevos.

### Ejecución R2–R8 (2026-10-23, mismo árbol, sin commitear)

- **R2.** El editor del resumen diario tiene un solo hogar: `NotificationPreferences`. Se retira de `ProfileSettings` y de `BusinessHome`, que enlaza a Notificaciones («Configurar resumen diario»). `CompanySettingsNav` (móvil y layout antiguo) ahora lista también Notificaciones, Seguridad, Retención, API, Cuentas, Facturación e Instalaciones, y `getCompanySettingsTab` ya no devuelve «General» para ellas.
- **R3.** Archivos absorbe Contexto: vista `/artifacts?context=1`, filtros por rol, vigencia (incl. caducados), audiencia y proyecto, indicador de truncado, propiedades por archivo en un desplegable cerrado y propiedades de subida solo en la vista de contexto. `/artifacts/context` redirige conservando `projectId`. `pages/Context.tsx` y su test se borran; la lógica de test se reubicó.
- **R4.** Resultados vive en Inicio: `?results=1&path=…&days=…` abre el bloque y guarda camino y periodo (atrás/adelante funcionan). `/outcome-metrics` redirige con los valores explícitos de la página antigua (emprendedor, 30 días) salvo que el enlace traiga `path` o `days`. Se quita el enlace «Todos los resultados», que se apuntaba a sí mismo.
- **R5.** No se retira el constructor. Sólo se elimina su tarjeta duplicada de banco de autonomía (Autonomía ya ejecuta el banco por agente y acción) y se sustituye por un enlace. Versiones, comparación, vista previa y extracción Firecrawl no tienen otro hogar; el catálogo compartido e Instalaciones gestionadas no se ocultan (ocultar enlaces no cuenta como simplificar).
- **R6.** `MediaProductionStatus` sustituye al estado duplicado de Plantillas y del panel de proyecto (sondea sólo mientras hay trabajos en cola o en curso). Lead: acción rápida y detalle comparten `buildLeadConversion`, y la acción rápida explica que no crea oportunidad. Servicios y propuestas ya reutilizaban su lista en la ficha de cliente.
- **R7.** El listado de Aprobaciones se retira: `/approvals`, `/approvals/pending` y `/approvals/all` redirigen al filtro de aprobaciones de la bandeja (o a la vista «Todo» de Tareas con la bandeja combinada), vía `?show=approvals&approvals=actionable|all`. El detalle y su URL directa no cambian.
- **R8.** La paleta de comandos añade Archivos, Rutinas, Clientes/Ventas/Conversaciones (sólo con accesos de negocio activos), Apps y Ajustes. La sidebar de agentes deja un solo acceso al roster (se quita «Explorar agentes» del menú cuando ya existe «Ver todos»). Mapas actualizados.
- **Sin verificar:** ningún recorrido en navegador ni móvil. Textos nuevos con `defaultValue`; faltan en los locales JSON. `Inbox.test.tsx` tiene 8 fallos de textos (espera «Columns» con la interfaz en español) ajenos a estos cambios.

