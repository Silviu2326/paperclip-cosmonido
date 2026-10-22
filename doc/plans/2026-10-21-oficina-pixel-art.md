# Oficina pixel art: ver a los agentes en una oficina propia y personalizarla por chat

Fecha: 2026-10-21
Estado: implementado y validado en local el 2026-10-22 (sin desplegar)
Depende de: personajes `lpc-v1` (`doc/agent-personas.md`, sección "Pixel-art characters")

## Objetivo

Una página `/office` por empresa que muestra una oficina en pixel art (estilo
Liberated Pixel Cup, el mismo de los personajes). Cada agente aparece con su
sprite `lpc-v1`, se mueve y actúa según su estado real (trabajando en su mesa,
paseando, dormido en el sofá, confundido). Cada usuario tiene su propia
distribución de la oficina para cada empresa, y la personaliza hablando con un
panel de chat ("pon una planta junto a la ventana", "mesa nueva para Walter").

## Principios

- Misma estética que los personajes: tiles LPC de 32 px, sprites de 64 px.
- Sin WebGL ni motor externo: canvas 2D con `requestAnimationFrame`, pausado
  cuando la pestaña no es visible o la página no está montada.
- El servidor manda en los datos: la distribución se persiste por
  `(companyId, userId)`; el chat genera **parches** sobre esa distribución y se
  aplican y guardan por la vía normal.
- Nada nuevo de telemetría, nada de flags experimentales.
- Arte vendorizado con créditos accesibles (CC-BY-SA / OGA-BY exigen atribución).

## Contratos (se fijan aquí para trabajar en paralelo)

### 1. Catálogo de tiles y objetos (`ui/public/office/catalog.json`)

```jsonc
{
  "version": 1,
  "tileSize": 32,
  "atlases": { "interior": "/office/interior.png" },       // PNG con la hoja
  "floors": { "wood": { "atlas": "interior", "x": 0, "y": 0 }, "carpet_blue": { ... } },
  "walls":  { "plaster": { "atlas": "interior", "top": {"x":..,"y":..}, "face": {"x":..,"y":..} } },
  "objects": {
    "desk": { "atlas": "interior", "x": 64, "y": 96, "w": 64, "h": 48,
              "footprint": { "w": 2, "h": 1 }, "walkable": false, "seat": { "dx": 0, "dy": 1, "facing": "up" },
              "label": { "es": "Mesa", "en": "Desk" } },
    "chair": {...}, "plant": {...}, "sofa": {...}, "coffee": {...}, "window": {...}, "bookshelf": {...}, "whiteboard": {...}
  }
}
```

- `x,y,w,h` en píxeles dentro del atlas; `footprint` en tiles; el objeto se
  dibuja anclado a su tile inferior izquierdo y se ordena por `y` (z-order).
- `seat` indica dónde se sienta un agente y hacia dónde mira.
- `CREDITS-office.csv` junto al catálogo con autor, licencia y URL por atlas, y
  enlace desde la página (igual que `/api/agent-avatars/lpc-v1/credits`).

### 2. Distribución (`packages/shared/src/office-layout.ts`)

```ts
export const officeLayoutSchema = z.object({
  version: z.literal(1),
  cols: z.number().int().min(8).max(40),
  rows: z.number().int().min(6).max(30),
  floor: z.string(),            // id de catalog.floors
  wall: z.string(),             // id de catalog.walls
  objects: z.array(z.object({
    id: z.string(),             // nanoid estable
    kind: z.string(),           // id de catalog.objects
    x: z.number().int(), y: z.number().int(),
    agentId: z.uuid().optional(),   // mesa/silla asignada
    label: z.string().max(40).optional(),
  })).max(400),
}).strict();
export const officePatchSchema = z.array(z.discriminatedUnion("op", [
  { op: "add", kind, x, y, agentId?, label? },
  { op: "move", id, x, y },
  { op: "remove", id },
  { op: "assign", id, agentId: uuid | null },
  { op: "theme", floor?, wall? },
  { op: "resize", cols, rows },
]));
export function applyOfficePatch(layout, patch, catalog): { layout, rejected: string[] }  // valida colisiones y bordes
export function defaultOfficeLayout(agents: {id, name}[]): OfficeLayout            // una mesa por agente, sofá, café, plantas
```

### 3. API (`server/src/routes/office.ts`)

- `GET  /api/companies/:companyId/office/layout` → la del usuario, o la por
  defecto (no persistida) con `source: "default" | "saved"`.
- `PUT  /api/companies/:companyId/office/layout` body `{ layout }` → valida con
  `officeLayoutSchema`, guarda (upsert por `(companyId, userId)`), activity
  `office.layout_updated`. Actor `board` solo (los agentes no editan oficinas).
- `DELETE /api/companies/:companyId/office/layout` → vuelve a la por defecto.
- `POST /api/companies/:companyId/office/design-chat` body `{ message, layout,
  history: [{role, content}] }` → `{ reply, patch }`. Usa la conexión de IA por
  defecto de la empresa (Anthropic) con **tool use** forzado a
  `apply_office_patch(patch)`; si no hay conexión disponible responde 409 con
  `{ error: "no_ai_connection" }` y la UI usa el intérprete local.
- Tabla `office_layouts` (`packages/db/src/schema/office_layouts.ts`): id,
  company_id (fk cascade), user_id text, layout jsonb, created_at, updated_at,
  unique (company_id, user_id). Migración con `pnpm db:generate`.

### 4. Hoja de sprites para el mundo (`/api/agent-avatars/lpc-v1/<spec>/world.png`)

Hoja nativa de 64 px, 9 columnas × 8 filas, orden de direcciones LPC
(arriba, izquierda, abajo, derecha):

- filas 0-3: columna 0 = `idle` frame 0 de esa dirección; columnas 1-8 =
  `walk` frames 1-8.
- filas 4-7: columna 0 = `sit` frame 0 de esa dirección (resto vacío).

Se implementa en `server/src/services/lpc-character-renderer.ts` reutilizando
`composeLpcStrip` generalizado a cualquier fila de dirección, y en la ruta
`agent-avatars.ts` como `pose = "world"` (misma caché, mismo `muted`).
`packages/shared` exporta `LPC_WORLD_SHEET` con esta geometría y
`agentWorldSheetUrl(appearance)`.

### 5. Comportamiento (`ui/src/office/simulation.ts`)

| Estado del agente (`characterStateForAgent`) | Comportamiento |
| --- | --- |
| `working` | va a su mesa asignada (o a una libre) y se sienta mirando al monitor |
| `idle` | pasea entre puntos de interés (café, ventana, pizarra) con pausas |
| `thinking` / `loading` | de pie junto a la pizarra |
| `confused` | de pie, con icono "?" encima |
| `rest` (pausado / terminado) | no aparece; en `sleepy` duerme en el sofá |
| `success` | pequeño salto al llegar a la mesa |

Movimiento por tiles con A* sobre la cuadrícula de `walkable`; 4 direcciones;
velocidad ~2 tiles/s; nombre bajo el sprite al pasar el ratón; clic abre la
página del agente.

### 6. Chat de personalización (`ui/src/office/design-chat.ts` + panel)

- Intérprete local (sin IA) para órdenes frecuentes en español e inglés:
  añadir/quitar/mover objetos por nombre y referencia ("junto a la ventana",
  "arriba a la izquierda", "al lado de la mesa de Walter"), cambiar suelo/pared,
  asignar mesa a un agente, agrandar/encoger. Produce un `OfficePatch`.
- Si existe conexión de IA: primero el endpoint `design-chat`; si falla o no
  hay conexión, el intérprete local. Siempre se enseña el parche aplicado en el
  propio chat ("He puesto una planta en (12, 3)") con "Deshacer".
- Cada parche se aplica en memoria, se valida con `applyOfficePatch` y se guarda
  con `PUT` (debounce 1 s). Botón "Restablecer oficina".

### 7. Página (`ui/src/pages/Office.tsx`, ruta `/office`, entrada en Sidebar)

Canvas a la izquierda (ajusta al contenedor, zoom entero 1×/2×), panel de chat
a la derecha (colapsable). Cabecera: nombre de la empresa, número de agentes
presentes, enlace a créditos. Todo texto por `useTranslation` (es + en, resto
copia en inglés). Solo tokens de `ui/src/index.css`.

## Paquetes de trabajo (en paralelo)

- **WP-A Arte y catálogo**: investigar tilesets LPC de interior/oficina con
  licencia compatible (OpenGameArt: "LPC Base Assets", "LPC Interior",
  "LPC Office", "LPC Modern Office" y similares; repos git que los mirroren),
  vendorizar un atlas curado en `ui/public/office/`, escribir `catalog.json`
  según el contrato 1 y `CREDITS-office.csv`, y un test que valide que todas las
  entradas del catálogo caen dentro del atlas.
- **WP-B Datos y servidor**: contrato 2 en shared (con tests de
  `applyOfficePatch` y `defaultOfficeLayout`), tabla y migración, rutas del
  contrato 3 con company scoping, activity log y tests de ruta, hoja `world.png`
  del contrato 4 con test, `design-chat` con Anthropic tool use y test con
  `fetch` simulado.
- **WP-C Interfaz**: motor canvas, simulación (contrato 5), intérprete local y
  panel de chat (contrato 6), página y ruta (contrato 7), cliente API
  `ui/src/api/office.ts`, i18n, tests de la simulación y del intérprete. Hasta
  que WP-A entregue, usa un catálogo de desarrollo con rectángulos de color
  generados en código y la misma forma del contrato 1.

## Verificación antes de dar por hecho

```sh
pnpm exec vitest run packages/shared/src/office-layout.test.ts
pnpm exec vitest run server/src/__tests__/office-routes.test.ts server/src/__tests__/lpc-character-renderer.test.ts
pnpm exec vitest run ui/src/office
pnpm -r typecheck && pnpm check:token-gates
```

Validación manual: `pnpm dev`, crear dos agentes, abrir `/office`, ver que uno
trabajando se sienta en su mesa y uno inactivo pasea; pedir por chat "pon un
sofá abajo a la derecha" y recargar para comprobar que persiste.

## Fuera de alcance (por ahora)

Oficina compartida entre usuarios, objetos animados, sonido, varias plantas,
edición por arrastre con el ratón (puede venir después del chat).

## Estado (2026-10-22)

Implementado por tres subagentes (arte, servidor, interfaz) y validado a mano en
una instancia local aislada: la oficina se dibuja con el atlas LPC, el agente en
`running` se sienta en su mesa, el `idle` pasea, el `error` muestra "?", el chat
local aplica "pon una planta junto a la ventana", el cambio se guarda
(`office.layout_updated`) y sobrevive a la recarga.

Cómo probarlo sin tocar tu instancia habitual (desde la raíz del repo):

```sh
cd server && PAPERCLIP_HOME=C:/t/pcdev PAPERCLIP_MIGRATION_AUTO_APPLY=true   PAPERCLIP_UI_DEV_MIDDLEWARE=true npx tsx src/index.ts
# luego abre http://localhost:3100/<PREFIJO>/office
```

(`pnpm dev` también sirve si tienes `cargo` instalado; aquí no lo estaba.)

Pendiente / conocido:

- El intérprete local no conoce todavía `lamp`, `printer` ni `water_cooler`
  (añadir sinónimos en `ui/src/office/design-chat.ts`).
- `design-chat` fuerza `tool_choice`; si el proveedor responde 400 reintenta
  con `auto` y, sin llamada a herramienta, devuelve solo texto. No probado
  contra la API real (requiere conexión Anthropic configurada).
- La pizarra es un marcador propio, no arte LPC; la estantería es un armario.
- `OFFICE_SERVER_CATALOG` (servidor) refleja `ui/public/office/catalog.json`;
  `office-catalog-sync.test.ts` falla si se desalinean.
- Los agentes recién creados con adaptador `process` quedan en `paused`
  (ausentes de la oficina) hasta que su ciclo de vida los active.
