# Backlog por piloto y áreas compartidas

Fecha: 2026-10-21
Estado: plan propuesto; seleccionar entregas después de concretar cada caso

[Plan maestro](../2026-10-21-plan-maestro-producto.md) · [F0](2026-10-21-f0-casos-y-evidencias.md) · [Regresión](2026-10-21-regresion-superficies.md)

## Qué representa el trabajo

El inventario contiene 106 superficies. De ellas, 38 tienen ampliaciones candidatas, 57 se mantienen mediante regresión cuando un cambio las afecta y 11 corresponden a ampliaciones posteriores.

G01 a G24 nombran responsabilidades compartidas. Cada recorrido activa una porción concreta; no hay que completar todas esas áreas para empezar un piloto. Las fichas de página explican posibles cambios y aceptación; sus subtareas no se suman otra vez a las entregas de este backlog.

El trabajo ejecutable se selecciona de las entregas siguientes. Son propuestas, no issues creadas ni estimaciones aprobadas. F0 todavía está incompleto: el negocio propio está seleccionado, pero falta encargo; agencia, negocio comercial y emprendedor externo están pendientes.

## Pilotos independientes

### Emprendedor

| Entrega | Momento | Trabajo y salida | Depende de | Áreas que consume |
| --- | --- | --- | --- | --- |
| PE01 | F0 | Concretar el producto propio, encargo, presupuesto, criterio y responsable; registrar situación inicial. **Salida:** Guion interno completo; seleccionar después un emprendedor externo. | Caso propio, sin dependencia de otro piloto | G01, G07, G09 |
| PE02 | F1 | Comprobar objetivo, agente, proyecto/tarea, Entrada/Salida y costes existentes. **Salida:** Evidencia del entorno y lista breve de bloqueos reales. | PE01 | G03, G08, G09 |
| PE03 | F1 | Ejecutar el encargo con lo existente y publicar el entregable para revisión. **Salida:** Artefacto accesible y decisión del propietario sobre el criterio acordado. | PE02 | G07 |
| PE04 | F1 | Registrar tiempo, coste, correcciones y fricción del caso interno. **Salida:** Prueba funcional interna; sesgo de constructor identificado. | PE03 | G11, G19 |
| PE05 | F1 | Repetir con un emprendedor externo seleccionado y contrastar utilidad y voluntad de pago. **Salida:** Comprador o evaluador externo identificado, coste anterior y evidencia de demanda. | PE04 | G01 |
| G20.E | F1 | Decidir si ofrecer el piloto a emprendedores, con límites y soporte. **Salida:** Decisión basada en prueba funcional y contraste externo; los otros pilotos no bloquean. | PE04, PE05 | G20 |

### Agencia

| Entrega | Momento | Trabajo y salida | Depende de | Áreas que consume |
| --- | --- | --- | --- | --- |
| PA01 | F0 | Seleccionar agencia, servicio recurrente, responsable y datos autorizados. **Salida:** Guion y coste anterior; el perfil candidato pasa a caso real. | Caso propio, sin dependencia de otro piloto | G01 |
| PA02 | F1 | Cerrar solo cliente/contacto, acceso, brief/aceptación y contexto del encargo. **Salida:** G02.A, G03.A, G07.A y G09.A concretados con ejemplos. | PA01 | G02, G03, G07, G09 |
| PA03 | F2 | Añadir la mínima cartera y relación de contactos necesaria, con aislamiento y auditoría. **Salida:** Alta, lista y ficha simples; duplicados detectados sin fusión automática. | PA02 | G04, G13, G18 |
| PA04 | F2 | Vincular brief y cliente al proyecto y registrar revisión de la entrega existente. **Salida:** El mismo encargo se sigue desde cliente hasta versión revisada. | PA02 | G07, G14, G18 |
| PA05 | F2 | Ejecutar el servicio con un cliente y comprobar aislamiento con un segundo contexto de prueba. **Salida:** Entrega revisada y evidencia de que no se mezclan contextos. | PA03, PA04 | G03, G08, G09 |
| PA06 | F2 | Comparar coste, tiempo, revisiones y disposición a pagar con la operación anterior. **Salida:** Valor observado por una persona de la agencia con autoridad para evaluarlo. | PA05 | G11, G19 |
| G20.A | F2 | Decidir si ofrecer el piloto de agencia con el alcance comprobado. **Salida:** No exige correo, propuestas, portal, dashboards ni el cierre de G20.C. | PA06 | G20 |

### Comercial

| Entrega | Momento | Trabajo y salida | Depende de | Áreas que consume |
| --- | --- | --- | --- | --- |
| PC01 | F0 | Seleccionar negocio, fuente de leads, criterios, responsable y autorización de contacto. **Salida:** Guion real, datos permitidos, coste anterior y resultado prometido definidos. | Caso propio, sin dependencia de otro piloto | G01 |
| PC02 | F1-F3 | Cerrar e implementar la entrada identificable, deduplicación y oportunidad con etapa y próxima acción. **Salida:** Modelo mínimo y decisión de motor; reciclar lo ya construido para A cuando exista. | PC01 | G02, G03, G06, G13, G16 |
| PC03 | F3 | Calificar una ruta de correo y, si está prometida la reserva, un calendario. **Salida:** Recibos de recepción, envío y evento requerido; incertidumbre reconciliada. | PC01 | G05, G08, G15 |
| PC04 | F3 | Conectar lead, oportunidad, conversación y seguimiento con una interfaz mínima. **Salida:** El operador localiza estado y próxima acción sin necesitar todas las fichas candidatas. | PC02, PC03 | G04, G16 |
| PC05 | F3 | Añadir solo las acciones de agente incluidas en el guion y su gobierno. **Salida:** Si la actualización es manual, etiquetar el piloto como asistido; no prometer autonomía no probada. | PC02, PC03 | G08, G10, G17, G18 |
| PC06 | F3 | Probar entrada repetida, respuesta, seguimiento y resultado externo con el comprador. **Salida:** Hechos de proveedor, coste y evaluación del negocio registrados. | PC04, PC05 | G11, G19 |
| G20.C | F3 | Decidir si ofrecer el piloto comercial con el grado de autonomía comprobado. **Salida:** Gate independiente; calendario y propuestas solo se exigen si forman parte del caso. | PC06 | G20 |

## Áreas de responsabilidad global

Los sufijos E, A y C identifican la porción del contrato usada por cada recorrido. G02.A, por ejemplo, solo trata cliente/contacto y su vínculo con el trabajo; no obliga a definir previsión de ventas, portal o facturación.

| Área | Responsabilidad | Porción necesaria | Cuándo se activa |
| --- | --- | --- | --- |
| G01 | Caso y alcance | Un guion por piloto: comprador o usuario, encargo, presupuesto, aceptación y situación inicial. | Antes de ese piloto; cada caso puede cerrarse por separado. |
| G02 | Identidad comercial | E: reutilizar objetivos y trabajo. A: cliente, contacto y proyecto. C: lead y oportunidad. Oferta y propuesta se detallan si se eligen. | A antes de PA03; C antes de PC02. E conserva el modelo vigente. |
| G03 | Acceso y aislamiento | E: comprobar los permisos existentes. A: proteger nuevos vínculos y contexto. C: autoridad de mensajes y acciones. Portal se trata en F6. | La porción afectada se define junto a cada nueva operación. |
| G04 | Consultas y referencias | IDs, listado acotado y filtros para las pantallas seleccionadas; búsqueda global y fusión se activan después si hacen falta. | Al añadir el primer listado correspondiente. |
| G05 | Correo y calendario | Cuenta y principal, identidad del mensaje, recibo y conciliación. Calendario solo si el caso exige reserva. | Piloto comercial; el emprendedor y la entrega manual no dependen de esta área. |
| G06 | Procesos por etapas | Evaluar el motor existente para la oportunidad; registrar decisión antes de otro motor. El flujo interno actual sigue operativo. | Cuando PC02 requiera etapa o transición nueva. |
| G07 | Compromisos y entregas | E: aceptación del artefacto actual. A: brief y versión aceptada. C: propuesta solo si está incluida. | La definición mínima se cierra con el encargo de cada piloto. |
| G08 | Autoridad y ejecución | Conservar checkout, único asignado, pausa y presupuesto; definir permiso y recibo de cualquier acción nueva. | Desde la primera prueba; la extensión se diseña al añadir la acción. |
| G09 | Contexto y capacidades | Usar archivos, agentes y skills existentes y comprobar la versión utilizada. El catálogo nuevo de equipos es una ampliación. | Preparación de cada recorrido; E puede validar mientras se diseña A. |
| G10 | Decisiones humanas | Usar revisiones existentes; añadir tipos solo donde una operación nueva necesite decisión y continuación. | Con la operación afectada, sin esperar a una fase común de gobierno. |
| G11 | Dinero y medidas | E y A: coste existente y tiempo anotado. C: fuente de métricas del seguimiento. Finanzas y margen ampliados quedan después. | Medir desde el primer ensayo; el contrato financiero completo queda diferido. |
| G12 | Despliegue y actores externos | Usar el despliegue actual. Portal, SaaS, identidad externa y responsabilidades de servicio se definen al escoger esa ampliación. | La comprobación del entorno actual es temprana; la ampliación pertenece a F6. |
| G13 | CRM mínimo | A: alta y ficha de cliente y contacto. C: entrada de lead, deduplicación y oportunidad. Ampliar por operación elegida. | PA03 y PC02; cada subconjunto tiene su propia aceptación. |
| G14 | Encargo y entrega | E prueba el trabajo actual. A añade solo el vínculo de cliente, brief y revisión que falte. | PA04; una iniciativa interna puede probarse antes de desarrollar esta ampliación. |
| G15 | Prueba de proveedor | Confirmar recepción y envío de una ruta de correo; probar reserva si está prometida. Registrar resultado incierto y recuperación. | PC03; no bloquea los otros pilotos. |
| G16 | Venta y transferencia | Etapa y siguiente acción mínimos en C. Catálogo, propuesta y transferencia automática se añaden si el caso los necesita. | PC02 y PC04, con el alcance acordado. |
| G17 | Herramientas y automatización | Usar agentes actuales desde el primer piloto. Añadir herramientas CRM al seleccionar actualización automática; automatización repetida en F4. | PC05 o una mejora posterior; no es un requisito general de E. |
| G18 | Auditoría de efectos | Cada mutación nueva incluye actor y resultado desde su primera implementación; las vistas de auditoría se amplían cuando aporte valor. | Con PA03, PA04 o PC02/PC05, sin gate tardío independiente. |
| G19 | Medidas y vistas | Anotar tiempo, revisión y costes reales en una hoja de evidencia; añadir agregados e Inicio cuando el piloto justifique esa necesidad. | Medida mínima en cada ensayo; dashboards en F5. |
| G20 | Decisión de piloto | Tres hitos independientes: G20.E, G20.A y G20.C. Prueba técnica interna y validación de demanda se registran separadas. | Cada hito depende de su propio guion y evidencias. |
| G21 | Servicio alojado y cobro de Paperclip | Definir operación, alta, soporte, límites y facturación contratada cuando se elija modalidad alojada. | F6, con evidencia del perfil al que se vaya a vender. |
| G22 | Portal externo | Identidad limitada, publicación, aceptación y revocación de entregas. | F6, si una agencia real necesita esa colaboración. |
| G23 | Economía ampliada | Ingresos, cobros y costes con fuente, moneda y cobertura; conectores financieros elegidos. | F6, después de comprobar qué decisión económica necesita el comprador. |
| G24 | Portabilidad y extensiones | Paquetes versionados y contratos de plugin que incluyan las nuevas relaciones. | F6 o antes únicamente si una entrega rompe un formato existente. |

## Ampliaciones de página por seleccionar

Estas fichas contienen trabajo específico de diseño e implementación. Se eligen si el guion muestra la necesidad. El uso de una página existente se valida en el recorrido, sin esperar a terminar su ampliación.

| Página | Momento de ampliación | Trabajo local |
| --- | --- | --- |
| [CLI Clientes](paginas/2026-10-21-clientes.md) | F2 | Construir cartera, altas y flujo de revisión de duplicados. |
| [CLD Ficha del cliente](paginas/2026-10-21-cliente.md) | F2 | Componer ficha con acciones y vínculos a trabajo y contexto. |
| [CON Contactos](paginas/2026-10-21-contactos.md) | F2 | Construir agenda y revisión de duplicados sin mezclar miembros. |
| [COD Ficha del contacto](paginas/2026-10-21-contacto.md) | F2 | Conectar historial, preferencias y creación de seguimiento. |
| [LEA Leads](paginas/2026-10-21-leads.md) | F2 | Construir bandeja y conversión manual apoyadas en identidad compartida. |
| [LED Ficha del lead](paginas/2026-10-21-lead.md) | F2 | Implementar ficha, descarte, aplazamiento y resultado de conversión. |
| [OPO Oportunidades](paginas/2026-10-21-oportunidades.md) | F3 | Construir tabla y tablero con seguimiento y cierres trazables. |
| [OPD Ficha de la oportunidad](paginas/2026-10-21-oportunidad.md) | F3 | Construir propuesta, seguimiento y creación vinculada de trabajo. |
| [OFE Catálogo de productos y servicios](paginas/2026-10-21-oferta.md) | F3 | Implementar creación, archivo y uso de la oferta en propuestas. |
| [OFD Detalle de producto o servicio](paginas/2026-10-21-oferta-detalle.md) | F3 | Implementar selección de procedimiento y comprobación de requisitos. |
| [PRO Propuestas comerciales](paginas/2026-10-21-propuestas.md) | F3 | Construir creación contextual y seguimiento de vencimientos. |
| [PRD Detalle de propuesta y compromiso](paginas/2026-10-21-propuesta.md) | F3 | Implementar edición, publicación, evidencia y transferencia del compromiso. |
| [COM Comunicaciones](paginas/2026-10-21-comunicaciones.md) | F3 | Construir asociación, filtros y atención de conversaciones. |
| [CMD Detalle de conversación comercial](paginas/2026-10-21-comunicacion.md) | F3 | Implementar respuesta contextual y transferencia con resultado verificable. |
| [AGE Agenda comercial](paginas/2026-10-21-agenda.md) | F3 | Construir agenda y operaciones autorizadas de reserva y cambio. |
| [FIN Resultados económicos del negocio](paginas/2026-10-21-finanzas.md) | F6 | Construir informes y registros financieros con desglose y procedencia. |
| [POR Portal del cliente](paginas/2026-10-21-portal-cliente.md) | F6 | Construir revisión externa y entrada de archivos con aislamiento. |
| [INI Inicio](paginas/2026-10-21-inicio.md) | F5 | Construir el resumen contextual y las transiciones hacia pendientes. |
| [EMP Empresas operadoras](paginas/2026-10-21-empresas.md) | F1 | Actualizar selección y estado de configuración sin alterar creación gestionada. |
| [ONB Configuración inicial](paginas/2026-10-21-onboarding.md) | F5 | Adaptar asistente, reanudación y acción explícita de inicio. |
| [TAR Tareas](paginas/2026-10-21-tareas.md) | F2 | Añadir columnas y accesos preservando participación y jerarquía. |
| [TAD Detalle de tarea](paginas/2026-10-21-tarea.md) | F2 | Integrar enlaces de negocio y aceptación sin modificar garantías de ejecución. |
| [PYS Proyectos](paginas/2026-10-21-proyectos.md) | F2 | Construir creación contextual y vistas de cartera. |
| [PYD Detalle de proyecto](paginas/2026-10-21-proyecto.md) | F2 | Construir resumen de encargo, cambios y aceptación con costes atribuibles. |
| [OBJ Objetivos](paginas/2026-10-21-objetivos.md) | F2 | Añadir revisión de objetivos por camino sin romper jerarquía. |
| [OBD Detalle de objetivo](paginas/2026-10-21-objetivo.md) | F2 | Construir detalle con fuentes y decisión trazable. |
| [AGS Agentes](paginas/2026-10-21-agentes.md) | F4 | Actualizar lista y filtros con enlaces a trabajo verificable. |
| [AGD Detalle del agente](paginas/2026-10-21-agente.md) | F4 | Añadir trazabilidad de procedimientos y resultados al detalle. |
| [EQU Catálogo e instalación de equipos](paginas/2026-10-21-equipos.md) | F4 | Preparar instalación y diagnóstico de requisitos para tres recorridos. |
| [RUS Rutinas](paginas/2026-10-21-rutinas.md) | F4 | Añadir filtros y estado de preparación de las rutinas. |
| [RUD Detalle de rutina](paginas/2026-10-21-rutina.md) | F4 | Construir validación de requisitos y recuperación con conciliación. |
| [PIP Procesos y pipelines](paginas/2026-10-21-pipelines.md) | F3 | Añadir plantillas y contexto sin duplicar el motor. |
| [PIC Configuración de pipeline](paginas/2026-10-21-pipeline-configuracion.md) | F3 | Añadir edición segura y explicación de automatizaciones. |
| [PIE Elemento de pipeline](paginas/2026-10-21-pipeline-elemento.md) | F3 | Añadir contexto, evidencia y navegación compartida. |
| [APR Aprendizajes de procesos](paginas/2026-10-21-aprendizajes.md) | F6 | Añadir propuesta de mejora con vínculo a revisión del procedimiento. |
| [ART Artefactos de entrada y salida](paginas/2026-10-21-artefactos.md) | F2 | Añadir asociación comercial y aceptación sobre archivos existentes. |
| [CTX Contexto del negocio](paginas/2026-10-21-contexto.md) | F2 | Construir vista de vigencia y asociación con procedimientos. |
| [DEC Decisiones y pendientes humanos](paginas/2026-10-21-decisiones.md) | F4 | Integrar colas comerciales y de entrega con el centro de decisiones. |
| [APS Aprobaciones](paginas/2026-10-21-aprobaciones.md) | F4 | Añadir contexto y tipos necesarios sin recrear el motor. |
| [APD Detalle de aprobación](paginas/2026-10-21-aprobacion.md) | F4 | Mejorar detalle y conciliación de resolución. |
| [CST Costes de ejecución](paginas/2026-10-21-costes.md) | F2 | Añadir filtros comerciales y explicación de importes. |
| [BCH Sala de conversación del equipo](paginas/2026-10-21-sala-equipo.md) | F6 | Añadir enlaces a decisiones duraderas si se valida el uso. |
| [PLM Administración de plugins](paginas/2026-10-21-plugins.md) | F6 | Mantener extensiones opcionales separadas de capacidades esenciales del piloto. Añadir dependencias de procesos y advertencia de impacto al retirar. |
| [PLC Configuración de plugin](paginas/2026-10-21-plugin-configuracion.md) | F6 | Mostrar ámbito y efectos sobre procesos antes de aplicar. Añadir diagnóstico de requisitos de negocio cuando la extensión los soporte. |
| [EXO Exportación de empresa](paginas/2026-10-21-exportacion.md) | F6 | Evaluar compatibilidad de las nuevas entidades antes de exportarlas. Añadir manifiesto y tratamiento explícito de datos comerciales privados. |
| [IMP Importación de empresa](paginas/2026-10-21-importacion.md) | F6 | Añadir política explícita para identidades comerciales y sus vínculos. Añadir validación del manifiesto y resumen de conflictos. |
| [PLP Página aportada por plugin](paginas/2026-10-21-pagina-plugin.md) | F6 | Exigir uso de contratos globales para clientes y resultados. Añadir reglas de navegación y estados ausentes o fallidos. |
| [CSP Ajustes de empresa aportados por plugin](paginas/2026-10-21-ajustes-plugin-empresa.md) | F6 | Distinguir configuración compartida y de instancia. Añadir declaración de dependencias de proceso y validación de permisos. |
| [FAC Plan consumo y facturación de Paperclip](paginas/2026-10-21-facturacion-paperclip.md) | F6 | Construir gestión de plan e historial con proveedor y reconciliación elegidos. |

Las 57 superficies de compatibilidad están en [Regresión](2026-10-21-regresion-superficies.md). Esa lista evita contar comprobaciones condicionales como funcionalidades pendientes.

## Trabajo posterior

- F4: seguimientos automáticos duraderos y herramientas adicionales después de probar el recorrido asistido o la automatización mínima elegida.
- F5: agregados, Inicio adaptado y configuración guiada basados en fricción y métricas del piloto. La medición manual comienza antes.
- F6: oferta alojada, portal, finanzas y portabilidad cuando un comprador y el modelo de servicio los justifiquen.

## Coordinación y estimación

Durante PE02 y las exploraciones de agencia y comercial, registrar cada bloqueo o cambio, qué se reutiliza, responsable y rango de esfuerzo con supuestos. Los límites de exploración están en F0. La estimación de desarrollo sigue pendiente hasta comprobar el caso y las dependencias reales.

Pueden avanzar en paralelo la validación interna del emprendedor, la selección de los otros compradores y el contrato mínimo de agencia. Una API compartida, migración o componente común tiene una coordinación de integración; las pantallas independientes pueden prepararse sobre contratos ya acordados.

Crear tareas ejecutables, contactar compradores o ejecutar pilotos requiere la instrucción operativa correspondiente. Esta entrega organiza la documentación.
