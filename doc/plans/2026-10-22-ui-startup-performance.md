# Reparación de la carga inicial — 2026-10-22

Estado: publicada en https://paperclip.cosmonido.com. Release de UI: s95-20261022-startup-ui-3; publicación 2026-10-22T18:53:51.340079+00:00.

## Problema y evidencia inicial

El usuario seguía viendo «Paperclip is taking longer to load» después de la [reparación de los diccionarios](2026-10-22-ui-locale-hotfix.md). Aquella reparación acreditaba la inicialización de i18n, pero no una carga completa del navegador.

La primera reproducción desde Chromium limpio superó 120 segundos esperando los bundles. La API de la VPS respondió en aproximadamente 40–100 ms y las lecturas locales de sus assets en 8–33 ms. Los primeros bundles incluían 19,3 MB de idiomas y 7,8 MB de código principal sin compresión de Caddy.

La separación inicial de páginas produjo cerca de 190 peticiones de entrada y tampoco resolvió el tiempo de carga: una prueba real alcanzó el formulario a los 125 segundos. La agrupación posterior por sí sola llegó a 98 segundos y tampoco se aceptó como solución de rendimiento. Se conservan estos resultados en los JSON de diagnóstico. Desactivar QUIC no mejoró la prueba y no se cambió el transporte del servidor.

## Cambios acumulados

- Compresión gzip/zstd en Caddy limitada a los assets y fuentes públicos del dominio de Paperclip. Configuración validada antes de recargarla; copia privada anterior conservada.
- Español e inglés en la entrada inicial; los demás idiomas se descargan cuando i18next los solicita. La compilación carga y valida los 40 diccionarios y sus mensajes fusionados. Se conserva la validación estricta.
- Carga por ruta de 131 componentes de página. La pantalla de acceso se incluye en la entrada; los dos layouts del tablero se solicitan al entrar en ellos.
- Metadatos de pestañas de agentes trasladados a un módulo ligero, con reexportación compatible desde la página.
- Asistente de alta cargado al abrirlo por primera vez y conservado montado desde entonces para mantener su estado. La conversación de voz se importa al iniciar una llamada; se mantiene el proveedor que conserva la llamada entre rutas.
- Recursos del grafo estático agrupados mediante los tags `$initial` de Rolldown: **4 referencias iniciales**, manteniendo diferidas las páginas e idiomas adicionales.
- La comprobación de acceso precede a la espera de opciones privadas. Estas opciones opcionales dejan de reintentarse al arrancar; las páginas privadas siguen esperando su resolución tras la comprobación de acceso.
- Descargas de idioma pendientes cancelan su aplicación al cambiar de cuenta. Las etiquetas de entorno de agentes se calculan al utilizarlas, en vez de quedar fijadas al idioma de importación.

El bloque principal final ocupa aproximadamente 2,2 MB sin comprimir y 626 KB gzip. El umbral del aviso de arranque sigue siendo 30 segundos.

## Verificación de la versión final

- **102 casos específicos superados**: ejecución principal de rutas, i18n, sincronización de idioma, asistente y control de voz; repetición focalizada de los 20 casos de agentes tras corregir las fixtures de idioma. Los informes originales con fallos se conservan y el agregado identifica exactamente qué ejecuciones sustentan cada resultado.
- TypeScript de UI, compilación de producción y controles de tokens correctos. Los avisos previos de Vite/CSS y tamaño de chunks siguen registrados.
- Módulo i18n compilado ejecutado dentro del contenedor; traducciones e interpolaciones verificadas. Los assets publicados coinciden con los hashes del manifiesto.
- Chromium limpio contra **el dominio real**, sin sustituir assets: primer render de React a los **21.1 s**, formulario de acceso disponible al comprobarlo a los **23.4 s**. El observador del documento registra **aviso de demora: no mostrado**.
- Flujo real: abrir la raíz → formulario de acceso → pulsar «Crear una» → aparece el campo de nombre. Sin envío de formularios ni creación de cuentas; sin excepciones JavaScript ni fallos de descarga de assets.
- Las respuestas 401/403 registradas corresponden a las comprobaciones de sesión y APIs privadas del navegador sin autenticar. No se presentan como errores JavaScript ni como prueba de acceso autorizado al tablero.

El navegador conectado no estaba disponible (inventario vacío). Se utilizó el Chromium de Playwright ya instalado, en un contexto aislado. Las pruebas aisladas con assets locales fueron diagnósticas; la aceptación anterior usa exclusivamente la web publicada.

## Fuente, despliegue y recuperación

Los 18 archivos de esta reparación están en el checkout de integración y en la copia congelada utilizada para compilar. Las escrituras y la publicación comprobaron preimágenes para preservar modificaciones concurrentes.

- Fuente base del servidor: commit `809454f961f4880092f871cab104f3ee96c26518` más los overlays documentados en el [despliegue S95](2026-10-22-s95-vps-deploy.md).
- Entrada activa: `assets/index-B6qjEdAL.js`.
- Traducciones iniciales: `assets/i18n-Cldermye.js`.
- UI servida desde `/root/paperclip-releases/s95-20261022-4793e21c4b65-r1/ui`, montada en `/app/ui/dist`. Para otra publicación de UI debe comprobarse el montaje del contenedor activo.
- Manifiesto, parche de fuente, hashes, comprobante y copia previa: `/root/paperclip-releases/s95-20261022-startup-ui-3/`. Los archivos sin cambios se reutilizaron después de comprobar sus hashes; los assets nuevos se copiaron antes de sustituir atómicamente el HTML y el service worker.
- Contenedor e imagen conservados, sin reinicios de aplicación ni migraciones. Comprobados los valores activos y persistidos de `PAPERCLIP_PUBLIC_URL` y `PAPERCLIP_ALLOWED_HOSTNAMES`.
- No se han creado commits, hecho push ni modificado la rama principal. Un despliegue completo posterior debe incluir los cambios locales de integración y el parche previo de locales.

La restauración de la UI anterior requiere comprobar primero que no exista una publicación posterior y usar `previous-ui/` con `backup-files.json`. No requiere restaurar la base de datos. La copia de Caddy está separada en `/root/paperclip-releases/s95-20261022-startup-1/`.

## Evidencia y límites

Evidencia local: `C:/Users/usuario/AppData/Local/Temp/paperclip-startup-20261022`; aceptación en `production-lean-final.json` y capturas del acceso y del cambio de formulario. Informes de pruebas en `tmp/startup-lean-pass.json`, `tmp/startup-agents-pass.json` y `tmp/startup-accepted-evidence.json`.

La comprobación real cubre el arranque sin autenticar y esa interacción de formulario. No acredita recorridos del tablero con una cuenta, proveedores reales de voz/calendario/CRM ni un porcentaje de aceptación de los cuatro sprints.
