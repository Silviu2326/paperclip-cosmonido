# Definición de producto para emprendedores agencias y equipos comerciales

Fecha: 2026-10-21
Estado: Propuesta de producto pendiente de validación comercial y desglose técnico
Alcance acordado: cubrir los tres caminos con una plataforma común
Origen: conversación de definición de producto con el propietario del proyecto

Paperclip debe permitir a emprendedores y empresas operar con equipos de agentes de IA: captar oportunidades, ejecutar trabajo y atender clientes, con supervisión humana y control de costes.

La decisión de alcance es cubrir emprendedores, agencias y equipos comerciales. Los perfiles concretos, las funcionalidades, los paquetes, los precios y las prioridades de este documento son propuestas para desarrollar esa dirección. Su documentación no autoriza empezar a implementarlas.

## Relación con el producto actual

[GOAL](../GOAL.md) define la visión de infraestructura para empresas de agentes. [PRODUCT](../PRODUCT.md) describe el control de objetivos, agentes, trabajo, presupuestos y resultados. [SPEC implementation](../SPEC-implementation.md) sigue siendo el contrato vigente para implementar V1.

Esta propuesta conecta esa base con operaciones de negocio reconocibles por el comprador. Algunas capacidades propuestas, como conocimiento del negocio y gestión de ingresos, amplían el alcance de V1. Antes de implementarlas se debe acordar el alcance y actualizar los contratos correspondientes, sin reemplazar la visión existente.

## Decisiones y supuestos

| Tema | Estado | Definición |
| --- | --- | --- |
| Cubrir los tres caminos | Acordado | Emprendedores, agencias y equipos comerciales |
| Definir antes de construir | Acordado | Esta etapa documenta el producto y sus necesidades |
| Una plataforma compartida | Propuesta | Reutilizar datos, ejecución, comunicaciones y control |
| Experiencias específicas | Propuesta | Adaptar entrada, plantillas, vistas y métricas a cada camino |
| Perfiles de comprador | Hipótesis | Validar problema, frecuencia, presupuesto y acceso a compradores |
| Modelo comercial | Hipótesis | Suscripción base, paquetes y consumo transparente |
| Alcance de la primera versión | Propuesta | Tres recorridos completos y acotados |
| Calendario y presupuesto | Pendiente | Estimar después del desglose y de las pruebas necesarias |

La recomendación inicial de centrarse exclusivamente en agencias queda sustituida por el alcance de tres caminos. Las agencias siguen siendo uno de los perfiles que se deben validar.

## Producto y propuesta de valor

Definición de trabajo:

> Paperclip permite a emprendedores y empresas operar con equipos de agentes de IA: captar oportunidades, ejecutar trabajo y atender clientes, con supervisión humana y control de costes.

El comprador debe entender qué trabajo puede delegar, qué información necesita aportar, qué decisiones conserva y qué resultado puede inspeccionar.

La hipótesis de diferenciación es conectar oportunidad, compromiso, ejecución y resultado dentro de un mismo contexto, conservando trazabilidad y control de costes. Debe demostrarse con casos reales antes de convertirse en una promesa comercial.

Emprendedor y agencia describen perfiles de cliente. Comercial describe también una función que ambos pueden necesitar. Un usuario puede empezar por un camino y activar capacidades de los otros sin duplicar datos.

## Clientes ideales iniciales

Los siguientes perfiles son hipótesis de partida, no segmentos ya validados.

| Camino | Comprador y usuario principal | Problema a comprobar | Qué compra | Primer resultado demostrable |
| --- | --- | --- | --- | --- |
| Emprendedor | Fundador o profesional que vende un producto o servicio digital | Concentra investigación, producto, marketing y operaciones y no consigue delegar con continuidad | Capacidad de ejecución para desarrollar y operar su negocio | Una iniciativa convertida en un entregable utilizable |
| Agencia | Dueño o responsable de operaciones de una agencia pequeña con servicios repetibles | Pierde tiempo coordinando encargos, revisiones y trabajo recurrente de varios clientes | Capacidad de entrega y visibilidad sobre compromisos y costes | Un encargo de cliente entregado y revisado |
| Comercial | Dueño o responsable comercial con contactos y oportunidades que requieren seguimiento | Los contactos quedan sin atender, el historial se dispersa o se pierde el siguiente paso | Continuidad en cualificación, respuesta y seguimiento | Un lead atendido, cualificado y con próxima acción registrada |

### Señales de encaje

- Hay trabajo real y recurrente que se puede describir y revisar.
- El negocio dispone de información utilizable sobre su oferta y sus procedimientos.
- Existe una persona responsable de aceptar resultados y decidir excepciones.
- El comprador puede identificar un coste actual o una oportunidad perdida.
- Hay un resultado observable que permite comparar el proceso antes y después.

El alcance inicial debe seleccionar trabajos concretos dentro de estos perfiles. La cobertura de tres caminos no equivale a poder automatizar cualquier función de cualquier sector.

### Dos modelos posibles para agencias

Una agencia puede comprar Paperclip para operar sus propios servicios o para implantar equipos de agentes en los negocios de sus clientes.

El primer modelo necesita gestión de cartera, proyectos y entregas. El segundo añade administración de instalaciones o cuentas, propiedad de conexiones, soporte, consumo y facturación por cliente. La modalidad de implantación para terceros necesita definición propia antes de prometerse.

## Base existente y carencias detectadas

La siguiente base procede de documentación, esquema y navegación revisados el 2026-10-21. La presencia de una tabla, ruta o entrada de catálogo no prueba un recorrido en producción.

| Capacidad | Base observada | Trabajo que requiere esta propuesta |
| --- | --- | --- |
| Organización | Empresas, agentes, objetivos y proyectos | Vincularlos con contexto comercial y resultados de negocio |
| Ejecución | Tareas, asignación, revisiones y aprobaciones | Acciones y recorridos específicos de cada caso de uso |
| Entregables | Documentos, adjuntos y productos de trabajo | Relacionarlos con compromisos y aceptación del cliente |
| Repetición | Rutinas | Incorporar eventos y condiciones comerciales sin crear un motor paralelo |
| Procesos por etapas | Pipelines, etapas, casos y automatizaciones | Evaluar su reutilización para ventas y entrega; su navegación está sujeta a opciones experimentales |
| Costes | Eventos de coste y finanzas, presupuestos y conciliación de proveedores | Atribución a clientes y proyectos y separación de ingresos y cobros |
| Comunicación | Correo asociado a tareas y conexiones | Historial por contacto, cliente y oportunidad |
| Aplicaciones | Catálogo y rutas de conexión a herramientas externas | Validación de permisos, datos y acciones para cada recorrido vendido |
| Clientes y ventas | No se identificó un modelo comercial completo en los esquemas y páginas revisados | Definir clientes, contactos, oportunidades y sus relaciones con el trabajo |

Referencias del repositorio:

- [Pipelines y etapas](../../packages/db/src/schema/pipelines.ts)
- [Casos de pipeline y vínculos con tareas](../../packages/db/src/schema/pipeline_cases.ts)
- [Casos duraderos](../../packages/db/src/schema/cases.ts)
- [Eventos financieros](../../packages/db/src/schema/finance_events.ts)
- [Contabilidad de proveedores](../../packages/db/src/schema/accounting.ts)
- [Navegación y opciones experimentales](../../ui/src/components/Sidebar.tsx)
- [Catálogo de rutas de conexión](../../packages/shared/src/connection-routing.ts)
- [Correo mediante AgentMail](../connections/AGENTMAIL.md)
- [Conexión Gmail](../connections/GMAIL.md)
- [Conexiones Google Workspace](../connections/GOOGLE-WORKSPACE.md)

Las facturas de proveedores y los costes de modelos no resuelven por sí solos la facturación de los servicios que un usuario vende a sus clientes.

## Capacidades compartidas

| Capacidad | Necesidad de negocio | Relaciones principales |
| --- | --- | --- |
| Clientes y contactos | Saber para quién trabajamos y con quién hablamos | Oportunidades, conversaciones, proyectos y documentos |
| Leads y oportunidades | Registrar interés, cualificar y mantener el siguiente paso | Contactos, oferta, responsable y proceso comercial |
| Productos y servicios | Describir qué se vende y con qué alcance | Propuestas, precios orientativos y plantillas de entrega |
| Proyectos y entregables | Ejecutar lo comprometido y registrar aceptación | Cliente, acuerdo, tareas, agentes y costes |
| Comunicaciones | Conservar conversaciones y compromisos | Contacto, cliente, oportunidad y trabajo relacionado |
| Contexto del negocio | Dar información fiable a los agentes | Oferta, marca, procedimientos y contexto del cliente |
| Automatizaciones | Actuar ante entradas, fechas o cambios de estado | Rutinas, tareas, acciones y permisos |
| Resultados y economía | Medir trabajo, ventas, entregas y consumo | Evidencias, ingresos, cobros y costes atribuibles |

El recorrido comercial y de servicio propuesto es:

**Contacto → oportunidad → acuerdo → trabajo → entrega → continuidad.**

Las iniciativas internas del emprendedor pueden comenzar directamente en objetivo o proyecto, sin crear un cliente ficticio.

## Modelo lógico propuesto

Este modelo describe conceptos y relaciones. No prescribe todavía tablas, migraciones ni rutas API.

### Empresa operadora y clientes

La empresa de Paperclip es la organización que opera el sistema. Sus clientes son organizaciones o personas externas con las que mantiene una relación de negocio.

Una agencia debe poder gestionar varios clientes dentro de su empresa. Crear una empresa de Paperclip por cliente no debe ser un requisito para llevar su cartera. Una separación adicional podrá justificarse por acceso o por un despliegue contratado.

Todos los nuevos registros de negocio deben pertenecer a una empresa operadora y respetar sus límites de autorización.

### Contactos y organizaciones

Una organización puede tener varios contactos. Una persona puede tener relaciones con distintas organizaciones. Deben conservarse los roles y el contexto de cada relación.

La detección y fusión de duplicados debe preservar vínculos, historial y procedencia. El nombre de una persona u organización no basta como identificador único.

### Leads y oportunidades

Un lead representa interés pendiente de cualificar; su representación concreta queda por definir. Convertirlo no debe duplicar al contacto ni borrar su historial.

Un mismo cliente puede mantener varias oportunidades. Cada oportunidad debe tener estado, responsable, próxima acción y, cuando se conozcan, importe, moneda y fecha estimada.

La probabilidad o el importe estimado de una oportunidad no son un ingreso confirmado.

### Compromisos y trabajo

Una propuesta debe conservar su alcance y sus revisiones. La aceptación de una versión concreta define el compromiso de entrega.

Una oportunidad ganada puede originar uno o varios proyectos o servicios recurrentes, según la oferta. La conversión debe ser trazable y evitar duplicados al reintentarse.

Completar una tarea, aceptar una entrega y registrar un cobro son hechos distintos.

### Responsabilidad y acceso

El responsable de una relación comercial no sustituye al único asignado de cada tarea. La coordinación entre agentes debe conservar el modelo de asignación y checkout vigente.

El acceso de clientes externos, si se incorpora, debe limitarse explícitamente a los datos y entregas autorizados. Ser contacto comercial no concede membresía ni acceso a la empresa de Paperclip.

## Ficha de clientes

La ficha debe responder qué está pasando con el cliente y qué acción corresponde ahora.

### Contenido propuesto

- Identidad de la organización o persona, contactos, origen y etiquetas.
- Responsable humano y agentes asignados a sus procesos.
- Historial de conversaciones, decisiones y compromisos.
- Oportunidades abiertas y próximos seguimientos.
- Propuestas, alcance y condiciones aceptadas.
- Proyectos, fechas, entregables y revisiones pendientes.
- Documentación y preferencias del cliente.
- Importes acordados, cobros y costes atribuibles cuando existan fuentes.
- Incidencias y continuidad de servicio.

### Vistas iniciales

- Lista de clientes y contactos con búsqueda y filtros.
- Ficha con resumen y cronología.
- Oportunidades por etapas y lista de próximos seguimientos.
- Trabajo y entregables por cliente.
- Pendientes que requieren una decisión humana.

Cada pendiente debe enlazar con la acción que lo resuelve. Las vistas generales deben priorizar compromisos, resultados y excepciones que el usuario pueda gestionar.

## Camino del emprendedor

### Necesidades específicas

- Configuración guiada de negocio, oferta y prioridades.
- Iniciativas internas vinculadas a objetivos.
- Equipos y procedimientos preparados para trabajos concretos.
- Contexto compartido de producto, marca y mercado objetivo.
- Revisión de entregables y control del gasto.
- Acceso opcional a captación y clientes cuando el negocio lo requiera.

La configuración inicial debe permitir pedir un resultado sin exigir un organigrama completo.

### Primer recorrido propuesto

**Objetivo → alcance → plan de trabajo → ejecución → entregable → revisión.**

Ejemplo ilustrativo: un fundador solicita preparar la oferta y los materiales de lanzamiento de un servicio digital. Paperclip conserva la información aportada, descompone el trabajo, produce los materiales y presenta el resultado para revisión.

### Criterio de éxito

El usuario obtiene un entregable accesible y utilizable, con su relación al objetivo, estado de revisión y coste de ejecución. El criterio de aceptación se define antes de ejecutarlo.

## Camino de la agencia

### Necesidades específicas

- Cartera de clientes y contactos.
- Catálogo de servicios y plantillas de proyecto.
- Incorporación del cliente y recogida del brief.
- Alcance, fechas y compromisos.
- Entregables, solicitudes de cambio y aceptación.
- Trabajo recurrente y continuidad.
- Coste por proyecto y cliente.
- Separación de información entre clientes.
- Portal de cliente en una fase posterior, si se valida su necesidad.

### Primer recorrido propuesto

**Cliente → brief → alcance → proyecto → producción → revisión → entrega → aceptación.**

Ejemplo ilustrativo: una agencia vende un paquete de contenidos. El equipo trabaja con el contexto de ese cliente, produce las piezas, recibe correcciones y conserva las versiones aceptadas.

### Criterio de éxito

El encargo se entrega con trazabilidad del alcance y las revisiones. La agencia identifica pendientes, fecha comprometida y costes disponibles. La aceptación del cliente se registra con su evidencia.

## Camino comercial

### Necesidades específicas

- Captación por formulario, importación o conexión.
- Identificación y deduplicación de contactos.
- Cualificación con criterios explícitos y fuentes.
- Oportunidades por etapas.
- Responsable y siguiente acción.
- Correo, disponibilidad y agenda.
- Seguimientos y gestión de respuestas.
- Propuestas y registro de cierre.
- Transferencia al trabajo de entrega cuando proceda.

### Primer recorrido propuesto

**Entrada de lead → cualificación → respuesta → seguimiento → reunión o cierre registrado.**

Ejemplo ilustrativo: una persona solicita información. El agente consulta la oferta, registra la oportunidad, prepara o envía la respuesta según sus permisos y mantiene el próximo seguimiento. Una respuesta del contacto actualiza ese contexto.

### Criterio de éxito

El lead tiene identidad, origen, historial y responsable. Cada acción externa conserva su resultado real. La oportunidad termina con siguiente paso, cierre documentado o motivo de descarte.

Un borrador preparado no demuestra un envío y un envío no demuestra una reunión o una venta.

## Acciones de agentes y automatización

El valor debe residir en procesos completos y continuados, además de producir respuestas o documentos.

### Requisitos propuestos

- Acciones de negocio disponibles para humanos y agentes con las mismas fronteras de empresa.
- Permisos por capacidad y autonomía configurada por acción.
- Aprobaciones en los puntos definidos por el negocio.
- Continuidad ante respuestas, fechas y cambios de estado.
- Reintentos que eviten efectos externos duplicados.
- Historial de quién actuó, con qué contexto y con qué resultado.
- Recuperación visible cuando una acción no pueda completarse.
- Evidencias asociadas a comunicaciones, decisiones y entregas.

Los envíos, publicaciones, descuentos y compromisos económicos deben respetar la autoridad concedida. Una autorización permanente válida puede permitir una acción repetida dentro de su alcance; no debe forzarse una confirmación por cada ejecución si no la exige la política.

Las credenciales se gestionan mediante las conexiones y secretos existentes. Los datos externos y los mensajes de clientes no conceden autoridad para ejecutar acciones internas.

Las tareas mantienen asignación única, checkout atómico, límites de presupuesto y auditoría. La nueva capa comercial debe aprovechar esas garantías.

## Contexto del negocio

Los agentes necesitan información organizada sobre oferta, precios, alcance, marca, procedimientos, casos y preferencias de clientes.

La primera versión puede apoyarse en archivos y documentos existentes, con vínculos claros y acceso correcto. No requiere decidir de antemano un sistema nuevo de búsqueda o memoria.

Cada dato relevante debe conservar procedencia y, cuando aplique, vigencia. Una propuesta generada por IA debe distinguirse de un dato confirmado o un compromiso aceptado.

No debe compartirse información privada de un cliente con otro por reutilizar una plantilla o un agente.

## Integraciones y propiedad de los datos

Priorizar unas pocas conexiones que permitan completar los primeros recorridos:

| Necesidad | Uso inicial | Evidencia de aceptación |
| --- | --- | --- |
| Entrada de leads | Formulario, importación o fuente conectada | Registro creado con origen y control de duplicados |
| Correo | Consultar contexto y preparar o enviar mensajes según autorización | Borrador, envío o fallo comprobado y vinculado al contacto |
| Calendario | Consultar disponibilidad y gestionar reuniones autorizadas | Evento confirmado o error visible |
| Documentos y archivos | Leer contexto y entregar resultados | Archivo accesible con acceso correcto |
| CRM existente | Leer o sincronizar clientes y oportunidades cuando se contrate esa modalidad | Identidad y cambios reconciliados con la fuente principal |

La conexión presente en un catálogo no demuestra disponibilidad, autorización, acceso a escritura ni entrega de un resultado.

Para cada dato compartido con un CRM se debe definir el sistema principal, los identificadores externos, el sentido de sincronización, los conflictos y el comportamiento tras una desconexión. Una copia local no debe aparentar estar actualizada si no lo está.

Las rutas de conexión existentes pueden servir como base. Las restricciones de disponibilidad, autenticación y distribución se deben verificar al preparar cada integración comercial, siguiendo el [Connector playbook](../connections/CONNECTOR-PLAYBOOK.md).

## Métricas y economía

### Métricas por camino

| Camino | Métricas propuestas |
| --- | --- |
| Emprendedor | Tiempo hasta el primer entregable aceptado, iniciativas completadas, revisiones y coste por resultado |
| Agencia | Tiempo de entrega, entregas a tiempo, revisiones por encargo, trabajo pendiente y coste por proyecto o cliente |
| Comercial | Tiempo de primera respuesta, leads atendidos, cualificación, seguimientos vencidos, reuniones confirmadas y oportunidades ganadas |

Los ahorros de tiempo y las mejoras de productividad requieren una comparación con el proceso anterior. No deben deducirse del número de tareas ejecutadas.

### Magnitudes que deben distinguirse

- Valor de oportunidades abiertas y previsiones.
- Ventas o importes acordados.
- Ingresos registrados según la fuente elegida.
- Dinero efectivamente cobrado.
- Costes de modelos, herramientas y proveedores.
- Costes humanos u otros costes cuando se aporten.
- Margen estimado, indicando qué costes incluye.

Las cantidades deben conservar moneda, fecha, fuente y condición de estimación. Un margen calculado únicamente con consumo de IA no representa el margen total del negocio.

La facturación de Paperclip al comprador y la facturación de ese comprador a sus clientes son procesos diferentes.

## Experiencia de entrada y navegación

La configuración debe identificar qué quiere conseguir el usuario, qué información necesita el equipo y qué decisiones requieren su intervención.

Propuesta de entrada:

1. Elegir uno o varios caminos.
2. Describir negocio, oferta y resultado deseado.
3. Aportar el contexto mínimo.
4. Conectar las aplicaciones necesarias para ese primer recorrido.
5. Revisar el alcance y la autonomía.
6. Ejecutar y revisar el primer resultado.

Las tres experiencias comparten datos. Activar ventas para una agencia no debe crear otra copia de sus clientes.

La navegación propuesta debe permitir encontrar clientes, oportunidades, proyectos, resultados y pendientes. La asignación exacta de menús queda para diseño; debe adaptarse a las capacidades activas.

La información de agentes y ejecuciones sigue disponible, mientras la vista inicial responde qué se está haciendo, para quién, qué falta y cuánto ha costado.

## Primera versión propuesta

El producto debe cubrir los tres caminos mediante pilotos independientes: emprendedor primero, agencia después y comercial cuando sus integraciones estén comprobadas. El primer ensayo interno aprovecha las capacidades existentes y puede ocurrir en paralelo al diseño mínimo de agencia.

| Área | Capacidad de referencia del producto | Ampliación posterior |
| --- | --- | --- |
| Organización y ejecución | Reutilizar objetivos, agentes, tareas, revisiones y entregables | Equipos y procedimientos adicionales |
| Clientes y contactos | Registro, búsqueda, ficha, historial, responsables y duplicados | Segmentación y relaciones más avanzadas |
| Oportunidades | Etapas, cualificación, próxima acción, estado y vínculo con trabajo | Previsión y analítica comercial avanzada |
| Oferta y alcance | Información básica de servicio y versión aceptada del compromiso | Catálogos y propuestas más complejos |
| Entrega | Proyecto, tareas, revisiones y aceptación | Portal y gestión contractual avanzada |
| Comunicaciones | Un canal de correo y una ruta de agenda validados | Canales adicionales según demanda |
| Contexto | Documentos y archivos de negocio y cliente | Recuperación y administración de conocimiento más amplias |
| Automatización | Entradas, seguimientos y transferencias necesarias para los recorridos | Constructor general y catálogo amplio |
| Economía | Costes existentes y registros mínimos con fuente para evaluar resultados | Facturación, cobros y contabilidad conectados |
| Comercialización de Paperclip | Definir cómo se contrata, instala y soporta el piloto | Suscripciones y administración comercial completas |

No se requiere construir contabilidad completa, un marketplace público o un generador universal de procesos para demostrar estos primeros resultados.

### Condiciones comunes de aceptación

- El usuario puede inspeccionar el resultado y su estado.
- El recorrido conserva cliente u objetivo, responsable e historial.
- Una actualización o reintento no duplica acciones o registros de negocio.
- Las acciones respetan empresa, permisos y presupuesto.
- Los bloqueos requieren una acción identificable y se muestran con claridad.
- El resultado de una aplicación externa se comprueba antes de presentarlo como completado.
- Los recorridos que reutilicen funciones experimentales se califican antes de ofrecerlos como estables.

## Orden de desarrollo propuesto

El desarrollo se organiza en cuatro sprints de construcción, cada uno cerrando un guion de principio a fin. El detalle está en el [plan maestro](2026-10-21-plan-maestro-producto.md).

| Sprint | Nombre | Guion que queda funcionando |
| --- | --- | --- |
| S1 | El emprendedor entrega | Emprendedor: encargo por resultado, entregable aceptado, coste visible |
| S2 | CRM que los agentes usan | Agencia: clientes, contactos, oportunidades, brief, entrega y aislamiento |
| S3 | Vende solo | Comercial: lead, cualificación, correo y calendario reales, seguimiento |
| S4 | Producto que se vende solo | Los tres para terceros: creador de agentes, conexiones en dos clics, onboarding, métricas |

Los pilotos se hacen sobre el producto: interno al cierre del S1, agencia y comercial al cierre de S2 y S3, y tres externos durante el S4. La validación comercial de este documento se recoge en esos pilotos, no antes de construir.

Los agentes se utilizan desde el primer ensayo. F3 amplía acciones de negocio cuando el caso comercial las necesita; F4 añade continuidad recurrente. Tiempo y consumo se registran desde cada ensayo y las vistas agregadas llegan cuando se justifican.

El [registro F0](2026-10-21-producto/2026-10-21-f0-casos-y-evidencias.md) distingue el negocio propio seleccionado, su encargo pendiente y los perfiles de agencia y comercial sin seleccionar. El [backlog por piloto](2026-10-21-producto/2026-10-21-backlog-fases.md) define las entregas y dependencias. La compatibilidad se mantiene mediante regresiones cuando un cambio afecta una superficie.

Antes de cambios de modelo o API se sincronizan db, shared, server y ui y se actualizan especificaciones y mapas afectados. Los recorridos existentes siguen siendo la base de trabajo.

## Oferta y monetización por validar

Propuesta inicial:

- Una suscripción base por empresa operadora.
- Paquetes o capacidades orientados a emprendedor, agencia y comercial.
- Consumo de IA y herramientas explicado de forma transparente.
- Implantación y configuración asistidas como posible servicio adicional.

La unidad de cobro y los límites siguen pendientes. Deben compararse empresa, usuarios humanos, capacidades y consumo antes de elegir. El número de agentes por sí solo no demuestra valor para el comprador.

No hay precios aprobados. Para fijarlos necesitamos conocer coste de servir, mantenimiento de conexiones, soporte, frecuencia de uso y disposición a pagar por resultados concretos.

### Modalidad de servicio

Decidir cómo se ofrecerán instalación local, despliegue gestionado o servicio alojado. El modelo multiempresa del repositorio no demuestra por sí solo que exista un SaaS comercial completo.

Una oferta alojada añade necesidades de alta, aislamiento, propiedad de credenciales, copias, recuperación, soporte, medición de consumo y facturación. Su alcance debe definirse antes de venderla.

## Validación comercial

Seleccionar al menos un caso real representativo por camino para describir el recorrido y preparar pilotos. Esa selección sirve para diseñar; no constituye validación suficiente del segmento.

Para cada caso debemos recoger:

- Qué ocurre hoy y con qué frecuencia.
- Quién trabaja, quién decide y quién paga.
- Qué herramientas e información utiliza.
- Qué parte admite delegación y qué debe revisar una persona.
- Qué resultado considera útil y cómo lo acepta.
- Qué cuesta el proceso actual y qué mejora justificaría pagar.
- Qué esfuerzo de configuración y mantenimiento tolera.

Después se deben contrastar los patrones con compradores adicionales antes de generalizarlos. Los pilotos deben acordar sus criterios de éxito, registrar coste y recoger intención o compromiso de pago.

## Riesgos y decisiones pendientes

| Riesgo o decisión | Tratamiento propuesto |
| --- | --- |
| Dispersión entre tres caminos | Mantener una base compartida y un recorrido acotado por camino |
| Exceso de funcionalidades | Priorizar lo necesario para completar y revisar esos recorridos |
| Automatizar un proceso mal definido | Acordar entradas, decisiones y aceptación antes de automatizar |
| Confundir actividad con valor | Medir entregas aceptadas y hechos comerciales con evidencia |
| Datos duplicados o desactualizados | Identidad estable, procedencia y reglas de sincronización |
| Información mezclada entre clientes | Límites de acceso sobre contexto, trabajo y entregables |
| Acciones externas repetidas | Identificadores de operación y reconciliación de resultados inciertos |
| Coste de uso imprevisible | Presupuestos, visibilidad y medición del coste por recorrido |
| Dependencia de funciones experimentales | Calificar el recorrido antes de comprometer su disponibilidad |
| Prometer autonomía excesiva | Explicar capacidades y decisiones humanas con ejemplos comprobados |
| Agencias operadoras frente a implantadoras | Diferenciar modalidad, responsabilidades y facturación |
| Cambiar la identidad del producto sin contrato | Conservar la base de control y acordar las ampliaciones de especificación |

Quedan por concretar los tres primeros casos reales, el catálogo inicial de trabajos, las conexiones elegidas, los límites de autonomía, el modelo de datos definitivo, la modalidad de servicio y los precios.

## Próximo paso de definición

Concretar el producto o servicio propio, el encargo útil, su criterio de aceptación, presupuesto y coste anterior. Completar por separado la selección de agencia, negocio comercial y emprendedor externo en F0.

Cada caso completo permite avanzar en su recorrido y estimar los cambios observados. Crear tareas de desarrollo requiere una instrucción posterior; documentar esta estrategia mantiene la etapa actual de definición.

## Referencias comerciales

Estas referencias contextualizan la oferta de agentes y acciones de negocio; no demuestran demanda para Paperclip ni una ventaja competitiva validada.

- [HubSpot Breeze Agents](https://www.hubspot.com/products/artificial-intelligence/breeze-ai-agents)
- [Salesforce Agentforce Platform](https://www.salesforce.com/platform/agentforce-platform)

Las comparaciones detalladas, condiciones y precios requieren investigación actualizada cuando se prepare la oferta comercial.

## Plan detallado por páginas y fases

El [plan maestro de implementación](2026-10-21-plan-maestro-producto.md) desarrolla esta estrategia en documentación global y un MD por página, con qué conservar, cambiar y añadir, justificaciones, criterios de aceptación, tareas, dependencias y trabajo en paralelo. Incluye un backlog por fases e inventario de rutas; sus detalles siguen siendo propuestas para revisar antes de implementar.
