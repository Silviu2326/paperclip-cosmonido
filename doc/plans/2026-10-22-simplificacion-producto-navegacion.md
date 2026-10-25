# Simplificación del producto y de sus páginas

Fecha: 2026-10-22
Estado: análisis y propuesta; no aplicada a la aplicación
Base revisada: UI integrada de `s95-20261022-sidebar-ui-4`, conservada en `tmp/s4-integracion-20261022`

[Revisión funcional de la sidebar](2026-10-22-sidebar-review.md) · [Estrategia de tres caminos](2026-10-21-estrategia-producto-tres-caminos.md) · [Arquitectura propuesta](2026-10-21-producto/2026-10-21-arquitectura-global.md) · [Inventario de superficies](2026-10-21-producto/2026-10-21-inventario-rutas.md)

## Dictamen

La navegación expone la división del desarrollo en módulos. Se han promovido a
destinos permanentes acciones puntuales, preferencias, asistentes de preparación,
vistas de las mismas entidades y herramientas de operación técnica. Además, se
mezcla operar un negocio con administrar la comercialización de Paperclip.

En la configuración base del código hay **43 accesos estáticos** contando
buscador, Inicio, Bandeja, Trabajo, las 30 entradas de Negocio y Administración
desplegada. Los agentes, favoritos, recientes, plugins y flags añaden accesos.
Esta cifra describe el código revisado; no es una lectura de las opciones de una
sesión autenticada de producción ni una medición de uso.

El inventario anterior de 106 superficies documenta rutas, detalles, ajustes,
alias y propuestas. No justifica 106 destinos de navegación. Crear un MD para
una capacidad tampoco demuestra que necesite una página independiente.

La propuesta anterior de agrupar el menú se quedaba corta. Hace falta decidir
qué lugar ocupa cada función y reunir las experiencias que hoy obligan a saltar
entre páginas. Las correcciones ya publicadas de enlaces y móvil se mantienen.

## Criterios para conservar una página

Una página principal debe resolver una actividad recurrente, permitir localizar
y actuar sobre una colección o un espacio de trabajo, y aportar una entrada que
no esté mejor situada en el objeto que la necesita.

- **Espacio principal:** trabajo, clientes, ventas, conversaciones, archivos o equipo.
- **Vista interna:** proyectos frente a encargos, contactos de la cartera o historial de llamadas.
- **Acción guiada:** importar, crear equipo, preparar un vídeo o conectar un canal.
- **Preferencia o administración:** idioma, suscripción, sesiones, API y retención.
- **Operación avanzada:** evaluar autonomía, moderar paquetes o administrar instalaciones ajenas.

Una ficha de cliente o propuesta puede conservar URL propia sin ocupar la
sidebar. Un asistente largo puede necesitar una ruta para reanudarlo. La limpieza
se decide por el recorrido, no por el número de archivos React eliminados.

## Hallazgos concretos en la implementación

1. **Preparar el equipo está repartido en tres entradas.** `ProductizationWorkbench`
   ya reúne paquetes, contratación, primer encargo y equipo. `PortableCatalog`
   vuelve a montar la vista previa de paquetes. `BusinessBuilder` añade borradores,
   selección manual, extracción de una web y un banco de autonomía. El acceso
   «Crear equipo» abre este constructor, cuyo propio texto aclara que guardar o
   previsualizar no contrata agentes. El nombre promete una acción distinta.
2. **Los dos catálogos tratan equipos/configuraciones.** `PortableCatalog` es una
   biblioteca privada de paquetes versionados. `PublicCatalog` añade publicación,
   revisión, importación y valoraciones. Ninguno de esos nombres explica la
   diferencia con la oferta de servicios que el negocio vende a sus clientes.
3. **«Agencia» implementa otro modelo operativo.** `AgencyWorkspace` administra
   cuentas, aprovisionamiento de empresas cliente, paquetes, marca y accesos.
   El servicio llega a crear una nueva empresa operadora. La estrategia acordada
   permite a una agencia de servicios atender muchos clientes dentro de una sola
   empresa. El panel actual encaja con implantar Paperclip para terceros; no debe
   representar a todas las agencias.
4. **Resultados ya está incrustado en Inicio.** `BusinessHome` monta
   `OutcomeMetrics`. Mantener otra entrada para el mismo informe añade un salto.
   Su selector de camino cambia indicadores mostrados, no atribuye los registros
   a un piloto; moverlo no resuelve esa limitación de medición.
5. **Contexto administra archivos existentes.** Usa `companyFilesApi.upload` y
   `update` para rol, vigencia y audiencia. Es una vista especializada del mismo
   repositorio que Artefactos, no necesita otro lugar de almacenamiento ni otra
   entrada principal para el estado actual de la función.
6. **Vídeo ya tiene soporte dentro de Artefactos.** El explorador monta
   `MediaProjectPanel` y la revisión de entregables. Plantillas y cola son partes
   del recorrido de producir/revisar un resultado, hoy expuestas como dos módulos.
7. **Notificaciones crea una segunda experiencia de pendientes.** Su feed contiene
   decisiones, revisiones y tareas, junto con preferencias de dispositivos. Debe
   alimentar una entrada de atención y separar sus preferencias. Esto no supone
   que su API y la de Bandeja tengan hoy los mismos elementos o estados.
8. **Seguridad mezcla tres ámbitos.** La misma pantalla contiene 2FA/sesiones del
   usuario, retención de datos de la empresa y eliminación de una cuenta comercial.
   «Mover Seguridad a Ajustes» sin separar estos ámbitos conservaría la confusión.
9. **Hay pantallas de integración convertidas en herramientas diarias.** Sincronizar
   CRM, configurar canales, insertar el chat web y emitir API keys pertenecen al
   mantenimiento de conexiones. Las llamadas y respuestas sí son trabajo diario.
10. **Completar funciones no prueba una experiencia vendible.** Este análisis usa
    código y documentos, sin datos de uso ni nuevas entrevistas. Las decisiones
    de navegación son propuestas razonadas que deben probarse con los tres recorridos.

Fuentes principales del snapshot revisado:

- [Preparación de equipo y primer encargo](../../tmp/s4-integracion-20261022/ui/src/features/productization/ProductizationWorkbench.tsx)
- [Constructor expuesto como Crear equipo](../../tmp/s4-integracion-20261022/ui/src/pages/BusinessBuilder.tsx)
- [Biblioteca privada](../../tmp/s4-integracion-20261022/ui/src/pages/PortableCatalog.tsx) y [catálogo público](../../tmp/s4-integracion-20261022/ui/src/pages/PublicCatalog.tsx)
- [Panel de Agencia](../../tmp/s4-integracion-20261022/ui/src/pages/AgencyWorkspace.tsx) y [aprovisionamiento de empresas](../../tmp/s4-integracion-20261022/server/src/services/productization/agency.ts)
- [Inicio de negocio con métricas incrustadas](../../tmp/s4-integracion-20261022/ui/src/features/productization/BusinessHome.tsx)
- [Contexto sobre archivos de empresa](../../tmp/s4-integracion-20261022/ui/src/pages/Context.tsx) y [explorador con revisión y vídeo](../../tmp/s4-integracion-20261022/ui/src/pages/artifacts/ArtifactsExplorer.tsx)
- [Notificaciones y preferencias](../../tmp/s4-integracion-20261022/ui/src/pages/NotificationSettings.tsx) y [ámbitos de Seguridad](../../tmp/s4-integracion-20261022/ui/src/pages/SecuritySettings.tsx)

## Decisión para los 30 enlaces de Negocio

«Retirar de la sidebar» conserva la función, sus datos y los enlaces existentes
hasta completar su destino. Ningún movimiento de interfaz autoriza acciones,
amplía permisos, borra información o activa ejecuciones.

| # | Acceso actual y ruta | Decisión | Destino y justificación |
| --- | --- | --- | --- |
| 1 | Puesta en marcha `/productization` | Asistente de preparación | Inicio → Completar configuración. Durante la preparación es visible y reanudable; después queda accesible desde Ajustes. No es una actividad diaria. |
| 2 | Crear equipo `/business-builder` | Separar acción y herramienta avanzada | Equipo → Nuevo equipo usa selección, revisión y contratación existentes. Borradores, comparaciones y evaluaciones técnicas pasan a configuración avanzada. Corregir el nombre del constructor actual mientras se migra. |
| 3 | Catálogo `/portable-catalog` | Vista de Equipo | Equipo → Plantillas y paquetes. Nombra claramente que se instalan configuraciones de agentes. Conservar versiones y revisión previa. |
| 4 | Resultados `/outcome-metrics` | Informe de Inicio | Inicio → Resultados, con enlace directo y filtros conservados. Ya hay una instancia del componente dentro de Inicio. |
| 5 | Plantillas de vídeo `/media-templates` | Acción de producción | Archivos → Crear vídeo → Plantilla, también desde un encargo. Conservar la selección de fuente, edición y costes; no limitarlo a abrir un vídeo ya terminado. |
| 6 | Cola de medios `/media-queue` | Vista contextual y operativa | Estado del trabajo desde encargo/editor; vista global de producción en Archivos para operadores que gestionan varios renders. Mantener prioridades y errores accesibles. |
| 7 | Cuentas y empresas `/product-accounts` | Administración de cuenta | Menú de cuenta → Organizaciones y acceso. Corresponde a quien administra la suscripción y empresas vinculadas; no a la cartera comercial de clientes. Sustituir los formularios basados en IDs por selectores cuando se revise la UX. |
| 8 | Facturación de Paperclip `/product-billing` | Ajuste de suscripción | Cuenta → Plan y facturación. Mantener facturas y límites. Distinguirlo de costes de agentes y de cobros a clientes. |
| 9 | Notificaciones `/notifications` | Integrar atención y separar preferencias | Pendientes en Bandeja; avisos y dispositivos en preferencias de notificación, conservando usuario y empresa. Evitar dos lugares para revisar el mismo pendiente. |
| 10 | Seguridad `/product-security` | Dividir por ámbito | Cuenta → Acceso y sesiones; Empresa → Datos y retención; Cuenta comercial → Eliminación. Preservar las confirmaciones y permisos propios de cada acción. |
| 11 | Idioma `/language-settings` | Preferencia | Cuenta → Preferencias. Es un selector, no un módulo de negocio. Conservar el ámbito actual por usuario y navegador. |
| 12 | API y webhooks `/public-api` | Ajuste de empresa | Ajustes → Desarrolladores, con empresa explícita. Conservar claves, scopes, secretos de una sola visualización y revocación. |
| 13 | Clientes `/customers` | Mantener espacio principal | Cartera de organizaciones/personas para las que se trabaja. Ficha con trabajo, contactos, conversaciones, acuerdos y entregas relacionadas. |
| 14 | Contactos `/contacts` | Vista dentro de Clientes | Clientes → Contactos, con directorio de toda la empresa y búsqueda desde Ventas. Conservar los contactos que aún no pertenecen a un cliente. |
| 15 | Importar contactos `/contact-import` | Acción guiada | Botón Importar en Contactos. Mantener carga, mapeo, revisión, confirmación y recibo; la importación no concede consentimiento para contactar. |
| 16 | Leads `/leads` | Vista de Ventas | Ventas → Leads. Mantener cualificación, descarte, deduplicación y conversión; un lead no se convierte automáticamente en cliente por compartir pestaña. |
| 17 | Formularios de leads `/lead-forms` | Configuración de captación | Ventas → Captación → Formularios. Mantener biblioteca, publicación, origen, enlace público y código de inserción. |
| 18 | Oportunidades `/opportunities` | Vista de Ventas | Ventas → Oportunidades. Tablero/lista, próxima acción, responsable e importe permanecen. No confundir sus etapas con estados de una tarea. |
| 19 | Conversaciones `/conversations` | Mantener espacio principal | Atención a personas externas con historial y vínculo al cliente/lead. Los chats privados con agentes deben seguir distinguiéndose. |
| 20 | Agenda `/schedule` | Espacio opcional por uso | Agenda se puede fijar cuando el usuario necesita gestionar reuniones; acceso contextual desde conversación, lead y cliente. Mantener reservas públicas y controles de ejecución. |
| 21 | Llamadas CRM `/crm-phone` | Vista de Conversaciones | Conversaciones → Llamadas y devoluciones; pendientes de aprobación también en Bandeja. La configuración del proveedor va en Apps. |
| 22 | Sincronización CRM `/crm-sync` | Detalle de conexión | Ajustes → Apps → CRM → Sincronización. Mantener fuente principal, conflictos, resolución y reanudación de trabajos. |
| 23 | Agencia `/agency` | Reubicar y nombrar por su función | Cuenta → Instalaciones gestionadas, para el modelo de implantación a terceros. La agencia de servicios usa Clientes y Trabajo dentro de su empresa. No migrar ni fusionar empresas existentes de forma automática. |
| 24 | Catálogo público `/public-catalog` | Biblioteca compartida; publicación avanzada | Equipo → Plantillas → Biblioteca compartida. Publicación y moderación con su audiencia administrativa. Evitar desarrollar el marketplace como siguiente prioridad sin demanda comprobada. |
| 25 | Playbooks `/playbooks` | Vista de Automatizaciones | Automatizaciones → Procedimientos. Conservar versiones, pasos, aprobaciones y evidencias. Rutinas y procedimientos pueden convivir sin fusionar sus modelos. |
| 26 | Propuestas `/proposals` | Vista de Ventas | Ventas → Propuestas y acceso desde oportunidad/cliente. Cada revisión, enlace de aceptación y pago conserva identidad y URL. |
| 27 | Acuerdos de servicio `/service-agreements` | Vista de Clientes | Clientes → Servicios recurrentes, con vista de todos los clientes y detalle por cliente. Conservar vigencias, periodos, alcance aceptado y encargos generados. |
| 28 | Autonomía `/autonomy` | Control de Equipo | Equipo → Permisos y autonomía, más acceso desde cada agente. La matriz global sigue disponible; el banco técnico queda en herramientas avanzadas. Las decisiones pendientes llegan a Bandeja. |
| 29 | Canales `/channels-settings` | Configuración de conexión | Ajustes → Apps → Canales de atención. Recepción y respuesta se trabajan en Conversaciones. No convertir los canales de clientes en chats de board por unificar la entrada visual. |
| 30 | Chat web `/webchat-settings` | Detalle de canal | Ajustes → Apps → Chat web. Widget, apariencia, dominio y código de inserción son configuración de un canal concreto. |

**De esas 30 entradas, dos justifican un espacio principal propio: Clientes y
Conversaciones. Agenda puede ser otro acceso principal según el trabajo.** Ventas
merece un espacio compartido que reúne varias de las entradas actuales. Las
demás funciones encuentran su entrada en preparación, vistas, acciones o ajustes.
Esto es una decisión propuesta de navegación, no una orden de eliminar 27 modelos.

## Resto de accesos de la configuración base

| Acceso actual y ruta | Decisión | Motivo y destino |
| --- | --- | --- |
| Buscar `/search` | Utilidad global | Cabecera y atajo, accesible desde cualquier espacio; no cuenta como módulo de trabajo. |
| Inicio `/dashboard` | Mantener | Qué requiere atención, trabajo en curso, resultados y presupuesto. Preparación pendiente aparece aquí. |
| Bandeja `/inbox` | Una entrada de atención | Acceso persistente desde cabecera con contador; conservar URL y las vistas existentes. Si Combined Inbox + Tasks está activo, conservar su integración en Trabajo en lugar de añadir otro feed. |
| Tareas `/issues` | Trabajo → Tareas | Ejecución detallada y seguimiento del trabajo; mantener vista global, filtros y enlaces de agentes. |
| Proyectos `/projects` | Trabajo → Proyectos | Agrupación de iniciativas y colaboración. No todo proyecto necesita un encargo comercial. |
| Rutinas `/routines` | Automatizaciones → Rutinas | La repetición y los disparadores merecen un lugar estable junto a los procedimientos. |
| Encargos `/assignments` | Trabajo → Encargos | Pedir un resultado con presupuesto y criterio de aceptación; vista inicial propuesta para el usuario de negocio. |
| Contexto `/context` | Archivos → Contexto | Vista por oferta, marca, procedimiento y cliente, con vigencia y audiencia. Mantener también la elección de contexto desde un encargo. |
| Artefactos `/artifacts` | Mantener y nombrar Archivos | Entrada, salidas, versiones, resultados y revisión en un único lugar. La aceptación sigue siendo una operación sobre una versión concreta. |
| Oficina `/office` | Equipo → Oficina, opcional | Es una representación visual del equipo y su actividad. Puede aportar identidad al producto sin competir con los objetos de trabajo en la navegación diaria. |
| Habilidades `/skills` | Equipo → Habilidades | Capacidades compartidas de los agentes y sus fuentes; conservar permisos existentes y acceso directo para administradores frecuentes. |
| Conectores `/apps` | Ajustes → Apps y conexiones | Una entrada común para descubrir, conectar y resolver incidencias. Los avisos de una conexión rota enlazan directamente a su detalle. |
| Auditoría `/activity` | Acceso secundario permanente a Control | Actividad, ejecuciones, costes y presupuestos. Consumo y bloqueos también se muestran en Inicio; no esconder el control de gasto bajo ajustes difíciles de encontrar. |

Los agentes siguen teniendo una entrada principal en **Equipo**, aunque el
listado actual se represente como un árbol dinámico. Favoritos y recientes son
atajos personales, no nuevas secciones obligatorias. El selector de empresa y el
menú de cuenta conservan su ámbito independiente de los clientes del CRM.

## Superficies experimentales

| Superficie | Tratamiento propuesto |
| --- | --- |
| Chat con agentes | Acceso desde Equipo/agente y atajo fijable cuando esté activo. Distinguir claramente de conversaciones con clientes. |
| Decisiones | Proyectar pendientes en la entrada de atención, conservando tipos, responsables y acciones. |
| Estado / status cards | Vista de Inicio o Control; no otro resumen general competidor. |
| Sala de reuniones | Vista opcional de Equipo; abrirla no inicia ejecución por sí solo. |
| Casos y Pipelines | Evaluar como vistas avanzadas de Trabajo/Automatizaciones sin reemplazar automáticamente oportunidades o encargos. |
| Objetivos | Vista de Trabajo y resumen en Inicio. Conservar jerarquía y vínculo de toda tarea con su objetivo. |
| Espacios de trabajo / entornos | Configuración avanzada de proyectos o agentes. Las restricciones del runtime continúan aplicándose. |

Este análisis no activa ni retira flags y no cambia el contrato de cada
superficie experimental. Una entrada se muestra por capacidad elegida y permisos;
que una colección esté vacía no debe volver imposible empezar a utilizarla.

## Navegación objetivo

Lugares operativos propuestos:

1. **Inicio**.
2. **Trabajo:** encargos, proyectos y tareas.
3. **Clientes:** cartera, contactos y servicios recurrentes.
4. **Ventas:** leads, oportunidades y propuestas; captación como configuración interna.
5. **Conversaciones:** mensajes y llamadas de personas externas.
6. **Archivos:** entrada, contexto y entregables; creación/edición de medios desde el archivo o encargo.
7. **Equipo:** agentes, plantillas, habilidades y autonomía; Oficina como vista opcional.
8. **Automatizaciones:** rutinas y procedimientos.
9. **Agenda**, fijable para quien gestiona reuniones habitualmente.

Ventas y Agenda no necesitan estar fijadas en todos los caminos. Clientes y
Conversaciones se pueden activar al incorporar atención a terceros; el
emprendedor no necesita inventarse un cliente para empezar. Todos los caminos
usan las mismas entidades al cruzarse, sin clonar el producto tres veces.

Cabecera: búsqueda y atención pendiente. Pie: **Control**, **Ajustes** y cuenta.
Apps queda en Ajustes con accesos contextuales desde avisos o acciones que
requieren conectar un proveedor. La cuenta conserva suscripción y preferencias.

No trasladar las 30 entradas a 30 pestañas. Cada espacio empieza por la acción
frecuente y sus vistas principales; la configuración vive en su contexto. Los
detalles conservan enlaces directos y el estado de los filtros.

## Conceptos que deben seguir siendo distintos

- Encargo: resultado contratado o solicitado, presupuesto y aceptación.
- Proyecto: agrupación de trabajo que puede ser interna o para un cliente.
- Tarea: unidad de ejecución con un solo asignado y checkout atómico.
- Lead, contacto, cliente y oportunidad: identidades y estados relacionados;
  compartir un espacio no autoriza fusionarlos ni perder el historial.
- Rutina y playbook: disparador/repetición frente a procedimiento versionado.
- Plantilla de agentes y oferta comercial: configurar el equipo no define por
  sí solo qué producto o servicio se vende al comprador.
- Suscripción a Paperclip, coste de proveedores y cobro al cliente: tres hechos
  distintos con fuentes y permisos propios.
- Chat con agentes y conversación externa: audiencias y consecuencias de envío
  diferentes, aunque compartan proveedor o componentes.

## Orden de trabajo propuesto

| Fase | Entrega | Dependencias y trabajo paralelo |
| --- | --- | --- |
| 0. Cerrar el mapa | Aprobar nombres, destinos y ámbito de los 43 accesos; elegir entradas iniciales para los tres caminos. | Este documento es la base. Revisar la contradicción Agencia/implantaciones y el significado de los catálogos antes de mover pantallas. |
| 1. Reducir ruido evidente | Reubicar idioma, notificaciones, seguridad, cuenta, facturación, API, canales y sincronización; importar y crear pasan a acciones de sus listas. | Cada destino debe existir antes de retirar su entrada. Cuenta/preferencias y conexiones pueden prepararse en paralelo; una persona integra sidebar/rutas. Mantener alias y favoritos. |
| 2. Consolidar operación | Trabajo; Clientes/Ventas/Conversaciones; Archivos/Contexto/medios; Equipo/Automatizaciones. | Cuatro frentes de UI independientes con contratos existentes. La integración de App/router/sidebar tiene un único responsable. Primero estabilizar relaciones y entradas contextuales; después retirar accesos redundantes. |
| 3. Separar administración avanzada | Instalaciones gestionadas, biblioteca pública/moderación, bancos de autonomía y ajustes de infraestructura. | Conservar acceso a quienes ya los usan y sus datos; no condicionar el recorrido cotidiano a configurar un marketplace o un evaluador técnico. |
| 4. Comprobar el recorrido | Ejecutar un caso de emprendedor, uno de agencia de servicios y uno comercial con sus responsables. | La simulación de UI prueba navegación. La aceptación comercial necesita compradores/casos reales; no declararlos validados por tener rutas y tests. |

Las fichas de página existentes siguen sirviendo para contratos y operaciones.
Al implementar, actualizar sus secciones de navegación/relacionados y enlazarlas
con el destino elegido, junto con el inventario de rutas y los mapas afectados.
No regenerar 106 documentos ni convertir todas las propuestas antiguas en requisitos.

## Cómo aceptar la simplificación

- Un emprendedor prepara contexto, encarga un resultado y lo revisa sin crear un
  cliente ni pasar por cuentas comerciales, catálogo público o bancos técnicos.
- Una agencia abre un cliente y encuentra trabajo, contactos, conversaciones,
  entregas y servicio recurrente sin administrar una instalación por cliente.
- Un comercial recibe un lead, lo cualifica y registra su siguiente acción desde
  Ventas/Conversaciones; abre propuesta o reserva en su contexto cuando lo necesita.
- Los enlaces actuales, incluidos IDs, filtros y fragmentos, siguen llegando al
  objeto y la empresa correctos. Atrás/adelante y cambio de empresa conservan un
  comportamiento coherente.
- Importar, instalar una plantilla, renderizar, contactar, cobrar o ampliar
  autonomía sigue requiriendo las decisiones y permisos que corresponden.
- Los errores, gasto, bloqueos y decisiones pendientes siguen siendo visibles;
  la limpieza no reduce observabilidad operativa ni elimina pruebas de fallos.
- No se añade una nueva colección o pantalla para sustituir otra que todavía no
  se ha retirado. Evitar una tercera Bandeja, un tercer catálogo o otro almacén.

## Estado de esta revisión

Se han leído las páginas, componentes compartidos, API clients y la parte de
aprovisionamiento necesaria para distinguir el panel de Agencia. El análisis no
afirma que todas las integraciones funcionen en producción ni calcula un nuevo
porcentaje de completitud de sprints.

Esta entrega añade documentación. No modifica la UI, el backend, los datos, los
flags o el despliegue; no requiere ejecutar tests ni publicar cambios.
