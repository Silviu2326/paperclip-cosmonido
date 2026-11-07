# Validación independiente de cada piloto

Fecha: 2026-10-21
Estado: criterios propuestos; todavía no hay evidencia de pilotos ejecutados

[Plan maestro](../2026-10-21-plan-maestro-producto.md) · [F0](2026-10-21-f0-casos-y-evidencias.md) · [Backlog](2026-10-21-backlog-fases.md)

## Niveles de evidencia

| Nivel | Qué permite concluir |
| --- | --- |
| Documento o código localizado | Hay una definición o una implementación para inspeccionar |
| Ensayo con datos de prueba | El comportamiento técnico funciona bajo las condiciones probadas |
| Uso interno por el constructor | El recorrido puede ser útil para su propio negocio, con sesgo registrado |
| Evaluación por persona externa del negocio | Hay evidencia de utilidad para ese evaluador |
| Contraste de coste y disposición a pagar | Aporta evidencia comercial, con sus límites y contexto |

El trabajo del asistente construyendo documentación o código es ejecución. La aceptación y la valoración de utilidad corresponden a personas del negocio.

Guardar por ensayo entorno, versión, persona, presupuesto, entrada, criterio, resultado accesible, tiempo, consumo, correcciones y decisión. Conservar los fallos materiales y su resolución.

## Ensayo interno del emprendedor

Antes de ejecutar, completar el [guion](f0/2026-10-21-guion-emprendedor.md): producto, encargo, criterio, coste anterior y presupuesto.

Usar objetivo, agente, proyecto/tarea, Entrada/Salida y coste existentes. Comprobar la versión de contexto, publicar el entregable y obtener la revisión del propietario. La aceptación se puede registrar con el flujo actual y las medidas de tiempo pueden ser manuales.

PE04 cierra la prueba funcional interna. El catálogo nuevo de equipos, CRM, correo, calendario, dashboards y las ampliaciones de página se eligen si aparece una necesidad. El ensayo puede ocurrir en paralelo al diseño del contrato mínimo de agencia.

### Hito G20.E

PE05 selecciona un emprendedor externo, repite un trabajo comparable y registra su alternativa actual, utilidad y disposición a pagar. G20.E requiere PE04 y PE05 y declara las limitaciones y el soporte del recorrido. El caso interno por sí solo no demuestra demanda.

## Piloto de agencia

Antes de ejecutar, elegir agencia, persona y servicio reales del [guion](f0/2026-10-21-guion-agencia.md). Definir calidad, revisión, presupuesto y datos permitidos.

Probar cliente/contacto mínimos, brief, proyecto, tareas, entregables, una ronda de cambios y aceptación de versión. Usar dos contextos para comprobar el aislamiento acordado. Comparar tiempo y coste con la operación actual de la agencia.

### Hito G20.A

PA05 y PA06 deben aportar entrega, revisión, acceso, coste y valoración de la persona de la agencia. La revisión puede circular manualmente si esa es la modalidad declarada. Portal, catálogo de ofertas, propuestas comerciales y calendario son ampliaciones elegidas aparte. G20.A es independiente de G20.E y G20.C.

## Piloto comercial

Antes de ejecutar, elegir el negocio, responsable, fuente y cuenta del [guion](f0/2026-10-21-guion-comercial.md), con autorización de contacto o leads de prueba.

Probar ID de entrada, deduplicación, cualificación, oportunidad mínima, respuesta y siguiente acción. Comprobar recepción y envío en el proveedor. Si se promete reserva de reunión, comprobar también el evento; una propuesta de hora tiene un alcance más limitado.

Verificar las acciones de agente efectivamente prometidas. Cuando una persona actualice el CRM o envíe después de revisar, registrar el carácter asistido del piloto.

### Hito G20.C

PC06 aporta evidencia del recorrido y evaluación del negocio real. Registrar resultado de proveedor, coste, utilidad y voluntad de pago. Una respuesta generada, un OAuth válido o una prueba sintética no sustituyen estos hechos.

El catálogo completo de ofertas y propuestas solo se exige si el caso lo incluye. G20.C conserva su propio estado aunque otro piloto siga pendiente.

## Contratos y cambios seleccionados

Cada operación nueva define sus datos, empresa, actor, permiso y evidencia. La auditoría, pausa y presupuesto conservan sus garantías desde el primer uso. Las referencias G se activan por la porción que consume el recorrido, no como una lista de áreas que deban cerrarse completas.

Las fichas de página son planes de ampliación. El ensayo de una capacidad actual puede validarla antes de implementar esos cambios. Las 57 fichas de compatibilidad se revisan según [Regresión](2026-10-21-regresion-superficies.md).

## Casos transversales necesarios

| Área | Caso que debe probarse | Resultado esperado |
| --- | --- | --- |
| Empresa | Leer o mutar un ID de otra empresa | Denegación consistente sin fuga de datos |
| Privacidad | Abrir ficha, búsqueda o contador con proyecto oculto | No se revela título, contenido ni existencia indebida |
| Identidad | Importar, convertir o fusionar registros repetidos | Referencias e historial conservados y duplicados controlados |
| Concurrencia | Dos conversiones o dos aceptaciones simultáneas | Un resultado válido y conflicto o recibo reconciliado |
| Versiones | Editar propuesta mientras otra persona revisa | No se acepta una revisión diferente de la mostrada |
| Incertidumbre | Perder respuesta después de un envío o reserva | Estado incierto y conciliación antes del reintento |
| Revocación | Quitar permiso antes de un efecto externo | Se aplica autoridad vigente en el límite correspondiente |
| Presupuesto | Agotar límite durante un proceso | Hard stop conservado y trabajo recuperable |
| Pausa | Pausar tarea o ancestro | Se conservan reglas de bloqueo y continuación vigentes |
| Desconexión | Perder correo o calendario | Datos guardados con vigencia y fallo accionable |
| Archivo | Archivar cliente o servicio con trabajo previo | Historial y compromisos legibles según acceso |
| Compatibilidad | Trabajo antiguo sin relación comercial | Continúa sin exigir cliente u oportunidad |
| Moneda y fechas | Distintas monedas y zonas horarias | Agregados y citas sin conversiones implícitas engañosas |
| Navegación | Activar flags o cambiar interfaz | Alias y rutas compatibles conservan destino autorizado |
| Rendimiento | Cartera y actividad con volumen representativo | Consultas y carga acotadas; no descarga completa para filtrar |

Elegir las pruebas que ejercen la garantía. Para concurrencia, persistencia y efectos externos no basta con mocks que eliminan ese comportamiento. Reutilizar cobertura existente y añadir regresiones solo donde aporten señal.

## Verificación por capa

- Datos y servicios: integridad de relaciones, migraciones, permisos y transacciones.
- API y herramientas: mismo dominio y decisiones de autorización para humano, agente e integración.
- Interfaz: formularios, estados, navegación, teclado, pantallas estrechas y datos parciales.
- Proveedores: pruebas autorizadas de las capacidades efectivamente vendidas.
- Operación: recuperación, revocación, presupuesto, atribución y diagnóstico.
- Comercial: comprador, coste de servir y evidencia de disposición a pagar.

Para implementación futura, ejecutar primero la verificación más estrecha que pruebe el cambio. Antes de una entrega PR-ready, aplicar el conjunto completo exigido por AGENTS.md. Las comprobaciones de tokens, mapas y catálogos se añaden cuando sus archivos o comportamientos cambien. Esta documentación por sí sola no ejecuta suites de producto.


## Decisión y límites comerciales

Cada hito registra: caso real, evidencia técnica, evaluación humana, coste, limitaciones, disposición a pagar y decisión de continuar, corregir o reducir alcance. La persona con responsabilidad comercial decide qué se ofrece y bajo qué condiciones.

El orden recomendado es emprendedor, agencia y comercial. La selección y preparación pueden solaparse; ninguna decisión exige terminar G01 a G19 para los tres recorridos.

Las pruebas de código y las estructuras de documentación no prueban demanda ni product-market fit. La modalidad alojada, el portal y las finanzas ampliadas tienen sus contratos propios cuando se elijan.
