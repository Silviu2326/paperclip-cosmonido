# S4 tanda 2: vista previa de catálogo portátil

Esta tanda crea una primera conexión consumible entre `PortablePackage` y la vista previa de importación de empresa ya existente. El alcance se limita a equipos y perfiles persistentes. El panel queda disponible como componente para que el Workbench nuevo lo componga; el endpoint factory queda sin montar hasta que el root lo conecte en un router nuevo.

## Comportamiento

- El endpoint valida el documento con el esquema estricto `paperclip.portable-package` v1 y aplica un límite de 1 MiB. El panel ofrece pegar JSON o leer un archivo local hasta ese tamaño; la petición solo se envía tras pulsar «Preparar vista previa».
- Equipos y perfiles persistentes se transforman en archivos inline para `companyPortabilityService.previewImport`, con `include.company=false`, `mode=agent_safe` y estrategia de colisión `rename`. El resultado de Paperclip muestra el plan de perfiles por empresa. Se consultan datos existentes de empresa/agentes/proyectos/skills para resolver ese plan. Se limitan a 100 los perfiles persistentes enviados al plan; los restantes se cuentan y se declaran omitidos, nunca se descartan sin aviso.
- El rol de Paperclip se deriva por una tabla explícita de palabras en el título; los valores no reconocidos se asignan a `general`. Título, propósito, equipo, criterios de entrega y coste sugerido quedan en metadatos de procedencia del borrador, no en instrucciones de agente ejecutables. No se copian permisos ni configuración de adaptador/runtime.
- Las referencias de skills se resuelven contra la clave exacta del catálogo, `compatibility=compatible`, `trustLevel=markdown_only` y la versión exacta declarada por `catalogManifest.packageVersion`. La versión no es una versión individual por skill: corresponde al manifiesto del paquete de catálogo. Esta tanda solo informa el requisito; no instala ni adjunta archivos de skill.
- La extensión generada declara `schemaVersion: 7`, que el lector actual acepta hasta `BUNDLE_SCHEMA_VERSION = 7` en `server/src/services/company-portability.ts`; los perfiles se presentan como archivos `agents/<slug>/AGENTS.md` listados en `COMPANY.md`, formato que consume `buildManifestFromPackageFiles`.
- Especialistas `assignment_specialist`, skills no resueltas, solicitudes de conexión y las secciones de playbooks, plantillas de encargo, presets de marca, formularios y tipos de reunión se muestran como incompatibilidades. Los elementos no compatibles no se incluyen silenciosamente en el plan de perfiles persistentes.
- La selección opcional de perfil devuelve paquete, `teamId` y perfil ya validados para su futura conexión con hiring. Solo se ofrece cuando existe un plan de importación sin errores; seleccionar no contrata ni instala.

## Límites y revisión

El formato permite texto libre para fines descriptivos; ni la validación de esquema ni esta vista previa garantizan ausencia de datos personales, secretos u otra información sensible dentro del texto. La interfaz pide revisión humana antes del envío. El endpoint es company-scoped y exige `agents:create`; su factory todavía no está montada.

No se ejecutó `teamsCatalogService.previewCatalogTeamImport`: además de leer las fuentes empaquetadas, esa operación registra `company.team_catalog_previewed` en el activity log y prepara skills desde sus fuentes. Tampoco se usa `importBundle`, ni se descarga contenido de skills, ni se crea una conexión. La llamada aquí prevista es `companyPortabilityService.previewImport` sobre archivos inline construidos en memoria. En el camino de `previewImport`/`buildPreview` inspeccionado no hay escrituras ni evento de auditoría: para esta entrada inline y sin proyectos/issues se hacen consultas de empresa/agentes/proyectos/skills, sin invocar la resolución de secretos de proyectos. El camino GitHub del mismo servicio sí realiza solicitudes de red, pero esta ruta no lo admite. No se ejecutó código para verificar el comportamiento.

La lista de catálogo solo acredita que la referencia y el manifiesto local coinciden ahora; no demuestra procedencia del archivo JSON recibido ni sustituye revisión humana de textos y fuentes. Publicar o instalar requerirá validar fuentes confiables, revisar contenido, resolver compatibilidad/versiones en servidor y realizar un flujo separado con autorización explícita. Ninguna descripción o especialidad concede autoridad para actuar.

## Integración posterior

Esta tanda deja la ruta sin montar. Cuando root libere la integración, bastará importar `productizationCatalogRoutes` y añadir `api.use(productizationCatalogRoutes(db))` junto a la composición del router `api` de `app.ts` (dos líneas); no hace falta otro router compositor. El Workbench puede renderizar `PortablePackagePreviewPanel` y pasar `onSelectProfile` al flujo de hiring usando el `teamId` que devuelve el callback. Siguen pendientes el montaje del endpoint, la composición del panel, traducciones globales, una resolución/versionado de skills importables, soporte para especialistas por encargo y la ruta de instalación separada con permisos y revisión humana.

## Validación futura (no ejecutada)

Cuando root conecte la tanda, revisar: rechazo de JSON fuera del esquema y sobre el límite; rechazo de otro ámbito de empresa; colisiones entre slugs locales; versiones de catálogo ausentes o diferentes; referencias locales/catálogo de skill; cada sección no soportada; títulos fuera de la tabla de roles; perfiles con relaciones jerárquicas; errores y colisiones de `previewImport`; cambio de empresa y cancelación de petición en la UI; selección de perfil sin errores; y ausencia de controles de instalación/activación.
