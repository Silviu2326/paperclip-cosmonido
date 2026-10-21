# Artefactos como buzón: Entrada / Salida con explorador de archivos

Fecha: 2026-10-21. Maqueta de referencia: `INFINIVERSE_ARTEFACTOS_MOCKUP.html` (raíz del repo).

## 1. Objetivo

La página Artefactos pasa de ser una rejilla de tarjetas enlazadas a tareas a ser
el **buzón de archivos de la empresa digital**, con la facilidad de un Finder:

- **Entrada**: lo que las personas dan a la empresa (marca, precios, legal, briefs,
  referencias). Se sube, se organiza en carpetas, se reemplaza por versiones nuevas,
  y los agentes lo leen durante sus tareas.
- **Salida**: todo lo que generan los agentes, navegable como carpetas
  `Proyectos › Proyecto › Tarea`, con vista previa inmediata y descarga.

Criterio de éxito: una persona sin conocer Paperclip abre Artefactos, sube una guía
de estilo a `Entrada › Marca`, y en la siguiente tarea el agente la usa. Después
abre `Salida › Proyectos › Ventas Q4 › COS-412` y ve el PDF renderizado sin salir
de la página. Nada de esto requiere abrir una tarea.

## 2. Diagnóstico: maqueta frente a implementación actual

| Capacidad en la maqueta | Estado hoy | Hueco |
| --- | --- | --- |
| Conmutador Entrada / Salida | No existe Entrada. Artefactos solo lista salidas de agentes (`company-artifacts.ts` une `issue_documents`, `issue_attachments` de agentes y work products `artifact`) | **Grande**: falta un almacén de archivos a nivel empresa |
| Árbol de carpetas + migas + atrás/adelante | Rejilla plana o "pilas" por tarea (`groupBy=task\|parent_task`) | Medio: la Salida es proyectable como árbol virtual con los datos actuales |
| Lista con columnas ordenables / vista iconos | Solo tarjetas | Medio: UI nueva sobre el mismo endpoint |
| Panel de vista previa (imagen, vídeo, PDF, Markdown, HTML, CSV/XLSX, JSON, PR) | Existen visores sueltos: `HtmlArtifactPreview`, `MarkdownBody`, `CsvPreview`, `OutputVideoPlayer`, `ImageGalleryModal`, vista raw de `FileViewerSheet`, `PullRequestCard`. No hay visor PDF, ni XLSX, ni JSON plegable | Medio: componer un `ArtifactPreviewPane` que reutilice los visores y añada PDF/XLSX/JSON |
| Doble clic abre a pantalla completa | `ImageGalleryModal` solo imagen/vídeo | Pequeño: generalizar un diálogo a cualquier visor |
| Subir / arrastrar / nueva carpeta en Entrada | Subida existe solo por tarea (`ArtifactDropzone`, `useIssueArtifactUploads`) | Medio: reutilizar componentes con un destino nuevo |
| Versiones (v1, v2, v3) y "Reemplazar por versión nueva" | Documentos tienen revisiones; adjuntos y work products no tienen versionado | Medio en Entrada (tabla nueva); pequeño en Salida (agrupar por familia de nombre dentro de la tarea) |
| "Usado por N tareas" en Entrada | Nada | Medio: registrar lecturas de agentes |
| "Pasar a Entrada" desde Salida | Nada | Pequeño: copiar referencia al asset |
| Favoritos / Recientes / Subidos por mí | `document_memberships.starredAt` solo para documentos | Medio: ampliar a archivos de Entrada y Salida |
| Menú contextual y atajos de teclado | Nada | Pequeño, solo UI |
| Enlaces compartibles (copiar enlace) | `href` apunta al ancla dentro de la tarea | Pequeño: ruta propia `/artifacts/...` con estado en URL |

Resumen: la Salida es sobre todo un problema de **presentación** sobre datos que ya
existen. La Entrada es un problema de **producto y datos**: hoy no hay ningún sitio
donde una persona deje archivos para toda la empresa ni mecanismo para que los
agentes los lean (los adjuntos de tarea solo llegan al agente si van en un comentario
del wake, con tope de 20).

## 3. Decisiones de diseño

1. **Una sola página, dos buzones.** `/artifacts` con conmutador `Entrada | Salida`.
   La ruta codifica el estado: `/artifacts/in/<folderId>?sel=<fileId>` y
   `/artifacts/out/<projectId>/<issueId>?sel=<artifactId>`. Los enlaces se pueden
   copiar y compartir.
2. **Entrada es un almacén propio, no un hack sobre tareas.** Tablas nuevas
   `company_files` y `company_file_versions`, apoyadas en `assets` (ya existe, con
   sha256 y proveedor local/S3) y en `folders` (ya existe con `kind`, `parentId`,
   `slug`). Se añade `FolderKind = "company_files"`. Carpetas raíz por defecto al
   crear la empresa: Marca, Precios, Legal, Clientes, Referencias, Briefs (sembradas
   como `systemKey`, renombrables).
3. **Salida es una proyección en árbol del endpoint actual.** El servicio
   `company-artifacts.ts` ya devuelve proyecto, tarea, agente, tipo y fecha por
   artefacto. Se añade un modo `tree` que devuelve los nodos de un nivel
   (`Proyectos`, `Sin proyecto`, proyecto, tarea) con contadores, y el listado de
   archivos de una tarea con todas las columnas. Nada se duplica en base de datos.
4. **Quién escribe dónde.** Entrada: escriben personas (board), los agentes leen.
   Salida: escriben agentes, las personas leen y descargan. La barra de estado lo
   dice en una línea. "Pasar a Entrada" es la única pasarela y la ejecuta una
   persona.
5. **Los agentes leen la Entrada por API y por herramienta nativa**, igual que los
   adjuntos de tarea: `list_company_files` / `read_company_file` en el runner
   nativo, `GET /api/companies/:companyId/files` y `/api/company-files/:id/content`
   para adaptadores heredados, y `paperclip files ...` en la CLI. No se inyecta el
   contenido en el prompt: se inyecta un **índice** (ruta, nombre, tipo, tamaño,
   versión) de la Entrada en el contexto del wake, con tope de 200 entradas, y el
   agente decide qué leer. Cada lectura se registra en el activity log con
   `issueId`, lo que alimenta la columna "Usado por".
6. **Vista previa sin descargar.** Un `ArtifactPreviewPane` único recibe
   `{contentType, contentPath, downloadPath, title, previewText}` y elige visor.
   PDF usa `<iframe src={contentPath}>` porque el servidor ya sirve `application/pdf`
   inline (`INLINE_ATTACHMENT_TYPES`); no se añade pdf.js en esta fase. XLSX se
   convierte a tabla con SheetJS (`xlsx`) cargado bajo demanda. JSON usa la vista
   raw con plegado simple. HTML reutiliza `HtmlArtifactPreview` con el conmutador
   renderizado/código. Markdown reutiliza `MarkdownBody`.
7. **Versionado.** Entrada: `company_file_versions` (una fila por subida, con
   `assetId`, `versionNumber`, `uploadedByUserId`, `note`). "Reemplazar" crea una
   versión nueva y mantiene el mismo `company_file.id`, por lo que las referencias
   de agentes siguen válidas. Salida: no se añade versionado real; se agrupan en el
   panel los archivos de la misma tarea cuyo nombre solo difiere en `-vN`, como
   hace la maqueta.
8. **Despliegue.** Inicialmente la página nueva iba detrás de un ajuste experimental.
   Ese ajuste y la página antigua se han retirado: `ArtifactsExplorer` es la única
   página de `/artifacts` (ver sección 11).
9. **Tokens y diseño.** Toda la UI nueva usa tokens de `ui/src/index.css` y
   primitivas de `ui/src/components/ui/`. La maqueta usa colores propios; se
   traduce a tokens (`bg-accent`, `text-muted-foreground`, `border-border`,
   radios y espaciados existentes). `pnpm check:token-gates` debe pasar.
10. **Idioma.** Textos nuevos en `ui/src/i18n/locales/es.json` y `en.json`
    (en es la referencia de validación; es es el idioma por defecto), bajo la clave
    `artifacts.explorer.*`. El resto de locales recibe el texto inglés hasta
    traducción.

## 4. Modelo de datos (fase 1)

```text
company_files
  id, company_id, folder_id (-> folders, kind=company_files, null = raíz),
  name, slug, content_type, byte_size, current_version_id,
  created_by_user_id, updated_by_user_id, deleted_at (papelera suave),
  created_at, updated_at
  índices: (company_id, folder_id, name) único donde deleted_at is null;
           (company_id, updated_at)

company_file_versions
  id, company_id, file_id (-> company_files, cascade), version_number,
  asset_id (-> assets), uploaded_by_user_id, note, created_at
  índice único: (file_id, version_number)

company_file_reads            -- alimenta "Usado por"
  id, company_id, file_id, version_id, issue_id, agent_id, run_id, created_at
  índice: (company_id, file_id, issue_id)

company_file_memberships y artifact_memberships (migración 0356) -> favoritos por
  usuario para archivos de Entrada y referencias de Salida (source + id). Recientes
  y "Subidos por mí" son accesos rápidos, no tablas.
```

Pasos: editar `packages/db/src/schema/company_files.ts` y `folders.ts`
(`FolderKind`), exportar en `schema/index.ts`, `pnpm db:generate`, y seguir
`rules/database-migration-snapshots.mdc`. Los tipos y validadores van en
`packages/shared/src/types/company-file.ts` y `validators/company-file.ts`.

## 5. API (fase 1 y 2)

Todas las rutas aplican `assertCompanyAccess`, escriben activity log con
`logActivity` y devuelven los códigos de error habituales.

Entrada (escritura solo board, lectura board o agente):

| Método | Ruta | Acción activity |
| --- | --- | --- |
| GET | `/api/companies/:companyId/files?folderId=&q=&sort=` | — |
| GET | `/api/companies/:companyId/files/tree` (carpetas con contadores) | — |
| POST | `/api/companies/:companyId/files` (multipart `file`, `folderId`) | `company_file.created` |
| POST | `/api/company-files/:id/versions` (multipart, reemplazar) | `company_file.version_added` |
| PATCH | `/api/company-files/:id` (renombrar, mover) | `company_file.updated` |
| DELETE | `/api/company-files/:id` (papelera suave) | `company_file.deleted` |
| GET | `/api/company-files/:id/content?version=&download=1` | `company_file.read` solo si actor es agente |
| GET | `/api/company-files/:id/versions` | — |
| POST | `/api/companies/:companyId/folders` (kind `company_files`) | `folder.created` |
| PATCH / DELETE | `/api/folders/:id` | `folder.updated` / `folder.deleted` |
| POST | `/api/companies/:companyId/files/from-artifact` (Pasar a Entrada: `source`, `id`, `folderId`) | `company_file.created` |

La subida reutiliza `MAX_ATTACHMENT_BYTES`, `normalizeUploadAttachmentContentType`
y, a diferencia de la ruta de adjuntos de tarea (que hoy no comprueba la lista
blanca), llama a `isAllowedContentType`. El contenido se sirve con las mismas
cabeceras que `/api/attachments/:id/content` (inline solo para
`INLINE_ATTACHMENT_TYPES`, `nosniff`, CSP sandbox para SVG y resto).

Salida (lectura):

| Método | Ruta |
| --- | --- |
| GET | `/api/companies/:companyId/artifacts/tree?node=root\|project:<id>\|none` → nodos hijo con `count`, `updatedAt`, `mediaKinds` |
| GET | `/api/companies/:companyId/artifacts?issueId=&sort=&dir=` → ampliar el endpoint actual con `issueId`, `sort` (`name\|type\|size\|date\|agent`) y `byteSize` en `CompanyArtifact` |
| GET | `/api/companies/:companyId/artifacts?groupBy=agent\|mediaKind\|day` → "Ver Salida por" del árbol |

Registrar todo en `server/src/routes/openapi.ts` (hay test `openapi-routes.test.ts`)
y en el mapa de acceso de agentes (`maps/agent-access-map`, luego
`node scripts/check-maps.mjs`).

## 6. Acceso de agentes a la Entrada (fase 3)

1. **Índice en el wake.** En `heartbeat/run-preparation.ts` añadir
   `companyFilesIndex` (ruta, nombre, tipo, tamaño, versión, `fileId`), tope 200,
   bandera `truncated`. En `task-markdown.ts` una sección "Archivos de la empresa"
   que explica cómo leerlos según runner. Respetar
   `rules/heartbeat-execution-boundaries.mdc`: la carga del índice vive en un
   módulo propio `heartbeat/company-files-context.ts`, no en `heartbeat.ts`.
2. **Herramientas nativas.** `list_company_files {folder?, after?}` y
   `read_company_file {fileId, offset, encoding, expectedSha256}` en
   `native-runtime/runner-company-files.ts`, copiando el patrón de
   `runner-task-attachments.ts` (páginas de 12000 bytes, caché por run, 16 MiB).
   Registrarlas en `runner-bridge-tools.ts` y `paperclip-runner-tool-authority.ts`.
   Cada lectura inserta en `company_file_reads` y en activity log.
3. **Adaptadores heredados y CLI.** `paperclip files list|download <fileId> --out`
   en `cli/src/commands/client/files.ts`; documentar en
   `skills/paperclip/references/company-files.md` y en `SKILL.md`.
4. **Permisos.** Un agente solo lee archivos de su `companyId` (clave de API o JWT
   del run). Las rutas de escritura rechazan actor agente con 403.

## 7. UI (fases 2 y 4)

Estructura de archivos nueva en `ui/src/pages/artifacts/` y
`ui/src/components/artifacts/explorer/`:

```text
pages/artifacts/ArtifactsExplorer.tsx     página; lee ruta y URL; conmuta Entrada/Salida
components/artifacts/explorer/
  ExplorerToolbar.tsx         Entrada|Salida, atrás/adelante, migas, búsqueda, lista|iconos, vista previa, Subir, +Carpeta, Descargar
  ExplorerTree.tsx            árbol lateral: Entrada, Salida, Ver Salida por, Acceso rápido
  ExplorerList.tsx            tabla con columnas ordenables (sticky header), selección, doble clic, teclado
  ExplorerIcons.tsx           rejilla de iconos con miniatura
  ExplorerStatusBar.tsx       "N elementos · 1 seleccionado · Solo escriben personas · los agentes leen"
  ExplorerContextMenu.tsx     sobre `ui/context-menu` (Radix) con atajos mostrados
  ArtifactPreviewPane.tsx     elige visor por contentType; cabecera, metadatos (kv), acciones, versiones
  viewers/PdfViewer.tsx       iframe inline
  viewers/SheetViewer.tsx     xlsx -> tabla (SheetJS bajo demanda), selector de hoja
  viewers/JsonViewer.tsx      raw con plegado
  ArtifactFullscreenDialog.tsx  doble clic / ⛶: cualquier visor a pantalla completa
hooks/useExplorerNavigation.ts  historial atrás/adelante en memoria + sincronía con URL
hooks/useCompanyFileUploads.ts  mismo contrato que useIssueArtifactUploads con destino carpeta
api/company-files.ts
```

Reutilización obligatoria: `ArtifactDropzone`, `ArtifactUploadControls`,
`HtmlArtifactPreview` + `FilePreviewModeToggle`, `MarkdownBody`, `CsvPreview`,
`OutputVideoPlayer`, `PullRequestCard`, `Input`, `Button`, `DropdownMenu`,
`Dialog`. No duplicar visores.

Comportamientos de la maqueta que se implementan tal cual: columnas distintas por
buzón (Entrada: Subido por, Usado por; Salida: Agente, Tarea), carpetas antes que
archivos, pastilla `vN`, estrella de favorito, arrastrar y soltar solo en Entrada,
teclado (↑↓ Enter Retroceso Espacio Esc), menú contextual distinto para carpeta y
archivo y por buzón, barra de estado, toasts para acciones.

Comportamientos de la maqueta que se dejan fuera o se simplifican:

- "Permisos…" por archivo: la Entrada es visible para toda la empresa en esta
  versión. Se muestra el texto, no un control.
- "Nueva pestaña": se sustituye por "Copiar enlace" (la ruta ya es compartible).
- "Descargar carpeta (ZIP)": fase 5 si hay demanda; requiere streaming en servidor.
- Miniaturas de imagen en vista iconos: se usa la imagen completa con `object-cover`
  y `loading="lazy"`, como hace `ArtifactCard`. Sin pipeline de miniaturas.

Responsive: en `< 900px` se oculta el árbol y la vista previa pasa a `Sheet`
inferior; en `< 640px` la lista ocupa todo y la vista previa es pantalla completa.
Seguir `DESIGN.md` para navegación móvil y campos de texto.

## 8. Fases y entregables

| Fase | Entregable | Verificación |
| --- | --- | --- |
| 1. Datos y API de Entrada | Tablas, migración, tipos shared, rutas de archivos y carpetas, siembra de carpetas raíz, test de rutas (`server/src/__tests__/company-files-routes.test.ts`) | `pnpm -r typecheck`, `pnpm test` filtrado, prueba manual con curl |
| 2. Explorador de Salida | Endpoint `tree` + `sort` + `byteSize`, página `ArtifactsExplorer` en modo Salida, `ArtifactPreviewPane` con visores existentes + PDF/XLSX/JSON, pantalla completa, teclado, menú contextual | Vitest de página y pane; `pnpm check:token-gates`; Storybook story del pane con un fixture por tipo |
| 3. Entrada en el explorador + acceso de agentes | Subida, carpetas, reemplazar, mover, renombrar, borrar, versiones, Pasar a Entrada; índice en wake, herramientas nativas, CLI, skill doc; columna Usado por | Test de `run-preparation` con índice; test de herramientas nativas; prueba en vivo: subir guía en Entrada y comprobar que un agente la lee y aparece en Usado por |
| 4. Favoritos, recientes, Ver Salida por, sustitución | Ampliar memberships; `groupBy=agent\|mediaKind\|day`; retirar la página antigua y el ajuste experimental; actualizar `maps/`, `doc/AGENT-ARTIFACTS.md`, `doc/SPEC-implementation.md` (sección Artefactos) | `pnpm -r typecheck && pnpm test:run && pnpm build`; `node scripts/check-maps.mjs` |
| 5. Opcional | ZIP de carpeta, pdf.js con búsqueda, permisos por carpeta, miniaturas | — |

Cada fase es una PR independiente con la plantilla `.github/PULL_REQUEST_TEMPLATE.md`.

## 9. Riesgos y mitigaciones

- **Coste de contexto del índice de Entrada en cada wake.** Tope de 200 entradas y
  solo metadatos; medir tokens en el test de `task-markdown`. Si crece, limitar a
  carpetas marcadas "visible para agentes" (ajuste por carpeta, fase 5).
- **Datos sensibles en Entrada leídos por agentes.** La lectura queda en activity
  log con `issueId`, `agentId`, `runId`; el panel muestra "Usado en". Sin control
  por archivo en esta versión; se documenta en la barra de estado.
- **Rendimiento del árbol de Salida.** El endpoint `tree` agrega por SQL
  (`count`, `max(updated_at)`) sobre las tres fuentes; no reusar el listado
  paginado para contar. Añadir índice `(company_id, project_id, issue_id)` si falta.
- **Visor PDF por iframe.** Depende del visor del navegador; en móvil puede
  descargar en vez de mostrar. Fallback: botón "Abrir en pestaña nueva" cuando
  `navigator.pdfViewerEnabled === false`.
- **SheetJS añade ~400 KB.** Cargar con `import()` solo al previsualizar xlsx.
- **Colisión de nombres.** `Inbox.tsx` ya existe para otra página. Usar
  `ArtifactsExplorer` y los términos `inbox`/`outbox` solo en claves i18n y rutas.
- **Lista blanca de tipos.** La ruta de adjuntos de tarea no la aplica hoy; la ruta
  nueva sí. Abrir issue separado para alinear la ruta antigua.

## 10. Fuera de alcance

- Edición de documentos dentro del explorador (seguir usando los documentos de tarea).
- Sincronización con Drive/Dropbox/SharePoint (va por Conectores).
- Permisos por carpeta o por usuario.
- Reemplazar las tarjetas de artefactos dentro de la tarea (`IssuePropertiesArtifactsTab`).

## 11. Estado (2026-10-21)

Estado documental de la implementación, revisado contra el código del árbol de
trabajo. Nada de esto está commiteado.

### Fases 1 a 4: implementadas

- **Fase 1, Entrada (datos y API).** Tablas `company_files`, `company_file_versions` y
  `company_file_reads` (migración `0355`); membresías de favoritos
  `company_file_memberships` y `artifact_memberships` (migración `0356`). Tipos y
  validadores en `packages/shared`; rutas en `server/src/routes/company-files.ts`;
  servicio `server/src/services/company-files.ts`. Carpetas raíz sembradas al primer
  uso (Marca, Precios, Legal, Clientes, Referencias, Briefs).
- Desviaciones del plan: las rutas de carpetas son
  `/api/companies/:companyId/files/folders` y `/api/company-files/folders/:id` (no
  `/api/folders/:id`). Se añaden `restore`, `usage` y `versions`.
- **Fase 2, explorador de Salida.** Endpoint `artifacts/tree`, orden (`sort`/`dir`),
  `byteSize`. Página `ArtifactsExplorer` con árbol, lista, iconos, barra de estado,
  menú contextual, teclado y pantalla completa. `ArtifactPreviewPane` con imagen, vídeo,
  PDF (iframe), Markdown, HTML (sandbox compartido), CSV, XLSX (SheetJS bajo demanda),
  JSON y texto. Salida no tiene versionado real; la UI agrupa en el panel los archivos
  de la misma tarea cuyo nombre solo difiere en `-vN`.
- **Fase 3, Entrada en el explorador y acceso de agentes.** Subida, nueva carpeta,
  renombrar, mover, borrar, reemplazar versión y "Mover a Entrada"
  (`components/artifacts/explorer/inbox/InboxDialogs.tsx`). "Usado en" del panel se
  alimenta de `/company-files/:id/usage`. Agentes: índice en el wake (tope 200),
  herramientas nativas `list_company_files` y `read_company_file` activas por defecto
  en todo run nativo `paperclip_runner` (no dependen de `dotAttachmentAccess`), CLI
  `paperclip files list|download`, documentación en `doc/AGENT-ARTIFACTS.md` y
  `skills/paperclip/references/company-files.md`.
- **Fase 4, favoritos, recientes, "Ver Salida por" y sustitución.** Accesos rápidos
  reales: `/artifacts/in/favorites`, `/artifacts/in/recent`, `/artifacts/in/mine` y
  `/artifacts/out/favorites`. Estrella vía `PUT .../resource-memberships/me/company-files/:id`
  y `PUT .../resource-memberships/me/artifacts/:source/:artifactId`. `GET .../me` devuelve
  `starredCompanyFileIds`, `companyFileStarredAt`, `starredArtifactRefs` y
  `artifactStarredAt`. `GET /companies/:id/files` acepta `scope`, `createdByMe` y
  `starred`. "Ver Salida por" usa `groupBy=agent|media_kind|day`. La biblioteca de
  tarjetas anterior y el ajuste experimental que la seleccionaba se han retirado, junto
  con sus tests e historias; `ArtifactsExplorer` es la única página de `/artifacts`.
- **Nombres de quien sube (nota de producto).** `createdByName`, `updatedByName` y
  `uploadedByName` resuelven en este orden: nombre del usuario de autenticación, email,
  y `null`. Un `null` se muestra como `—`.
- Mapas y documentación: `maps/feature-map/documents-artifacts.md`,
  `maps/agent-access-map/documents-artifacts.md`, sección "Artifacts explorer" de
  `doc/SPEC-implementation.md` y nota en `doc/html-artifact-previews.md`.
- Desviaciones de producto que siguen vigentes: "Permisos…" por archivo no existe
  (Entrada es visible para toda la empresa). "Copiar enlace" sustituye a "Nueva
  pestaña", y la ruta ya es compartible.

### Pendiente

- ZIP de carpeta (requiere streaming en servidor).
- pdf.js con búsqueda (hoy el PDF usa el visor inline del navegador).
- Permisos por carpeta o por archivo.
- Miniaturas (hoy la vista de iconos usa la imagen completa con `loading="lazy"`).
- Traducciones: las cadenas `artifacts.explorer.*` nuevas están en inglés como texto de
  respaldo en las 38 locales distintas de `en`.
- Fallos de tests preexistentes en el locale inglés, no relacionados con esta
  funcionalidad.
- Prueba en vivo no ejecutada: subir una guía en Entrada, comprobar que un agente la lee
  y que aparece en "Usado en".
- Prueba de navegador (e2e) del explorador: no existe.

### Riesgos abiertos

- El render real de PDF y XLSX en una instancia en marcha no está comprobado; solo la
  historia de Storybook con fixtures.
- No hay tests de `groupBy=media_kind` ni de `groupBy=day` en el servicio; solo
  `agent` tiene test de servicio.

### Verificación final (2026-10-21, tras las fases 1-5)

| Comprobación | Resultado |
| --- | --- |
| `tsc --noEmit` en shared, db, ui, cli, server | Limpio; único error previo en `server/src/instrumentation.ts` (OpenTelemetry, archivo no tocado) |
| `pnpm -r typecheck` (con `--config.shell-emulator=true`) | Todos los paquetes en verde salvo `paperclip-runner`, cuyo script exige `cargo` (Rust), no instalado |
| `pnpm -r build` (con emulador de shell) | shared, db, adapter-utils, plugins, catálogos, mcp y eval-kernel correctos; `paperclip-runner` falla por `cargo` y arrastra al build del servidor (vendoriza el runner). UI y CLI construidos aparte sin errores; pdf.js y xlsx salen en chunks propios bajo demanda |
| Vitest servidor, áreas del plan (company-files, company-artifacts, memberships, openapi, folders, runner-company-files, runner-task-attachments, heartbeat company-files-context, task-markdown, run-preparation, instance-settings) | 161 pruebas en verde antes de la fase 5; tras la fase 5, 23 + 3 + 7 + 21 + 21 en los archivos tocados |
| Vitest servidor completo | Primer intento directo no concluyente (3 h, 58 `postgres.exe` huérfanos). Se corrigió `scripts/run-vitest-stable.mjs` para Windows (lanza la entrada local de vitest con Node en lugar de `pnpm.cmd`, que no puede ejecutarse sin shell y con shell supera el límite de línea de `cmd`) y se relanzó el orquestador oficial en los grupos `general-server` y `serialized`; resultado: ver nota final |
| Vitest UI completo | 7885 en verde, 637 fallos en 134 archivos, ninguno del plan. Deuda previa de locale mixto: unas pruebas esperan inglés y otras español (forzando `en` suben a 1311). Los 28 de ajustes experimentales y barra lateral de agentes sí se arreglaron en este trabajo |
| Vitest UI, áreas del plan (explorador, vista previa, PDF, diálogos de Entrada, clientes API, i18n) | 251 en verde |
| Vitest shared / cli / adapter-utils / db | Fallos solo en archivos no tocados y por entorno Windows: `EPERM` en rename y fsync, permisos 0700, `spawn pnpm ENOENT`, timeouts de Postgres embebido (las migraciones pasan con 240 s de margen), 3 fallos de clúster plantilla |
| `node scripts/check-maps.mjs` | 35 áreas, 177 IDs, alineado |
| `node scripts/storybook-catalog.mjs --check` | Correcto |
| `node scripts/check-token-gates.mjs` | 0 violaciones en archivos del plan; 1 previa en `SidebarNavItem.tsx` de un commit anterior |
| Traducciones | 203 cadenas de `artifacts.explorer.*` traducidas en las 40 locales; validación i18n en verde |
| Prueba en vivo (instancia aislada con `PAPERCLIP_HOME`, API en el puerto 3177) | Correcta: carpetas por defecto sembradas; subida a Marca; 409 por nombre duplicado; 422 por tipo no permitido; contenido inline con `nosniff`; miniatura WebP de 320 px y 404 para Markdown; versión 2 con nota e histórico; contenido de la versión 1; renombrar, crear subcarpeta y mover; `scope=all`; estrella y lista de favoritos; carpeta oculta para agentes; ZIP de carpeta con rutas anidadas; agente con clave: ve solo lo visible, 404 en archivo oculto, 403 al escribir, lectura registrada en el activity log; tarea con adjunto del agente visible en el árbol de Salida con miniatura, estrella, ZIP por tarea, "Pasar a Entrada" copiando bytes y agrupación por agente |
| Prueba en vivo no cubierta | Lectura con contexto de run (columna "Usado en"): se intentó con un agente de adaptador `process` y un script, pero el servidor cae con `read ENOTCONN` al preparar cualquier run en Windows con Node 24, también con el adaptador `http` (la traza sale de un `execFile` tras "runtime connection tools could not be delivered"; fallo previo del arranque de runs, ajeno al plan). Ese camino queda cubierto por `company-files-routes.test.ts` ("an agent read is recorded with the run's issue and appears in usage") y `runner-company-files.test.ts`. Sin verificación visual en navegador |
