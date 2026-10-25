# Revisión de la sidebar — 2026-10-22

Estado: correcciones verificadas y publicadas en la VPS.

## Alcance y procedencia

Se ha revisado la UI integrada que sirve `paperclip.cosmonido.com`, a partir del
snapshot `tmp/s4-integracion-20261022`, junto con sus rutas, navegación móvil y
variante antigua. Las correcciones se han trasladado a `../paperclip-int` con
comprobación del contenido anterior. El workspace principal tiene otra versión
de la sidebar: se conserva y solo recibe el arreglo común de rutas y sus pruebas.

No hay una sesión autenticada de producción disponible. La prueba visual sirve
el build real en localhost, intercepta todas las API con datos ficticios y no
demuestra el funcionamiento del CRM ni los permisos del backend en producción.

## Hallazgos y correcciones

| Prioridad | Hallazgo | Resultado |
| --- | --- | --- |
| Alta | 33 de los 39 enlaces visibles de navegación omitían el prefijo de empresa: `/customers`, `/leads`, `/assignments`, etc. El helper los interpretaba como nombres de empresa. | Se registran las rutas de los sprints y otras superficies internas omitidas. Emiten `/REV/customers`, conservan query/fragmento y respetan enlaces explícitos a otra empresa. |
| Media | Negocio acumulaba 30 enlaces sin posibilidad de plegarse, desplazando Equipo y Administración. | La sección se puede plegar y desplegar. Empieza abierta y conserva todos sus accesos; el estado es local a la sesión del componente. |
| Media | Con el menú móvil abierto, la barra inferior se veía detrás de la zona de cuenta. | El panel tiene una superficie opaca y la barra inferior se oculta y queda inerte mientras el menú está abierto. Se conserva el espacio reservado de la página. |
| Media | La sidebar móvil cerrada solo se trasladaba fuera de la pantalla y mantenía sus controles disponibles para el teclado. | El panel cerrado queda `inert`. El cambio se aplica también al layout antiguo. |
| Media, pendiente | Con `enableStreamlinedUi=false`, la sidebar antigua muestra 13 enlaces en el escenario revisado, en inglés, sin los accesos de los sprints. | Documentado. La experiencia predeterminada usa la sidebar nueva; falta acordar retirar la variante antigua o mantener sus enlaces y traducciones. |
| UX, pendiente | Negocio mezcla captación, operación de clientes, producción y configuración de la cuenta. Los accesos comerciales quedan después de numerosos ajustes. | El plegado alivia la longitud, pero falta una organización por funciones. |
| Accesibilidad, pendiente | El selector de empresa conserva nombres accesibles en inglés, como `Open … organization switcher`. | Falta completar la traducción de estos controles. |

## Qué se mantiene

- Las páginas, los permisos, la selección de empresa y los flags experimentales.
- Todos los enlaces y su orden actual; no se ocultan funciones de los sprints.
- El equipo, las tareas recientes, los favoritos y los puntos de extensión de plugins.
- La carga diferida de páginas y las mejoras previas de arranque e idiomas.
- La memoria de navegación por empresa; la corrección permite normalizar también
  las rutas comerciales al guardar y recuperar el recorrido.

## Organización propuesta, aún sin implementar

1. **Trabajo:** tareas, proyectos, encargos, contexto, artefactos, rutinas y Oficina.
2. **Negocio:** clientes, contactos, leads, oportunidades, conversaciones y agenda.
3. **Servicios:** agencia, propuestas, acuerdos, playbooks y catálogo público.
4. **Producción:** plantillas de vídeo y cola de medios.
5. **Configuración:** cuentas, facturación, seguridad, idioma, notificaciones,
   API/webhooks, canales, chat web, telefonía y sincronización CRM.

Puesta en marcha, crear equipo, catálogo de paquetes y resultados necesitan un
sitio visible en los recorridos correspondientes. Evitar convertir los tres
caminos de cliente en tres copias de la misma navegación. La propuesta requiere
una decisión de producto antes de mover accesos.

## Validación

- 100 pruebas específicas de rutas, memoria de empresa y componentes de sidebar.
- 34 pruebas de layout, incluidas las dos combinaciones del menú móvil.
- TypeScript de UI, token gates y build de producción: correctos.
- Navegador: los 39 enlaces visibles llevan el prefijo de la empresa; abrir
  Clientes funciona en el escenario ficticio; Idioma obtiene el estado activo;
  Negocio se pliega y despliega; el menú móvil abre, permite desplazarse hasta
  Idioma y se cierra al navegar. No hay desbordamiento horizontal ni errores JS.
- La sidebar cerrada rechaza el foco y la barra inferior queda inerte mientras
  el menú está abierto; vuelve al cerrar.
- Capturas revisadas a 1440×900 y 390×844, incluido el menú móvil abierto.

Informes originales en `tmp/sidebar-focused-tests.json` (99 pasan y una
expectativa antigua de orden falla), `tmp/sidebar-focused-rerun.json` (100 pasan)
y `tmp/sidebar-layout-tests.json` (34 pasan). La expectativa se actualizó para
incluir Encargos, Contexto y Oficina, ya presentes en el código integrado.

Las primeras simulaciones tenían respuestas ficticias incompletas de
notificaciones y dashboard. Se corrigió el escenario, conservando los informes
de fallo; no se relajó la aplicación. Una comprobación del estado activo también
se repitió esperando a que terminase la navegación. Evidencia final en
`%TEMP%/paperclip-sidebar-20261022/final-mobile.json` y sus capturas. Browser plugin
no disponible y CUA sin navegadores: se usó el Chromium de Playwright instalado.

No se han ejecutado las suites completas de servidor/runner ni se ha probado una
sesión real de CRM: el cambio afecta a la UI. No hay commits ni push de Git.

## Publicación

Paquete preparado: `s95-20261022-sidebar-ui-4`, sobre
`s95-20261022-startup-ui-3`. Incluye el parche acumulado de 25 archivos de fuente
y los artefactos de UI. La activación comprueba contenedor, imagen, montaje y
hashes para detenerse si hay otro despliegue; conserva los assets anteriores y
publica `index.html` al final. No requiere reinicio ni cambios de base de datos.

Publicación confirmada a las 2026-10-22T19:16:34.883424+00:00: entrada `assets/index-CVdXZyre.js`.
El HTML servido por localhost y HTTPS referencia el paquete nuevo, salud HTTP
200 y módulo de idiomas comprobado por SHA-256 y ejecución real en el contenedor.
Se han conservado los assets anteriores, el contenedor, la base de datos y las
variables públicas persistentes del despliegue. Recibo local:
`tmp/s95-20261022-sidebar-ui-4/activation-output.json`.

En la VPS queda la evidencia en
`/root/paperclip-releases/s95-20261022-sidebar-ui-4/deployment-result.json`,
junto con manifiesto, parche de fuente y copia de la UI anterior.


### Comprobación anónima después de publicar

La pantalla de acceso real apareció a los 47.2 s y el
cambio a registro respondió, sin enviar formularios. No hubo excepciones JS ni
aviso de arranque bloqueado. La comprobación conserva 4 peticiones con
`ERR_CONNECTION_CLOSED` y el mensaje de consola de descarga de script; las
peticiones de sesión/salud se recuperaron y la UI continuó. También hubo los
401/403 esperables sin autenticar. Esto confirma el acceso anónimo, pero no una
conexión libre de incidencias ni una mejora de rendimiento. Informe completo:
`%TEMP%/paperclip-startup-20261022/sidebar-production-final.json`.
