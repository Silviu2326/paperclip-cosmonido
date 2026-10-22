# Arquitectura global del producto y trabajo transversal

Fecha: 2026-10-21
Estado: propuesta de implementación posterior a la definición de alcance

[Plan maestro](../2026-10-21-plan-maestro-producto.md) · [F0](2026-10-21-f0-casos-y-evidencias.md) · [Contratos](2026-10-21-contratos-datos-acceso.md) · [Validación](2026-10-21-validacion-lanzamiento.md)

## Alcance y decisiones

El alcance acordado cubre emprendedores, agencias y equipos comerciales. El producto conserva su base de control de agentes y añade relaciones de negocio sobre el trabajo. Los detalles de estas páginas y las tareas son propuestas; no constituyen autorización para ejecutar cambios de producto.

La documentación toma el árbol de trabajo local como referencia. Incluye cambios previos del usuario y superficies experimentales. Un componente encontrado no demuestra aceptación en producción. Los documentos de cada página explican su base y sus ampliaciones.

La estrategia original sigue en [definición de producto](../2026-10-21-estrategia-producto-tres-caminos.md). [SPEC implementation](../../SPEC-implementation.md) conserva la autoridad del contrato V1. Conocimiento de negocio, gestión comercial completa y economía del negocio amplían ese contrato y deberán alinearse antes de implementarse.

## Aplicación incremental

El emprendedor puede probar objetivo, tarea, agente, archivos y coste existentes mientras se concreta el siguiente contrato de agencia. Las responsabilidades G son una referencia por área, no once contratos previos obligatorios.

Para agencia se cierran cliente/contacto, acceso, brief/aceptación y contexto: G02.A, G03.A, G07.A y G09.A. El contrato de correo y etapas se concreta para comercial. La economía ampliada, el portal y el SaaS se diseñan al elegir esas capacidades.

Los agentes actuales están disponibles desde el primer ensayo. F3 incorpora las acciones de negocio elegidas y F4 amplía la continuidad automatizada. La auditoría y los permisos de una operación se añaden con su implementación. Tiempo y costes pueden medirse con las fuentes actuales y un registro manual antes de construir agregados.

G20.E, G20.A y G20.C son decisiones independientes. La prueba interna del constructor se distingue de la valoración comercial externa.

## Estructura compartida

Una empresa de Paperclip opera con sus agentes, usuarios y políticas. Dentro de ella mantiene clientes, contactos, oportunidades, compromisos y proyectos. El emprendedor puede trabajar en iniciativas internas sin cliente. Una agencia puede atender varios clientes sin crear varias empresas operadoras.

Los tres caminos comparten dominio, ejecución, contexto, comunicaciones y gobierno. Cambian las entradas, vistas iniciales, procedimientos y métricas. Las preferencias de camino son de empresa; los flags experimentales existentes siguen teniendo su ámbito actual de instancia. Activar un camino no concede permisos.

La navegación debe distinguir:

- Negocio: clientes, contactos, leads, oportunidades, oferta y propuestas.
- Trabajo: proyectos, tareas, entregables, rutinas y objetivos.
- Atención: conversaciones externas, agenda y decisiones pendientes.
- Capacidades: agentes, equipos, skills y aplicaciones.
- Administración: acceso, costes, presupuestos, entornos y auditoría.

Son agrupaciones para revisar, no una orden de añadir cinco menús ni de mover todas las páginas existentes. Mantener enlaces, filtros y rutas antiguas hasta resolver su compatibilidad.

## Qué mantenemos cambiamos y añadimos

| Decisión | Tratamiento | Justificación |
| --- | --- | --- |
| Empresa, agentes, tareas y objetivos | Mantener modelos y garantías vigentes | Permiten ejecutar sin reconstruir el control plane |
| Archivos y entregables | Mantener Entrada y Salida y añadir relaciones y audiencia | Conserva versiones y evita otro almacén |
| Clientes, contactos y ventas | Añadir contratos de dominio y vistas propias | El trabajo necesita identidad comercial y continuidad |
| Inicio y navegación | Adaptar por capacidades sin romper alias | Los tres compradores priorizan resultados diferentes |
| Procesos y rutinas | Reutilizar motor y añadir semántica comercial | Evita automatizaciones incompatibles entre módulos |
| Permisos y gobierno | Mantener enforcement y ampliar sujetos y acciones | Una nueva interfaz no puede ampliar autoridad |
| Medición y dinero | Ampliar fuentes, cobertura y atribución | Actividad, ingresos, cobros y costes requieren medidas distintas |
| Despliegue y venta del servicio | Definir modalidad antes de ampliar operación | Multiempresa local no implica SaaS comercial completo |

## Responsabilidades por capa

| Capa | Responsabilidad | Lo que no debe duplicarse |
| --- | --- | --- |
| packages/db | Persistencia, claves, relaciones, índices y migraciones | Otro almacén de archivos o libro de costes sin necesidad probada |
| packages/shared | Tipos, estados, validators y contratos de acciones y consultas | Reglas de negocio divergentes por pantalla |
| server | Autorización, transacciones, conflictos, auditoría y adaptadores de proveedor | Permisos basados solo en controles de interfaz |
| ui | Presentación, formularios, filtros, navegación y explicación de estado | Estados de negocio calculados solo a partir de caché local |
| Adaptadores y herramientas | Ejecutar operaciones autorizadas y devolver recibos | Lógica comercial que evita el servicio de dominio |
| Skills y equipos | Procedimientos, contexto y configuración reutilizable | Una autoridad de seguridad establecida por texto del agente |

Una operación de cliente debe usar el mismo servicio si procede de una persona, un agente, una rutina o una integración. La superficie de entrada no debe decidir por sí sola qué permisos se aplican.

## Identidad y autorización

Todas las entidades de negocio pertenecen a una empresa. Comprobar acceso al registro y a cada referencia relacionada en rutas, servicios, herramientas y proyecciones.

Reutilizar membresías, permisos y ACL de proyecto o tarea. Mantener company-open como regla vigente donde aplique; no introducir privacidad global ni una plataforma RBAC nueva por este plan. Definir en G03 la audiencia de cada nueva entidad y cómo se combina con recursos privados.

Conocer un cliente no concede acceso a sus proyectos privados. Las proyecciones solo muestran campos, recuentos y enlaces autorizados. Una relación comercial nunca publica implícitamente archivos o contexto restringido. Revisar cachés y claves de consulta al cambiar de empresa o de principal.

Los contactos son personas externas al CRM. Los usuarios internos y agentes son principales con permisos. Un portal futuro requiere identidad externa limitada, no reutilizar el contexto de board de control completo.

## Procesos por etapas

El repositorio ya contiene pipelines, etapas, transiciones, automatizaciones y casos. También contiene casos duraderos fuera de ese motor. G06 debe decidir cómo expresar ventas y entrega sin confundir ambos modelos.

Comparar antes de escoger:

1. Identidad propia de cliente y oportunidad.
2. Campos tipados, relaciones, búsqueda y reporting.
3. Transiciones, propuestas de movimiento y revisión.
4. Versiones, leases, idempotencia y recuperación.
5. Compatibilidad con procesos actuales y flags experimentales.

No introducir otro motor de estados sin documentar qué requisito no puede satisfacer el existente. Tampoco forzar todo el dominio a campos JSON sin integridad o consultas adecuadas.

## Alcance y entrega

El compromiso es una revisión aceptada con alcance y condiciones. Una oferta actualizada no reescribe un acuerdo. Un cambio de alcance genera una nueva revisión relacionada y una decisión de aceptación cuando corresponde.

Un proyecto puede ser interno o provenir de un acuerdo. Las tareas conservan asignación única y checkout atómico. Completar una tarea, aprobar internamente una pieza, aceptar una entrega y cobrar son actos diferentes.

La transferencia desde venta debe conservar un recibo estable. Si el proveedor o la red dejan un resultado ambiguo, reconciliar antes de repetir creación o envío. No prometer ejecución exactamente una vez en sistemas que no ofrecen esa garantía.

## Contexto y archivos

Reutilizar Artefactos Entrada y Salida, archivos de empresa, assets, documentos y versiones. El árbol actual ya contiene trabajo local de company_files y explorador; comprobarlo antes de repetir el diagnóstico del plan anterior.

Añadir metadatos y referencias de negocio: empresa, cliente cuando aplique, fuente, vigencia, versión y audiencia. Una carpeta llamada Clientes no sustituye permisos por registro.

Las ejecuciones deben permitir identificar el contexto efectivamente utilizado. Conservar snapshots y versiones fijadas cuando el runtime ya lo hace. No cambiar una ejecución activa por actualizar una skill o una oferta.

La búsqueda semántica o un repositorio nuevo de conocimiento solo se decidirán tras comprobar una carencia concreta. Los primeros recorridos pueden utilizar documentos y archivos existentes.

## Comunicaciones y aplicaciones

Unificar identidad de hilo y mensaje, vínculo comercial y evidencia de publicación sobre transportes existentes. Separar conversación con agente, conversación de cliente y discusión del equipo aunque compartan componentes visuales.

Elegir una ruta de correo y calendario para el piloto. Calificar recepción, lectura, borrador, envío, respuesta, disponibilidad, reserva, cambio y desconexión según las acciones ofrecidas. Consultar el [Connector playbook](../../connections/CONNECTOR-PLAYBOOK.md) antes de modificar conexiones.

Definir por dato el sistema principal, su identificador externo y cómo se resuelven cambios y conflictos. Un catálogo, un OAuth completado y una operación real confirmada son evidencias distintas.

Los resultados deben distinguir preparado, solicitado, confirmado, fallido e incierto según el contrato. El texto de un agente no certifica entrega de correo, reserva o aceptación del cliente.

## Gobierno y automatización

Conservar controles de presupuesto, pausa, aprobaciones y actividad. Las acciones nuevas declaran actor, ámbito, payload revisable, permiso, efecto, idempotencia y evidencia.

Una autorización permanente válida permite las acciones repetidas de su alcance. No añadir confirmaciones por ejecución si la política no las requiere. Las operaciones gobernadas siguen sus gates vigentes.

Las rutinas, eventos y colas existentes deben asumir la continuidad del proceso. Los reintentos, reconexión y mantenimiento de infraestructura son responsabilidad del servicio propietario cuando se pueden hacer bajo autoridad vigente. El usuario decide excepciones reales, no certifica leases, locks o hechos que el sistema puede comprobar.

Los mensajes externos y los archivos aportan datos; no conceden autoridad, nuevos secretos ni instrucciones privilegiadas.

## Datos de lectura y rendimiento

Definir paginación y filtros de servidor para carteras, conversaciones y actividad. No descargar todo el negocio para filtrar o calcular tarjetas. Limitar consultas, campos y concurrencia en vistas agregadas.

Las proyecciones tienen fuente, periodo y vigencia. Una carga parcial no se representa como cero, y un registro no autorizado no aparece en filtros o contadores.

El contrato de cada página debe distinguir mutación y vista derivada. Si falla una sección de la ficha, preservar las otras y mostrar qué falta. Invalidar caché de forma coherente tras cambios y al cambiar de empresa.

## Economía y métricas

Reutilizar costes, suscripciones, conciliación y presupuestos existentes. Añadir atribución explícita cuando se conozca, conservando costes no atribuidos e históricos sin asociación inventada.

Separar valor del pipeline, venta acordada, ingreso registrado, cobro y gasto. Conservar moneda y fuente. Definir reglas de conversión si se ofrece un agregado multimoneda; hasta entonces no sumar monedas distintas.

La primera evaluación de margen puede tener cobertura parcial. Nombrar qué costes se restan y no presentar el coste de IA como coste total del negocio.

La medición de estos recorridos no exige enviar contenido comercial fuera de la instancia. Si después se añade Telemetry, seguir contrato generado, README y revisión de privacidad de AGENTS.md. No confundir Telemetry con trazas OpenTelemetry ni con el run log local.

## Interfaz y accesibilidad

Aplicar [DESIGN](../../../DESIGN.md) y tokens de ui/src/index.css. Reutilizar componentes antes de crear nuevas tablas, formularios o estados. Cada pantalla responde qué sucede, si necesita intervención y qué acción corresponde.

Conservar la composición del pie de formularios: salida o atrás a la izquierda, acción principal a la derecha, en la misma fila. Los estados de carga, error parcial, permisos, vacío y conflicto deben ser utilizables con teclado y en pantallas estrechas.

La densidad responde a información útil. IDs, transcripciones y detalles de infraestructura permanecen disponibles cuando ayudan a diagnosticar; no dominan las páginas de negocio.

## Compatibilidad y adopción

Los enlaces antiguos, los flags y el modo clásico o simplificado tienen comportamiento registrado en el inventario. Pestañas y alias de una misma página comparten especificación.

Mantener los proyectos existentes sin cliente, los casos genéricos y las rutinas actuales. No crear backfills inferidos por nombre o por comentarios. Las migraciones de asociaciones requieren fuente verificable y política explícita.

El piloto no requiere cambiar todas las páginas administrativas. Sus MD fijan qué preservar y qué adaptar solo cuando lo exija un recorrido. El portal, la oferta alojada completa y la economía ampliada quedan en fase posterior.

## Trabajo transversal y entregables

Las referencias G01 a G24 describen responsabilidades de contratos y servicios compartidos. Cada entrega activa su porción y las páginas consumen ese contrato. El backlog por piloto contiene las dependencias ejecutables; las fichas de compatibilidad son regresiones condicionales.

Cada cambio de implementación deberá sincronizar db, shared, server y ui, actualizar documentación afectada y aplicar mapas y reglas del repositorio cuando cambie su comportamiento. La existencia de esta documentación no ejecuta migraciones, activa flags ni crea tareas en Paperclip.
