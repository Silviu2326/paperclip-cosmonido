# Sprint 4: adelanto aislado y orden de integración

Fecha: 2026-10-22. Estado: preparación implementada en módulos nuevos; sin integración, ejecución ni aceptación del sprint.

## Encargo y límites de esta entrega

Revisar [Cosmonido Atlas](https://cosmonido-atlas.shironecocrazy.chatgpt.site), adelantar el sprint 4 con subagentes GPT-6 Luna y respetar el trabajo que está cerrando los sprints 1–3. El usuario ha pedido expresamente no ejecutar tests ni subir nada.

Se han añadido únicamente cinco módulos independientes en `packages/shared/src/productization/` y seis documentos nuevos en `doc/plans/`. No se han cambiado archivos existentes, rutas, navegación, traducciones, índices de exportación, paquetes/dependencias, schema, migraciones, catálogo instalado, motor de ejecución ni medios de los otros sprints. No se ha modificado ni publicado Atlas. No se han hecho commits, push, PR ni cambios de rama.

Los módulos son contratos y transformaciones puras de datos. Todavía no hacen visibles funciones nuevas en la aplicación. No sustituyen las comprobaciones de permisos, presupuesto, aislamiento o concurrencia del servidor.

## Lo que aporta Atlas y cómo encaja

Se han leído el HTML y los recursos públicos `data.js` y `app.js` de Atlas. No se ha realizado una auditoría visual del renderizado ni una prueba de sus interacciones. La comparativa presenta Cosmonido como **objetivo tras S4** y el registro S1–S3 como construcción declarada cuya integración sigue pendiente de verificar. Los gráficos son simulaciones; no son evidencia de productividad, ahorro, ventas o funcionamiento del repositorio.

Atlas amplía la operación del [sprint 4 del plan maestro](2026-10-21-plan-maestro-producto.md#sprint-4-producto-que-se-vende-solo):

| Eje | Lo que hay que conseguir | Decisión para este adelanto |
| --- | --- | --- |
| Responsables y especialistas | Puestos estables que mantienen responsabilidad y perfiles por encargo con criterios y coste explícitos | Contrato de paquete con ambos modos; contratación y ejecución posteriores |
| Artefactos activos | Proponer y mantener oferta, marca, calendarios, guiones e informes a partir de fuentes y novedades | Derivación de necesidades de mantenimiento; ninguna publicación ni actualización automática |
| Latidos adaptativos | Propuestas de ritmo explicadas, temporales y aprobadas; separar frecuencia, continuidad y presupuesto | Política y resolución puras, con caducidad y pausa manual preservada |
| Producción híbrida | Proyecto con guion, escenas y recursos que combina grabaciones, edición, gráficos, voz y generación | Se documenta dependencia del cierre de medios S1–3; no se modifica su implementación |
| Operación interdisciplinar | Producto, código, finanzas, comercial, contenido, legal, personas y operaciones alrededor de un objetivo | Roles configurables; el nombre de una especialidad no acredita habilitación profesional ni concede autoridad |
| Peluguau | Comprender, reparar, integrar WhatsApp, producir/vender y volver a operar con nueva evidencia | Guion de aceptación pendiente; esta preparación no ejecuta el piloto ni acredita resultados |

La ampliación de Atlas complementa el autoservicio del plan maestro; no se elimina el trabajo de cuentas, cobro, onboarding, conexiones, acceso y experiencia móvil. Tampoco se da por terminada ninguna de esas pistas.

Publicar en redes exige un canal real, autoridad y recibo de publicación. Una pieza aceptada o exportada no demuestra publicación. Incorporarlo a un piloto deberá concretarse cuando estén disponibles las conexiones y gates correspondientes; aquí no se añade ningún envío ni canal.

## Paquetes adelantados y responsables

| Paquete | Responsable de esta entrega | Código nuevo | Documento y alcance |
| --- | --- | --- | --- |
| Capacidad y consumo | Subagente GPT-6 Luna `s4_plan_gate` | [plan-gate.ts](../../packages/shared/src/productization/plan-gate.ts) | [Contrato de límites](2026-10-22-s4-plan-gate.md): capacidad actual frente a consumo mensual, avisos, ámbitos, estado de acceso y denegaciones |
| Paquetes y especialistas | Subagente GPT-6 Luna `s4_packages` | [portable-package.ts](../../packages/shared/src/productization/portable-package.ts) | [Formato portable](2026-10-22-s4-paquetes.md): perfiles persistentes/especialistas, referencias versionadas, relaciones y formularios válidos |
| Recorrido inicial | Subagente GPT-6 Luna `s4_onboarding` | [onboarding-journey.ts](../../packages/shared/src/productization/onboarding-journey.ts) | [Onboarding](2026-10-22-s4-onboarding.md): hechos y evidencias para los tres caminos; extracción inferida requiere confirmación |
| Mantenimiento de materiales | Subagente GPT-6 Luna `s4_packages`, después de terminar su primer paquete | [active-artifact.ts](../../packages/shared/src/productization/active-artifact.ts) | [Artefactos activos](2026-10-22-s4-artefactos-activos.md): fuentes/versiones, material faltante, borradores y revisión; solo propuestas |
| Preferencias de actividad | Agente principal | [adaptive-cadence.ts](../../packages/shared/src/productization/adaptive-cadence.ts) | [Latidos adaptativos](2026-10-22-s4-latidos-adaptativos.md): decisiones temporales, revisión de política, pausa y restauración de base |

Cada agente ha tenido archivos propios. Los tres subagentes utilizados son GPT-6 Luna. Se ha revisado el código fuente y se han corregido problemas observados en esa lectura. Esto no equivale a typecheck ni a pruebas.

## Qué se mantiene, cambia o añade por superficie

Las fichas existentes conservan su contexto. Esta tabla las enlaza y precisa la ampliación de S4; no se editan mientras los otros sprints están activos.

| Página o superficie | Mantener | Cambiar o añadir al integrar S4 | Justificación y dependencia |
| --- | --- | --- | --- |
| [Onboarding](2026-10-21-producto/paginas/2026-10-21-onboarding.md) | Selección de camino y creación de empresa/equipo | Sugerencia de oferta frente a confirmación, reanudación desde hechos, comprobaciones vigentes y primer encargo real | Pegar una URL no prueba comprender el negocio ni haber activado el equipo; depende de contexto/conexiones/equipos S1–3 |
| [Nuevo agente](2026-10-21-producto/paginas/2026-10-21-nuevo-agente.md) y [organigrama](2026-10-21-producto/paginas/2026-10-21-organigrama.md) | Jerarquía, responsable, presupuesto y control de activación | Crear desde descripción, distinguir puesto persistente de especialista, proponer configuración y probar antes de activar | Especialidad y contenido del catálogo no conceden permisos; depende del banco de autonomía S3 |
| [Skills](2026-10-21-producto/paginas/2026-10-21-skills.md) y catálogo de equipos | Inventarios e instalación existentes | Paquete versionado con vista previa, referencias resueltas, borrador de instalación y revisión antes de publicar | Evita transportar credenciales/autoridad; hace falta adaptador explícito al formato de catálogo actual |
| [Artefactos](2026-10-21-producto/paginas/2026-10-21-artefactos.md) y [proyecto](2026-10-21-producto/paginas/2026-10-21-proyecto.md) | Archivos, versiones, alcance de cliente y revisión de entregables | Mostrar fuente/versión/objetivo, materiales solicitados, cambios y propuesta de mantenimiento; preservar versión aceptada | Mantener un material no permite sobrescribir trabajo aceptado; depende de contexto y revisiones S1 |
| [Agente](2026-10-21-producto/paginas/2026-10-21-agente.md), [rutinas](2026-10-21-producto/paginas/2026-10-21-rutinas.md) y [aprobaciones](2026-10-21-producto/paginas/2026-10-21-aprobaciones.md) | Scheduler, cola, decisiones y pausas | Propuesta de ritmo con motivo, efecto, frecuencia, continuidad y duración; decisión y vuelta a base | Separa iniciativa de autoridad; integración solo después de estabilizar motor y decisiones S3 |
| [Apps](2026-10-21-producto/paginas/2026-10-21-apps.md) y [perfil de conexión](2026-10-21-producto/paginas/2026-10-21-perfil-conexion.md) | Credenciales, OAuth y propiedad por empresa | Disponible/conectada/autorizada/comprobada con evidencia y reconexión | OAuth completo no acredita una herramienta utilizable; depende de las conexiones S2–3 |
| [Inicio](2026-10-21-producto/paginas/2026-10-21-inicio.md) | Decisiones, encargos, costes y fuentes actuales | Bloqueos de configuración, materiales pendientes, propuestas de ritmo y métricas por camino con periodo/cobertura | Reutilizar hechos operativos; evitar indicadores sintéticos o afirmaciones sin datos |
| [Costes](2026-10-21-producto/paginas/2026-10-21-costes.md) y [presupuestos](2026-10-21-producto/paginas/2026-10-21-presupuestos.md) | Gasto atribuido y hard-stop | Consumo frente a capacidad de plan, coste por resultado/minuto y facturación de la cuenta en su superficie propia | Factura de Cosmonido al usuario, señal del cliente y coste de proveedor son hechos distintos |
| [Empresas](2026-10-21-producto/paginas/2026-10-21-empresas.md), [miembros](2026-10-21-producto/paginas/2026-10-21-miembros.md) y [portal](2026-10-21-producto/paginas/2026-10-21-portal-cliente.md) | Aislamiento y acceso del contacto a entregas concretas | Cuenta con empresas cliente, roles, consumo atribuido y portal con revocación/expiración | Una cuenta comercial no sustituye la autorización a datos de cada empresa; depende de superficies públicas S2–3 |

`/signup`, `/pricing`, `/billing`, el catálogo unificado y el creador de equipos son propuestas del plan maestro. En esta entrega no se crean esas rutas ni se asegura que sus nombres ya estén implementados. El enlace de mejora de plan del contrato deberá resolverse contra la navegación disponible al integrar.

## Orden para continuar sin invadir los sprints abiertos

### Fase A: preparación aislada, esta entrega

Avanzar en paralelo los cinco módulos anteriores, con archivos exclusivos. Acordar contratos y revisar fuentes manualmente. No añadir exports ni consumidores todavía. La ausencia de dependencias entre los cinco módulos permite revisarlos e integrarlos por separado.

### Fase B: contrato común y persistencia, cuando se libere la integración

Un responsable coordina schema, migraciones, shared público, composición de rutas y navegación. Antes de editar esos archivos confirma quién los posee en S1–3 y toma su contrato final.

Tareas en orden:

1. Cerrar cuenta/titular y relación con empresas, roles y propiedad de conexiones. Definir acceso normalizado y políticas de plan sin inventar precios.
2. Decidir capacidad por cuenta frente a límites por empresa. El módulo adelantado evalúa capacidad agregada de cuenta; la atribución de consumo sigue siendo por empresa. Definir periodo de facturación, avisos y reconciliación.
3. Implementar reservas atómicas e idempotentes para uso/consumo. Definir confirmación/liberación, fallos parciales y concurrencia antes de habilitar gates efectivos.
4. Persistir propuestas de ritmo y borradores de paquete/instalación con revisiones, auditoría y ámbito. Validar fuentes y referencias en servidor.
5. Publicar los contratos y adaptadores al modelo final de S1–3. No crear duplicados de equipos, artefactos, decisiones, rutinas o clientes.

Hasta completar esta fase, `allowed`, `accepted` o `decision_to_persist` de una función pura no habilita un efecto real.

### Fase C: pistas de producto en paralelo

| Pista del plan maestro | Tareas que integra | Dependencias para conectarla |
| --- | --- | --- |
| A. Alta y cobro | Registro/verificación, plan/prueba, suscripción, cambio/cancelación, facturas y consumo | Cuenta, medidores y reserva; secretos/webhooks de cobro propios; la señal Stripe S3 no es esta facturación |
| B. Onboarding | Negocio/oferta, contexto, importación de contactos, conexiones, equipo y primer encargo reanudables | Contrato adelantado; contexto/equipos/CRM S1–3, extracción con revisión |
| C. Creador por descripción | Configuración propuesta, sandbox sin efectos, comparación/versionado y activación explícita | Paquetes, herramientas disponibles, gates y banco de autonomía S3 |
| D. Conexiones | Comprobación real, estados/evidencias, reconexión y solicitudes desde herramientas | Credenciales/transportes y comprobaciones propiedad del cliente; no rediseñar conectores activos |
| E. Catálogo | Adaptar formato, resolver versiones, vista previa/importación, revisión de publicación y procedencia | Contrato portable y catálogos existentes; catálogo público revisado, sin compraventa entre usuarios |
| F. Copiloto | Traducir petición en borrador/configuración, enseñar acciones y enlaces, confirmar lo gobernado | APIs finales y permisos del usuario; no crear canal alternativo de autoridad |
| G. Agencia implantadora | Empresa desde plantilla, consumo/costes separados, acceso de cliente, marca pública | Cuenta multiempresa, paquetes, propiedad de conexiones, roles |
| H. Portal | Entregas/propuestas/reuniones/compromisos, comentarios/aceptación/archivos y señal | Portal y contratos públicos S2–3; caducidad, revocación y alcance por contacto |
| I. Inicio | Métricas con fuente/periodo/cobertura, comparación y configuración del resumen | Hechos de S1–3, medidores y preferencias; no inferir resultados por número de ejecuciones |
| J. Móvil | PWA, decisiones/revisiones usables y notificaciones autorizadas | Decisiones/portal finales; enlaces seguros y registro de entrega |
| K. Acceso | 2FA, sesiones, roles, exportación, retención y borrado | Modelo de cuenta/empresa y almacenamiento final; no relajar aislamiento |
| L. Idiomas | ES/EN/PT, idioma del contacto y plantillas/superficie pública | Traducciones/tokens y componentes finales; no editar recursos compartidos durante cierre S1–3 |
| M. Pulido | Vacíos/errores accionables, paginación servidor, teclado, tokens y rendimiento | Cada recorrido integrado; sin afirmar limpieza global por revisar estos módulos |
| N. Medios v4 | Plantillas, presets de marca, cola con prioridad/límites y coste por minuto | Cierre de medios v1–3 y medidores; Atlas añade guion/escenas/recursos para producción híbrida, aún por concretar |
| Ampliación Atlas | Cadencias, especialistas y mantenimiento de artefactos | Módulos adelantados, decisiones, scheduler y artefactos finales; aplicar gates actuales a cada efecto |

Se pueden desarrollar A/D/K en paralelo tras acordar identidad y cuentas; B/C/E comparten borradores y resolución de paquetes; G/H dependen del aislamiento y las superficies públicas; I/J/L/M acompañan cada recorrido; N trabaja después de fijar el contrato de medios S3. La ampliación Atlas puede preparar sus servicios por separado, pero el enganche al scheduler/decisiones debe tener un único responsable.

### Fase D: integración y demostración, pendientes

La prohibición actual de ejecutar tests se respeta. Cuando se autorice una etapa de verificación, validar contratos y después los recorridos reales: reanudación sin duplicados, aislamiento entre empresas/clientes, revocación, concurrencia de consumo y decisiones, presupuesto agotado, errores de proveedor, expiración y Stop. Solo entonces activar cada capacidad y describirla como disponible.

Peluguau debe demostrar el ciclo operativo de Atlas con entregas comprobadas, nueva información y una segunda vuelta. La aceptación de autoservicio del plan maestro también sigue pendiente: persona externa registra/elige/paga/conecta/lanza, agencia separa dos empresas, y los tres pilotos externos registran utilidad, tiempo, coste y voluntad de pago. El caso propio sirve para ensayar, no acredita demanda externa ni disposición a pagar.

## Estado al entregar

- Código y documentos nuevos locales, revisados como fuente.
- Integración con DB/server/UI/catálogos/scheduler pendiente de coordinación.
- Tests, typecheck, build, token gates y demás verificaciones automatizadas no ejecutados por instrucción del usuario.
- Ningún resultado de producción ni piloto acreditado; ninguna publicación ni modificación de la rama principal realizada.
