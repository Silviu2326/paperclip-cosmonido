#!/usr/bin/env node
/**
 * Vendors the lpc-v1 sprite subset from a local checkout of the Universal LPC
 * Spritesheet Character Generator into server/src/lpc-assets.
 *
 *   node scripts/sync-lpc-assets.mjs --source /path/to/Universal-LPC-Spritesheet-Character-Generator
 *   node scripts/sync-lpc-assets.mjs --list     # print the sprite folders the catalog needs
 *   node scripts/sync-lpc-assets.mjs --check    # verify the vendored bundle is complete
 *
 * The catalog in packages/shared/src/lpc-character.ts is the source of truth:
 * only the folders and animations it references are copied, together with the
 * ULPC palettes and the credits rows for those files. The bundle is frozen with
 * the character version; re-running against a newer upstream commit changes
 * pixels and needs a new version.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = resolve(REPO_ROOT, "server/src/lpc-assets");
const MATERIALS = ["body", "hair", "cloth", "eye"];
const UPSTREAM = "https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };

async function catalog() {
  const serverRequire = createRequire(new URL("../server/package.json", import.meta.url));
  const { tsImport } = await import(pathToFileURL(serverRequire.resolve("tsx/esm/api")).href);
  return tsImport("../packages/shared/src/lpc-character.ts", import.meta.url);
}
function parseCsv(text) {
  const rows = []; let row = []; let field = ""; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += char;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(cells => cells.some(cell => cell.trim().length));
}
const csvCell = (value) => `"${String(value ?? "").trim().replace(/"/g, '""')}"`;

function listFiles(dir, base = dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path, base) : [path.slice(base.length + 1).replaceAll("\\", "/")];
  });
}

const { lpcAssetFolders, LPC_ANIMATIONS } = await catalog();
const folders = lpcAssetFolders();
const expected = folders.flatMap(folder => LPC_ANIMATIONS.map(animation => `${folder}${animation}.png`));

if (flag("--list")) { console.log(folders.join("\n")); process.exit(0); }

if (flag("--check")) {
  const missing = expected.filter(file => !existsSync(join(TARGET, "spritesheets", file)));
  const present = new Set(expected);
  const extra = listFiles(join(TARGET, "spritesheets")).filter(file => !present.has(file));
  const palettes = MATERIALS.filter(material => !existsSync(join(TARGET, "palettes", `${material}.json`)));
  const problems = [...missing.map(f => `missing sprite ${f}`), ...extra.map(f => `unexpected sprite ${f}`), ...palettes.map(m => `missing palette ${m}`)];
  if (!existsSync(join(TARGET, "CREDITS.csv"))) problems.push("missing CREDITS.csv");
  if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
  console.log(`lpc-v1 bundle complete: ${expected.length} sprites, ${MATERIALS.length} palettes.`);
  process.exit(0);
}

const source = option("--source");
if (!source) { console.error("Usage: node scripts/sync-lpc-assets.mjs --source <generator checkout> | --list | --check"); process.exit(2); }
const missing = expected.filter(file => !existsSync(join(source, "spritesheets", file)));
if (missing.length) { console.error(`Source checkout lacks ${missing.length} sprites:\n${missing.join("\n")}`); process.exit(1); }

rmSync(join(TARGET, "spritesheets"), { recursive: true, force: true });
for (const file of expected) {
  const destination = join(TARGET, "spritesheets", file);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(join(source, "spritesheets", file), destination);
}
mkdirSync(join(TARGET, "palettes"), { recursive: true });
const bases = {};
for (const material of MATERIALS) {
  const meta = JSON.parse(readFileSync(join(source, "palette_definitions", material, `meta_${material}.json`), "utf8"));
  const palette = JSON.parse(readFileSync(join(source, "palette_definitions", material, `${material}_${meta.default}.json`), "utf8"));
  bases[material] = meta.base;
  if (!palette[meta.base]) throw new Error(`Palette ${material} lacks its base variant ${meta.base}`);
  writeFileSync(join(TARGET, "palettes", `${material}.json`), JSON.stringify({ base: meta.base, variants: palette }, null, 1) + "\n");
}

const credits = parseCsv(readFileSync(join(source, "CREDITS.csv"), "utf8"));
const [header, ...rows] = credits;
const vendored = new Set(expected);
const kept = rows.filter(row => vendored.has(row[0].trim()));
const seenFiles = new Set(kept.map(row => row[0].trim()));
const uncredited = expected.filter(file => !seenFiles.has(file));
// Upstream credits one representative file per folder; cover every vendored
// animation by crediting the whole folder when a row names any file in it.
const byFolder = new Map();
for (const row of rows) {
  const folder = row[0].trim().replace(/[^/]*$/, "");
  if (folders.includes(folder)) byFolder.set(folder, [...(byFolder.get(folder) ?? []), row]);
}
const creditRows = [];
for (const folder of folders) {
  const entries = byFolder.get(folder) ?? [];
  if (!entries.length) throw new Error(`No credits row covers ${folder}`);
  const merged = entries[0].slice();
  merged[0] = `${folder}*`;
  creditRows.push(merged);
}
void uncredited;
writeFileSync(join(TARGET, "CREDITS.csv"), [header, ...creditRows].map(row => row.map(csvCell).join(",")).join("\n") + "\n");

let commit = "unknown";
try { commit = execFileSync("git", ["-C", source, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(); } catch { /* not a git checkout */ }
writeFileSync(join(TARGET, "PROVENANCE.md"), `# lpc-v1 sprite bundle

Source: ${UPSTREAM}
Commit: ${commit}
Synced: ${new Date().toISOString().slice(0, 10)} by scripts/sync-lpc-assets.mjs

Artwork: Liberated Pixel Cup contributors; see CREDITS.csv for the authors,
licenses (CC0, CC-BY, CC-BY-SA, OGA-BY, GPL) and source URLs of every vendored
folder. Paperclip serves CREDITS.csv at /api/agent-avatars/lpc-v1/credits and
links it from the character editor, which satisfies the attribution
requirement of the CC-BY / CC-BY-SA / OGA-BY licenses. The composited images
are derivative artwork distributed under CC-BY-SA 3.0 or later.

Palettes: the ULPC material palettes (body, hair, cloth, eye) with their base
variants ${JSON.stringify(bases)}; recolouring matches source colours with a
tolerance of 1 per channel, as the generator does.

Contents: ${folders.length} sprite folders x ${LPC_ANIMATIONS.length} animations (${LPC_ANIMATIONS.join(", ")}).
Keep this bundle immutable after release; new artwork needs a new character version.
`);
console.log(`Vendored ${expected.length} sprites from ${folders.length} folders, ${MATERIALS.length} palettes, ${creditRows.length} credit rows.`);
