# Plan UX: conservar la base y simplificar los sprints

Fecha: 2026-10-22. Estado: plan de implementación; cambios de producto pendientes.

## Decisión principal

**Tareas para pedir y seguir trabajo. Proyectos para agruparlo. Clientes para saber para quién se trabaja.** El usuario no debe decidir si algo es tarea, encargo, objetivo comercial o ejecución antes de empezar.

Conservaremos las páginas originales como base de calidad. Integraremos las capacidades útiles de los sprints en sus recorridos. **«Encargos» desaparece como concepto de navegación y como elección obligatoria al crear trabajo.** Sus criterios de aceptación, presupuesto, contexto y revisión permanecen.

Este plan revisa la [propuesta de simplificación anterior](2026-10-22-simplificacion-producto-navegacion.md): sustituye «Trabajo → Encargos como vista inicial» por **Tareas como entrada directa**. Tampoco propone crear páginas contenedoras «Trabajo», «Equipo» o «Automatizaciones» por el mero hecho de agrupar enlaces. Un grupo de navegación puede ser solamente un grupo.

## Base y alcance de la revisión

Se ha revisado el código integrado conservado en `tmp/s4-integracion-20261022`, correspondiente a la base de la UI publicada `s95-20261022-sidebar-ui-4`, además de los planes anteriores. La raíz del repositorio contiene otra variante parcial: no debe usarse para sobrescribir la integración.

Revisión repartida entre dos subagentes GPT-6 Luna —páginas originales y relación tareas/encargos— y una revisión de Claude Code Sonnet 5.5 sobre conservación de patrones y configuración. La integración de decisiones corresponde al agente principal. No es una nueva validación visual ni una prueba con compradores. Las cualidades señaladas describen capacidades observadas en código; las mejoras de comodidad deberán medirse en los recorridos de aceptación.

Las tres revisiones están terminadas. Claude Code devolvió resultado correcto con `claude-sonnet-5-5`; su recibo local está en `tmp/ux-claude-review-result.json`. La revisión cruzada añade dos requisitos: reutilizar la [sidebar contextual de Ajustes](../../ui/src/components/CompanySettingsSidebar.tsx), con sus controles de visibilidad y plugins, y revisar también las menciones de Encargos en Inicio, preparación y onboarding. Se descarta el simple cambio de nombre: el plan integra la experiencia en la tarea principal conservando el modelo interno. Tampoco se asume que los canales CRM puedan convertirse en canales de agentes por compartir un menú.

El [inventario de 106 superficies](2026-10-21-producto/2026-10-21-inventario-rutas.md) sigue siendo la referencia de cobertura de rutas, detalles, alias y propuestas. No son 106 páginas principales. El [análisis anterior](2026-10-22-simplificacion-producto-navegacion.md) conserva el inventario de los 30 enlaces de Negocio y los demás accesos. Aquí se define cómo ejecutar su simplificación sin rehacer lo que funciona.

## 1. Qué preservamos de las páginas originales

| Página o familia existente | Calidad funcional que conservar | Ampliación concreta y justificación |
| --- | --- | --- |
| **Tareas** | Vistas y filtros, presentación configurable, paginación, participación, jerarquía y navegación por URL. | Cliente, resultado esperado y revisión como contexto opcional. El listado sigue siendo el lugar único para localizar trabajo, sin mezclar en pantalla la tarea y su registro de encargo como dos filas. |
| **Detalle de tarea** | Conversación, actividad, relacionados, archivos, preguntas/aprobaciones, borradores y ejecución controlada. | Añadir componentes pequeños para criterios, presupuesto y revisión; aprovechar los paneles existentes. No convertir el chat en una sucesión de tarjetas administrativas. |
| **Proyectos y ficha** | Agrupación, tareas del proyecto, resumen, configuración y espacios de trabajo. | Cliente opcional y resumen de resultados/revisiones. Un proyecto puede contener tareas simples y tareas con revisión; trabajar no exige crear primero un proyecto. |
| **Bandeja** | Tipos de pendientes con acciones propias, preferencias y alcance por empresa. | Incorporar referencias a revisiones nuevas preservando su identidad. Separar preferencias de notificación del trabajo pendiente. Mantener la variante de Bandeja integrada en Tareas cuando su flag esté activo. |
| **Inicio** | Resumen operativo y acceso al trabajo que necesita intervención. | Mostrar resultados ya disponibles y preparación incompleta. Evitar duplicar otro panel «Resultados» en el menú y evitar un dashboard de todos los módulos. |
| **Agentes y ficha** | Lista y perfiles existentes, instrucciones, historial, actividad, responsable y preferencias de agente principal/favoritos. | Plantillas al añadir agentes; autonomía desde el perfil y una vista global enlazada. Conservar la navegación directa al agente. |
| **Archivos / Artefactos** | Explorador, búsqueda/navegación, subida, vista previa y vínculos al trabajo. | Contexto, entregables y medios en el mismo sistema. «Archivos» puede ser el nombre visible; se conservan identificadores, versiones y enlaces. |
| **Rutinas** | Programación, disparadores y seguimiento existentes. | Incorporar procedimientos reutilizables como plantillas/pasos relacionados. No renombrar todo a «Automatizaciones» ni construir otro motor para agrupar pantallas. |
| **Apps y conexiones** | Descubrimiento, configuración por proveedor, permisos, identidades, incidencias y detalles existentes. | Reubicar configuración de canales, chat web y sincronización CRM. Una entrada coherente, manteniendo contratos distintos según audiencia y proveedor. |
| **Ajustes y perfil** | Formularios existentes, errores locales, guardado, miembros, secretos, configuración de empresa/instancia y permisos. | Integrar idioma, notificaciones y seguridad en su ámbito correcto. No añadir diez pestañas a una barra ya extensa. |
| **Costes, presupuestos y actividad** | Trazabilidad, consumo y controles operativos. | Accesos secundarios claros y alertas desde Inicio/tarea. La suscripción a Paperclip sigue separada del coste de agentes y de los cobros a clientes. |
| **Buscar, favoritos, recientes y móvil** | Atajos, selección de empresa, navegación rápida y continuidad de contexto. | Indexar los destinos nuevos y mantener atrás/filtros/selección. Conservar los arreglos publicados de prefijos de empresa y foco del menú móvil. |
| **Objetivos, entornos, ejecución y otras superficies avanzadas** | Relaciones y herramientas existentes cuando estén habilitadas. | Acceso contextual desde proyecto/agente o administración. No sustituir objetivos estratégicos por tareas ni activar flags para justificar nuevos menús. |
| **Acceso, onboarding, páginas públicas y plugins** | Autenticación, invitaciones, reservas/revisión públicas, extensiones y compatibilidad. | Ajustar enlaces afectados, no rediseñar estos flujos como parte de esta limpieza. Un enlace público no se redirige a una ficha interna que exige iniciar sesión. |

Patrones que sirven de referencia: [lista de Tareas](../../ui/src/pages/Issues.tsx), [ficha de tarea](../../ui/src/pages/IssueDetail.tsx), [Bandeja](../../ui/src/pages/Inbox.tsx), [explorador de archivos](../../ui/src/pages/artifacts/ArtifactsExplorer.tsx), [detalle de conexión](../../ui/src/pages/apps/AppDetail.tsx) y [navegación de ajustes existente](../../ui/src/components/access/CompanySettingsNav.tsx).

La ficha de tarea ya es un archivo muy grande. Sus ampliaciones deben vivir en componentes separados, con una integración pequeña, sin una reescritura masiva concurrente. Usar los componentes y tokens de [DESIGN.md](../../DESIGN.md); conservar densidad, estados, accesibilidad y comportamiento móvil.

## 2. Tareas, proyectos y la retirada de «Encargos»

### Modelo que ve la persona

| Concepto | Significado | Ejemplo |
| --- | --- | --- |
| Tarea | Algo que hay que hacer y cuyo avance puedo seguir. | «Preparar la página de lanzamiento». |
| Proyecto | Agrupación opcional de varias tareas con un propósito común. | «Lanzamiento de octubre». |
| Cliente | Persona u organización para quien se trabaja; opcional en trabajo interno. | «Cliente A». |
| Resultado y revisión | Qué debe entregar una tarea y cómo decidir si está bien. Son propiedades del trabajo. | «Página publicada; revisar texto y formulario antes de aceptar». |

**Un solo botón «Nueva tarea».** Mantener el formulario original y sus valores por defecto. Una sección progresiva «Resultado y revisión» permite añadir criterios, entregable y presupuesto cuando haga falta. No colocar primero una pantalla «¿Tarea o encargo?», ni sustituir «encargo» por otro sustantivo que cree la misma confusión.

Tampoco se exige cliente, proyecto, propuesta o acuerdo para trabajo interno. Cuando un servicio contratado requiere revisión, sus condiciones aparecen ya informadas y no se pueden eludir desmarcando una opción de interfaz.

### Lo que realmente existe debajo

El [servicio de encargos](../../server/src/services/assignments.ts) crea en una transacción un `goal` de tipo `assignment` y su tarea principal (`rootIssueId`). Reserva cuota, usa idempotencia y enlaza presupuesto, revisión y contexto. **No son dos tareas independientes.** Los acuerdos recurrentes también apuntan a esta entidad.

La [derivación de estado](../../server/src/services/assignment-status.ts) distingue ejecución y aceptación: una tarea terminada puede seguir pendiente de revisión. Renombrar textos sin integrar esta relación dejaría dos experiencias; borrar el modelo perdería capacidades.

### Implementación mínima, por este orden

1. **Lectura asociada:** resolver desde una tarea el registro de aceptación que le pertenece, con permisos de la tarea y de la empresa. Reutilizar relaciones existentes; no cargar todos los encargos de la empresa para filtrar en el navegador. Resolver metadatos del listado en lote, sin una petición adicional por fila.
2. **Ficha única:** montar criterios, entregable, presupuesto, contexto utilizado y revisión en el detalle de la tarea principal. Mostrar un estado de ejecución y una indicación de revisión cuando corresponda, cada uno con su significado; no inventar una equivalencia entre «terminado» y «aceptado». Subtareas siguen siendo tareas.
3. **Creación única:** el formulario escoge el contrato adecuado por las capacidades solicitadas. Una tarea simple sigue usando su contrato actual; con aceptación utiliza la creación transaccional existente. Nunca llamar a ambos endpoints para un mismo envío. Conservar la misma clave idempotente tras un error de red o doble clic, y abrir la tarea principal devuelta.
4. **Edición coherente:** para tareas asociadas, cambiar título, responsable, proyecto o cancelar debe mantener sincronizados los registros según las reglas actuales. Definir esta integración antes de habilitar la edición desde dos superficies. Mantener presupuesto explícito: el cero actual no debe convertirse silenciosamente en «sin límite».
5. **Listado único:** las tareas principales aparecen una vez en Tareas. Añadir filtro «Pendientes de revisión» y etiquetas contextuales si aportan información. Conservar filtros y exclusión predeterminada de trabajo automático; no introducir todos los trabajos del CRM en la bandeja de todo el mundo.
6. **Compatibilidad:** `/assignments/:id` resuelve la tarea asociada dentro de la empresa autorizada y abre su sección relevante. Conservar query, hash y contexto cuando corresponda. Si falta tarea principal, mantener una ficha de recuperación legible; no crear una automáticamente al abrir el enlace. `/assignments` conduce a una vista filtrada equivalente. Retirar el enlace y el vocabulario antiguo solo cuando el destino funcione. Actualizar accesos de `AssignmentDashboard`, `ProductizationWorkbench` y `ProductOnboardingPanel`, además de sidebar, breadcrumbs, vacíos y textos traducidos; conservar los IDs de capacidades del runner.
7. **Alcance técnico:** conservar inicialmente tabla, IDs, APIs y herramientas de agentes. Reutilizar las mismas revisiones, periodos recurrentes, costes y auditoría. Una eventual consolidación del modelo sería otro proyecto, no un requisito para simplificar la experiencia.

Ejemplo final: **Tareas → Nueva tarea → «Preparar cuatro artículos» → añadir criterios de revisión → Crear → conversación y resultados en la misma ficha.** Si requiere muchas acciones, se descompone en subtareas; si pertenece a una campaña, se añade a un proyecto. La persona nunca necesita abrir «Encargos».

## 3. Destino de las páginas añadidas y ampliadas en los sprints

La tabla cubre las 30 entradas de Negocio y las superficies Encargos, Contexto y Oficina. Agrupa recorridos; no ordena borrar las rutas o componentes al mover el enlace.

| Superficie actual | Qué haremos | Motivo y condición |
| --- | --- | --- |
| Encargos | Capacidades dentro de Tareas y ficha; compatibilidad de URLs. | El trabajo ya tiene una tarea principal; evita pedir dos modelos mentales. |
| Contexto | Vista/filtros de Archivos y selector desde tarea/proyecto. | Comparte almacenamiento; mantener audiencia, vigencia y rol de cada archivo. |
| Oficina | Vista opcional del equipo, fijable. | Conservar su valor visual sin obligar a usarla para gestionar agentes. |
| Puesta en marcha | Preparación reanudable desde Inicio; accesible después desde ajustes. | Algo que se completa no necesita ocupar el menú diario. |
| Crear equipo / constructor de negocio | Acción en Equipo para seleccionar y contratar; editor avanzado separado. | Hoy guardar un borrador no contrata. No debe prometer una acción que no hace. |
| Catálogo privado y catálogo público | Plantillas al añadir/configurar equipo; biblioteca privada/compartida claramente identificada. | Son configuraciones de agentes, no el catálogo de servicios vendidos. Mantener versiones; moderación en administración. |
| Resultados | Informe dentro de Inicio, conservando URL y filtros. | Ya está incrustado; evitar un segundo resumen competidor. |
| Plantillas de vídeo y cola de medios | Crear vídeo desde Archivos/tarea; estado contextual y vista global de producción para operadores. | Crear, editar y revisar un resultado forma un recorrido. No ocultar prioridades, fallos ni trabajos en curso. |
| Clientes y contactos | Clientes como destino; Contactos como vista de la cartera y acceso en la ficha. | Mantener búsqueda global de contactos y contactos sin cliente. |
| Importar contactos | Acción Importar desde Contactos, con su asistente reanudable si hace falta. | Es una operación, no una sección de negocio. Mantener previsualización y confirmación. |
| Leads y oportunidades | **Ventas**, con vistas Leads y Oportunidades y sus detalles existentes. | Un lugar para seguimiento comercial; se conservan cualificación, conversión y etapas distintas. |
| Propuestas | Vista en Ventas y acceso desde oportunidad/cliente. | Mantener versiones, aceptación, importes y enlaces públicos sin reconstruir la propuesta. |
| Acuerdos de servicio | Servicios recurrentes en la ficha de cliente y vista global de cartera. | Conservar periodos y generación de trabajo; no exigir abrir cada cliente para detectar vencimientos. |
| Formularios de leads | Configuración de captación desde Ventas. | Conservar biblioteca y publicación, sin otro destino principal. |
| Conversaciones y llamadas CRM | Conversaciones como destino; llamadas como vista/tipo relacionado. | Los mensajes externos se atienden aquí. No confundirlos con hablar con agentes. |
| Agenda | Acceso contextual y fijable para quien agenda a diario. | Reuniones y reservas merecen acceso directo según uso, sin imponérselo al emprendedor interno. |
| Sincronización CRM, canales y chat web | Detalles dentro de Apps/conexiones, con accesos desde la conversación que lo necesita. | Configuración y diagnóstico junto al proveedor. Mantener separados los canales de clientes y los de agentes/operadores. |
| Playbooks | Procedimientos/plantillas accesibles desde Rutinas y al crear trabajo. | Reutilizar pasos sin exigir aprender otra sección; no fusionar a ciegas procedimientos y programación. |
| Autonomía | Permisos desde cada agente y vista global enlazada en Equipo. | Mantener niveles, concesiones, revocación, historial y aprobaciones; evaluación técnica en avanzado. |
| Notificaciones | Pendientes hacia Bandeja; preferencias en perfil. | Un mismo evento puede tener avisos, pero una sola decisión pendiente. Leer un aviso no equivale a resolverlo. |
| Idioma | Preferencia del perfil/menú de cuenta. | Mantener el ámbito actual por usuario y navegador, y la protección al cambiar de cuenta. |
| Seguridad | Acceso/sesiones en perfil; retención en empresa; eliminación en cuenta comercial. | Son tres ámbitos diferentes, con permisos y confirmaciones propios. |
| Cuentas y empresas | Administración de organizaciones y accesos desde cuenta. | No confundir empresas operadoras con clientes del CRM; sustituir IDs manuales por selectores autorizados. |
| Facturación de Paperclip | Plan y facturación de la cuenta comercial. | No confundir suscripción, coste de agentes y facturación al cliente. |
| API y webhooks | Desarrolladores en ajustes de empresa. | Mantener scopes, revocación y secretos; quitar lenguaje técnico de la operación diaria. |
| Agencia | Administración de instalaciones gestionadas para terceros. | Su implementación crea/administra empresas de Paperclip. Una agencia de servicios opera normalmente desde Clientes y Proyectos; no fusionar sus empresas actuales. |

Si una función necesita un editor complejo o una URL compartible, **conserva página propia**. El objetivo es que tenga una entrada comprensible, no convertir todo en modales ni reducir el número de archivos React.

## 4. Navegación propuesta: continuidad antes que invención

```text
Inicio
Bandeja                       (o la vista combinada existente de Tareas)

Trabajo                       ← grupo, no nueva página
  Tareas
  Proyectos
  Archivos
  Rutinas

Negocio                       ← cuando se utilizan funciones comerciales
  Clientes
  Ventas
  Conversaciones
  Agenda                      ← fijable

Equipo                        ← conservar lista, favoritos y acceso a todos los agentes

Apps · Costes/actividad · Ajustes
```

Buscar, crear tarea, favoritos y recientes siguen accesibles. La agrupación no añade un clic antes de Tareas o Proyectos. Las funciones comerciales se eligen durante la preparación o desde una acción «Añadir funciones»; una colección vacía no desaparece e impide comenzar. La configuración inicial propone un menú, no encierra al usuario en uno de los tres caminos ni concede permisos.

Se parte de los patrones actuales. No construir un editor general de menús, un nuevo sistema de tabs o personalización compleja para resolver esta limpieza. Mantener accesos de uso frecuente fijables cuando el producto ya ofrezca ese mecanismo; añadir fijación nueva solo donde sea necesaria y con alcance acotado.

## 5. Fases de ejecución y entregables

| Fase | Trabajo y entregable verificable | Dependencias / salida |
| --- | --- | --- |
| **F0 — Base y contratos** | Registrar checkout/estado actual y archivos en uso por otros agentes. Confirmar vocabulario anterior, relación tarea–aceptación, ámbitos de ajustes y destinos. Capturar una referencia local de Tareas, Proyecto, Bandeja y Apps para comparar interacciones. | Antes de tocar navegación. El plan actual cubre la propuesta; falta captura de referencia y confirmar el estado al implementar. |
| **F1 — Quitar ruido con destinos reales** | Reubicar idioma/cuenta/facturación/API; introducir accesos a configuración desde Apps; Importar como acción; preparación desde Inicio. El destino debe abrir, conservar permisos y estar enlazado antes de quitar cada entrada. | No depende de integrar encargos. No ocultar aún Encargos si sus capacidades siguen aisladas. Entregable: menos entradas, mismas funciones localizables. |
| **F2 — Unificar trabajo** | Ejecutar los siete pasos de la sección 2: lectura asociada, ficha, creación, edición, listado, alias y conservación del modelo. | F0; la navegación de Tareas cambia después de integrar sus componentes. Entregable: un recorrido completo sin «Encargos», sin trabajos duplicados. |
| **F3 — Integrar negocio y archivos** | Ventas y cartera sobre páginas existentes; contexto/medios en Archivos; procedimientos en Rutinas; plantillas/autonomía en Equipo. Cada bloque se entrega de manera independiente. | CRM y archivos pueden avanzar en paralelo con F2; sus enlaces definitivos a trabajo esperan su contrato. No crear un nuevo megaformulario por área. |
| **F4 — Recorridos, compatibilidad y retirada** | Revisar los tres caminos, móvil/teclado, URLs antiguas y flags; completar traducciones y mapas afectados. Retirar entradas/componentes duplicados solo cuando la alternativa cubra sus casos. | F1–F3 para las superficies incluidas. Entregable: evidencia de recorridos y lista explícita de límites, sin porcentajes estimados. |

**Prioridad inmediata:** primero F1 y la ficha única de F2. Unificar la experiencia de trabajo aporta más que rediseñar catálogos, marketplace, Oficina o constructor avanzado. Esas superficies se reubican y conservan, sin ampliarlas en esta tanda.

## 6. Reparto entre GPT y Claude sin pisarse

Los siguientes son paquetes de implementación propuestos; las revisiones de este documento no los han ejecutado. Modelos preferidos: **GPT-6 Luna** y **Claude Code Sonnet 5.5**, cuya disponibilidad debe comprobarse al lanzar cada tanda.

| Dueño | Paquete y archivos de propiedad | Entrega / depende de |
| --- | --- | --- |
| **Coordinador Codex** | `App.tsx`, `Sidebar*.tsx`, `CompanySettingsSidebar*.tsx`, `components/access/CompanySettingsNav.tsx`, `Layout*.tsx`, `MobileBottomNav.tsx`, `lib/company-routes*`, `lib/queryKeys.ts`, contexto global de diálogos, integración de perfil, locales compartidos y mapas. | Integra registros de rutas, enlaces, traducciones y paneles. Es el único que cambia estos archivos compartidos. |
| **GPT A — trabajo** | `pages/Issues.tsx`, `pages/IssueDetail.tsx`, `pages/Assignments.tsx`, `components/NewIssueDialog.tsx`, `AssignmentDashboard`, `AssignmentCosts`, `DeliverableReviewPanel`; componentes nuevos acotados de revisión; `api/assignments.ts`, rutas/servicio de assignments y contrato compartido de assignment cuando sea necesario. | F2 completo con pruebas de contrato. No modificar el servicio genérico de issues sin ampliar expresamente su propiedad tras revisar reglas. Publicar primero interfaz de lectura/creación para los demás. |
| **GPT B — clientes y ventas** | `pages/crm/*`, propuestas, acuerdos y formularios; composición local de vistas comerciales y sus API clients si es necesario. | F3 comercial; usa contrato de trabajo de A. Propone rutas al coordinador, no toca App/Sidebar. Conserva IDs, procesos y páginas públicas. |
| **Claude A — configuración** | `LanguageSettings`, `NotificationSettings`, `SecuritySettings`, `PublicApiSettings`, cuentas/facturación, canales/chat web/CRM sync; componentes extraídos propios. | F1. Propone entradas para perfil/ajustes y Apps sin escribir los archivos que tengan otro dueño. Separar seguridad por ámbito antes de moverla. |
| **GPT C — archivos y medios** | `pages/Context.tsx`, `pages/artifacts/*`, `MediaTemplates`, `MediaQueue` y componentes propios de producción. | F3 archivos. Reutiliza `DeliverableReviewPanel` por su contrato; no lo edita mientras A lo tenga reservado. |
| **Claude B — equipo y rutinas** | `pages/Agents.tsx`, `AgentDetail.tsx`, `Routines.tsx`, `Playbooks.tsx`, `Autonomy.tsx`, preparación/constructor/catálogos y Oficina; componentes locales propios. | F3 equipo. Proponer integración pequeña por superficie; no reescribir todos esos archivos. Los cambios de Inicio compartido se entregan al coordinador. |
| **GPT D / Claude revisor — aceptación** | Lectura cruzada; pruebas específicas en archivos reservados tras cerrar cada paquete; informe de recorrido. | F4. Contrastar preservación de patrones originales, no solo que aparezca el nuevo enlace. No corregir archivos ajenos durante la revisión. |

Ejecución con el límite actual de cuatro agentes gestionados: coordinador y hasta tres trabajadores simultáneos. Una llamada externa a Claude también consume revisión y coordinación: limitar la tanda a tres paquetes activos, no usarla para abrir una cuarta línea concurrente sin control.

1. **Tanda A:** GPT A + GPT B + Claude A. El coordinador integra solo cambios de navegación cuyo destino esté terminado.
2. **Tanda B:** GPT C + Claude B + un revisor GPT de la tanda A. Mantener bloqueados los archivos compartidos hasta entregar su dueño.
3. **Tanda C:** revisión cruzada Claude de trabajo y GPT de configuración; coordinador cierra compatibilidad y verificaciones.

Reglas para cada encargo a un agente: especificar checkout y archivos; avisar que hay otros agentes; prohibir revertir cambios ajenos; leer reglas aplicables; acordar interfaces antes de editar; comparar el archivo con su estado inicial antes de integrar. Un agente no cambia un archivo de otro para resolver rápido un import. Las claves de traducción se entregan al coordinador y se añaden a todos los idiomas mediante el mecanismo actual.

**Esta ejecución no incluye commits, push, fusión a principal ni despliegue.** Se preparará y verificará localmente antes de decidir la publicación de esta reorganización.

## 7. Criterios de comodidad y aceptación

Objetivos verificables, todavía no medidos:

- **Encontrar trabajo:** Tareas y Proyectos abren directamente desde la navegación. Volver de una ficha conserva filtros, vista y contexto.
- **Crear:** una única acción «Nueva tarea», sin selector tarea/encargo ni obligación de cliente/proyecto; las condiciones adicionales aparecen cuando son pertinentes. Una operación, una tarea principal, también tras reintentar.
- **Revisar:** desde una tarea se localiza y revisa su resultado en un máximo de dos acciones de navegación. No hace falta conocer «Contexto», «Artefacto» o «Encargo» para completar ese recorrido.
- **Localizar configuración:** idioma, facturación, conexión y seguridad se encuentran desde cuenta/Ajustes/Apps con etiquetas claras y sin IDs manuales para identificar personas o empresas disponibles.
- **Conservar información:** un listado de 100 tareas no genera 100 peticiones para obtener aceptación; mover vistas no duplica archivos ni cuenta dos veces un resultado o un pendiente.
- **Móvil y teclado:** creación, navegación, revisión y respuesta utilizables; foco correcto al abrir/cerrar paneles; botón principal y cancelar en la misma fila según DESIGN.
- **Sin regresión de arranque:** conservar páginas y paneles pesados bajo demanda, carga diferida de idiomas y las correcciones del arranque. Agrupar enlaces no debe importar todos los módulos en el shell.

| Recorrido | Qué debe poder hacerse | Qué sería un fallo |
| --- | --- | --- |
| Emprendedor | Crear tarea interna → añadir materiales → recibir resultado → pedir cambios/aceptar. Proyecto opcional. | Necesitar cliente, acuerdo o aprender el concepto encargo para empezar. |
| Agencia de servicios | Cliente → proyecto → tareas → revisión de versión → entrega; localizar servicios recurrentes y próximos periodos. | Confundir cliente con otra empresa operadora; tener que crear dos veces el trabajo. |
| Comercial | Lead → cualificar → conversación → oportunidad/propuesta → reunión o siguiente tarea. | Saltar entre configuraciones para responder, perder el vínculo con la persona o duplicar leads al convertir. |

En cada recorrido registrar éxito, dudas, retrocesos, acciones de navegación y tiempo, comparándolo con la referencia F0. La lectura de código y los datos sintéticos no acreditan comodidad para un comprador; la observación con usuarios será evidencia separada. No introducir telemetría nueva para esta revisión sin su proceso específico.

## 8. Verificación técnica proporcional y cierre

Primero comprobaciones del paquete: creación idempotente; una tarea principal por operación y periodo; permisos de lectura de tareas privadas; ejecución terminada sin revisión aceptada; cancelación/edición sincronizadas; versiones de entregable; avisos sin duplicar decisiones; separación usuario/empresa/cuenta comercial.

Después comprobar prefijos de empresa, enlaces antiguos, permisos y flags de ambos layouts, conservación de filtros y comportamiento móvil. Mantener páginas públicas y herramientas de agentes compatibles. Actualizar las [fichas de Tareas](2026-10-21-producto/paginas/2026-10-21-tareas.md), [detalle de tarea](2026-10-21-producto/paginas/2026-10-21-tarea.md), [Proyectos](2026-10-21-producto/paginas/2026-10-21-proyectos.md), [Bandeja](2026-10-21-producto/paginas/2026-10-21-bandeja.md), [Archivos](2026-10-21-producto/paginas/2026-10-21-artefactos.md), [Apps](2026-10-21-producto/paginas/2026-10-21-apps.md) y [Ajustes](2026-10-21-producto/paginas/2026-10-21-ajustes-empresa.md) cuando cambie su comportamiento implementado.

Al integrar cambios amplios: checks de idiomas y tokens, typecheck, tests y build exigidos por AGENTS; comprobaciones de mapas si se editan. Pruebas de navegador centradas en estos recorridos, con la fuente de datos y las limitaciones identificadas. Conservar fallos y reintentos en la evidencia.

**Definición de cierre:** las capacidades siguen disponibles, los conceptos visibles son consistentes y cada recorrido se completa usando las páginas conservadas. Reducir enlaces o añadir pestañas por sí solo no cumple este plan.

## Estado de esta entrega

La implementación local de este plan se registra en [Implementación UX simplificada: estado y evidencia](2026-10-22-implementacion-ux-simplificada.md). Ese registro distingue los cambios de código, las comprobaciones realizadas y las validaciones pendientes. Esta reorganización no incluye publicación, commits ni push y no cambia los porcentajes de los sprints. Sin contexto de issue/heartbeat de Paperclip, los documentos se entregan como archivos locales del proyecto.
