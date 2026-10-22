# Contratos de datos acceso y acciones de negocio

Fecha: 2026-10-21
Estado: referencia lógica; concretar solo la porción necesaria para cada recorrido

[Plan maestro](../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](2026-10-21-arquitectura-global.md)

## Cuándo cerrar cada contrato

El emprendedor comprueba los contratos vigentes de trabajo, contexto, revisión, coste y autoridad. El modelo comercial nuevo no bloquea esa prueba.

| Caso | Contrato mínimo | Ejemplo que lo concreta |
| --- | --- | --- |
| Agencia | G02.A cliente/contacto y proyecto, G03.A acceso, G07.A brief y aceptación, G09.A contexto | Cliente Demo A, brief-v1.md y paquete-v2.md aceptado por una persona |
| Comercial | G02.C lead/oportunidad, acceso y recibos G03.C/G05.C, decisión de etapas G06.C | submit-001 produce un lead, una respuesta comprobada y un siguiente paso |
| Portal o finanzas | Identidad externa o magnitudes económicas ampliadas | Se concreta cuando un comprador elija esa ampliación |

Los ejemplos son sintéticos. Cada caso real fija sus campos y evidencia. Los cambios incluyen autorización y auditoría desde la primera operación; no se aplazan esas garantías.

## Entidades y relaciones

Los nombres siguientes describen conceptos. No crean tablas, enums o API definitivos.

| Concepto | Identidad y relaciones | Regla que debe conservarse |
| --- | --- | --- |
| Empresa operadora | Company existente, usuarios, agentes y políticas | Cada registro de negocio pertenece a una empresa |
| Cliente | Persona u organización con relación comercial | No equivale a Company ni a miembro interno |
| Contacto | Persona con medios y roles por organización | Puede relacionarse con varias organizaciones; correo no es identidad universal |
| Entrada de lead | Evento u objeto de interés pendiente de cualificar | Conservar origen y recibo; convertir sin duplicar identidad |
| Oportunidad | Cliente y contactos, etapa y siguiente acción | Varias por cliente; valor estimado no es ingreso |
| Oferta | Producto o servicio con revisiones | Lo vendido conserva su revisión aunque cambie el catálogo |
| Revisión de propuesta | Alcance, condiciones y publicación | Una revisión enviada o aceptada es identificable e inmutable |
| Compromiso | Aceptación de una revisión y condiciones | Editar contenido posterior no cambia lo aceptado |
| Proyecto | Project existente, objetivo y cliente opcional | Las iniciativas internas no necesitan cliente |
| Tarea | Issue existente y único asignado | Checkout, pausa, modos y revisión mantienen su semántica |
| Entregable y revisión | Artefacto o documento existente, versión y aceptación | Terminar producción y aceptar son estados distintos |
| Conversación externa | Hilo y mensajes de proveedor | No mezclar notas internas con contenido publicable |
| Evento de agenda | Solicitud o evento confirmado de proveedor | Propuesta horaria y reserva son hechos distintos |
| Registro económico | Fuente, fecha, moneda y condición de estimación | No confundir proveedor facturante y cliente al que se factura |
| Relación externa | Proveedor, cuenta y externalId | La identidad está acotada por proveedor, cuenta y empresa |

En G02 se deben resolver cardinalidades de proyectos con varios compromisos, cambios de alcance y trabajos recurrentes. Para el mínimo, no forzar un cliente en trabajos internos ni tratar una oportunidad ganada como proyecto único universal.

## Campos y lecturas

Cada recurso nuevo debe fijar:

- Campos obligatorios, opcionales, editables y derivados.
- Identidad estable y controles de duplicidad.
- Estados y transiciones con actor y condiciones.
- Empresa propietaria y audiencia de lectura y mutación.
- Archivo, fusión y borrado con efectos sobre referencias.
- Fuente externa, fecha y vigencia cuando corresponda.
- Versión o precondición para escrituras sensibles.
- Índices y consultas que requieren las páginas.

No incluir relaciones completas en toda respuesta. Diseñar listados ligeros y detalles paginados. El contrato compartido debe distinguir nulo, desconocido, no aplicable y falta de acceso cuando el producto necesite esa distinción sin filtrar información.

## Matriz mínima de autorización

| Actor | Lecturas | Mutaciones | Requisitos |
| --- | --- | --- | --- |
| Operador board autorizado | Recursos permitidos por empresa y reglas vigentes | Operaciones de control concedidas | Mantener autenticación, ámbitos y ACL actuales |
| Miembro humano | Recursos según membresía y grants | Acciones de su autoridad efectiva | No inferir autoridad por ser responsable comercial |
| Agente | Contexto de su empresa y ejecución autorizada | Herramientas y acciones permitidas | Conservar checkout, presupuesto, política y responsable |
| Integración | Eventos o datos de la cuenta y alcance validados | Operaciones del contrato de integración | Validar autenticidad, destino y recibo |
| Contacto comercial | Ninguna lectura interna por su condición de contacto | Ninguna acción interna por esa condición | Relación comercial no es concesión |
| Usuario de portal futuro | Publicaciones concedidas explícitamente | Revisión o entrada de datos de su ámbito | Identidad limitada y revocación comprobadas |

Las proyecciones de ficha, búsqueda, métricas, auditoría y notificaciones deben aplicar la misma autorización que las páginas de origen. Revisar fugas por títulos, autocompletado, contadores, errores y metadatos.

## Acción de negocio

Cada operación debe describirse con el siguiente contrato lógico:

| Campo | Finalidad |
| --- | --- |
| Actor y ejecución | Identificar quién solicita y bajo qué autoridad |
| Empresa y sujeto | Fijar el ámbito y registro objetivo |
| Tipo y versión | Identificar semántica y payload del comando |
| Precondición de versión | Evitar aplicar cambios sobre un estado distinto |
| Datos revisables | Mostrar a la persona qué se enviará o modificará |
| Clave de operación | Reconciliar reintentos sin repetir efectos |
| Permiso y gate | Determinar si se permite, deniega o espera decisión |
| Resultado y recibo | Confirmar estado de la operación y referencias creadas |
| Evidencia externa | Vincular mensaje, evento o aceptación confirmados |
| Auditoría | Conservar actor, fecha, alcance y efecto sin secretos |

No definir todavía rutas que no existen como si estuvieran disponibles. Al implementar, seguir base /api, validators compartidos, errores consistentes y checks de empresa y actor del repositorio.

## Operaciones que requieren consistencia

### Convertir un lead

Validar actor y empresa, reconciliar identidad, comprobar conversión previa y crear o vincular la oportunidad con un recibo estable. Conservar entrada, cualificación y origen. Un reintento recupera el resultado existente.

### Cambiar etapa

Comprobar estado y versión del caso u oportunidad, transición autorizada y revisiones requeridas. Registrar evento y programar efectos a través del mecanismo duradero vigente. Un movimiento de tarjeta no demuestra que sus efectos externos terminaron.

### Publicar una propuesta

Capturar revisión, destinatario y condiciones. El borrador puede seguir editándose en otra revisión, pero no modificar lo enviado. Si el envío es incierto, reconciliar con proveedor antes de repetirlo.

### Aceptar y transferir trabajo

Vincular aceptación a revisión concreta, actor y evidencia. Crear proyecto o trabajo correspondiente con idempotencia. Si una segunda operación falla, conservar un estado recuperable que permita completar la transferencia sin duplicar el proyecto.

### Revisar entrega

Identificar versión del entregable y audiencia. Aceptación o petición de cambios registra evidencia y no convierte otras versiones en aceptadas. La revisión interna y la externa conservan actores y estados independientes.

### Recibir evento externo

Validar firma o autenticación, proveedor, cuenta, destino y posible duplicado. Guardar relación de origen antes de disparar automatización. No conceder privilegios a partir del texto recibido.

## Archivo y cambios

Archivar un cliente, oferta o proyecto no borra evidencia de lo ocurrido. La fusión de identidades revisa conflictos y mantiene referencias y procedencia. Su transacción y política de reversión deben definirse antes de ofrecerla.

Revocar conexión o acceso no elimina el historial, pero debe impedir nuevas operaciones no autorizadas. No usar permisos capturados antiguos como autorización eterna para efectos externos nuevos.

Los backfills no deben adivinar cliente por título, nombre, comentario o código ambiguo. Las migraciones introducen contratos de forma compatible y necesitan comprobación sobre datos existentes.

## Concurrencia y resultados inciertos

Usar los mecanismos de transacción, versión y recibos apropiados por operación. Un lock de pipeline no sustituye al checkout de tarea. Una respuesta HTTP perdida no prueba que una operación externa falló.

Probar conflictos reales relevantes: dos conversiones, dos aceptaciones, edición durante revisión, revocación antes del envío y reintento tras una creación parcial. Las pruebas no deben ocultar el comportamiento que se necesita validar mediante mocks vacíos.

## Dinero y tiempo

Conservar moneda e importe con la precisión del dominio; reutilizar formatos existentes y no recalcular importes monetarios con floats improvisados en componentes.

Mantener fecha de hecho, fecha prevista, fecha comprometida y zona horaria cuando sean distintas. Las fechas sin hora no se convierten en eventos horarios arbitrarios. Los resúmenes explican periodo y vigencia.

## Decisiones pendientes de cerrar

1. Representación del lead y vínculo con identidad comercial.
2. Entidad propia de oportunidad y relación con pipelineCases.
3. Aceptación y cambios de alcance de servicios recurrentes.
4. Audiencia de cliente y combinación con proyectos privados.
5. Sistemas principales y conflictos de cada sincronización.
6. Reglas de fusión, archivo y borrado.
7. Cobertura de coste, conversión monetaria y fuentes de ingreso.
8. Versionado de paquetes exportables y principal de portal.
