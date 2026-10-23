# Reparación del arranque por diccionarios incompletos — 2026-10-22

Estado: publicada y verificada en https://paperclip.cosmonido.com el 2026-10-22T17:48:19.642330+00:00.

## Incidencia y causa

La interfaz no arrancaba: la inicialización de i18n lanzaba `Invalid ar locale messages` con 13 claves ausentes. Los diccionarios se cargan y validan todos de forma anticipada; el primer idioma incompleto bloqueaba también a quien utilizaba español.

La auditoría encontró 504 mensajes ausentes en 39 de los 40 diccionarios. Las claves pertenecen a `nav.productization` y a la delegación pública y selección de anfitrión de Google Calendar en `schedule`.

Antes de corregirlo, `pnpm exec vitest run src/i18n/locale-validation.test.ts` desde `ui/` reprodujo exactamente la excepción comunicada por el usuario. La compilación anterior no ejecutaba esta inicialización y, por sí sola, no detectaba el problema. Los HTTP 200 del despliegue anterior tampoco acreditaban el arranque del cliente.

## Cambios

- Añadidas exclusivamente las claves ausentes en los 39 JSON afectados; se conservan los mensajes existentes y el diccionario inglés.
- Los 12 mensajes nuevos de español están traducidos. Los otros 492 mensajes nuevos usan el texto inglés de referencia en los 38 locales restantes. Su traducción nativa queda pendiente y no se presenta como completada.
- Se mantiene la validación estricta de claves, interpolaciones, tipos y contenido de los diccionarios, incluida la fusión de mensajes de producto del sprint 4.
- Nuevo `ui/scripts/check-locales.mjs`: ejecuta mediante Vite el mismo módulo `locales.ts` utilizado al arrancar, comprueba diccionarios originales y recursos fusionados y exige cobertura exacta de los idiomas soportados.
- `pnpm --filter @paperclipai/ui build` ejecuta ahora `check:locales` antes de compilar para detener la publicación si reaparece esta deriva.

El parche consta de 39 diccionarios, el comprobador y el script de compilación. Las escrituras en el checkout de integración comprobaron previamente el contenido para preservar modificaciones concurrentes. No se han creado commits ni hecho push.

## Verificación

1. Reproducción del error original antes del cambio: conservada como fallo inicial de esta reparación.
2. Prueba específica existente de i18n: **7/7**; incluye importación e inicialización de los recursos reales.
3. `pnpm check:locales`: **40 idiomas**, diccionarios y recursos fusionados válidos.
4. Compilación completa de la UI: correcta. Permanecen avisos previos de configuración de Vite, CSS y tamaño de chunks.
5. Ejecución del módulo de producción `assets/i18n-CcGjPE_O.js` tanto localmente como dentro del contenedor activo: inicialización, traducciones españolas e interpolación verificadas.
6. El HTML de localhost y del dominio HTTPS referencia el nuevo bundle y el nuevo módulo i18n. El SHA-256 del módulo descargado por ambos coincide con el artefacto compilado: `e59819d3affbdc7b7fc5efc5fe583934a4cbc05d5dafae6120e164f6d4c2a2db`.
7. `/api/health` devuelve HTTP 200 por localhost y HTTPS; el HTML mantiene `Cache-Control: no-cache`.

No se ha realizado un recorrido interactivo en navegador: no había navegador de automatización disponible. La ejecución del módulo publicado acredita la corrección de esta excepción concreta; no acredita todas las pantallas ni cambia los porcentajes de aceptación de los sprints.

## Publicación y recuperación

- Release de UI: `s95-20261022-ui-locales-1`.
- Base del servidor: `s95-20261022-4793e21c4b65-r1`; commit de referencia `809454f961f4880092f871cab104f3ee96c26518` más los cambios locales documentados en el [despliegue S95](2026-10-22-s95-vps-deploy.md).
- Entrada nueva: `assets/index-vG29761q.js`.
- UI activa: `/root/paperclip-releases/s95-20261022-4793e21c4b65-r1/ui`, montada en `/app/ui/dist`.
- Fuente exacta del parche, manifiesto, hashes y comprobante: `/root/paperclip-releases/s95-20261022-ui-locales-1/` en la VPS; el parche de fuente se conserva separado de la release base.
- Copia anterior de los archivos públicos reemplazados: `/root/paperclip-releases/s95-20261022-ui-locales-1/previous-ui/`, con su lista en `backup-files.json`. Antes de restaurarla debe comprobarse que no exista un despliegue posterior.
- Assets con hash copiados primero; `sw.js` e `index.html` sustituidos de forma atómica al final. Se conservan los assets anteriores.
- Mismo contenedor e imagen, sin reinicio, migraciones ni cambios de base de datos. Se han comprobado nuevamente los valores activos y persistidos de `PAPERCLIP_PUBLIC_URL` y `PAPERCLIP_ALLOWED_HOSTNAMES`.

El siguiente despliegue completo debe incorporar los 41 archivos del parche de integración para conservar la reparación. La imagen base original no contiene esta actualización de UI; la sirve el montaje activo.
