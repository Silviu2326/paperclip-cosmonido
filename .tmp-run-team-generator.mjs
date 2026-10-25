import os from "node:os";
import { syncBuiltinESMExports } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
os.userInfo = () => ({ username: "codex", uid: -1, gid: -1, homedir: process.cwd(), shell: "" });
syncBuiltinESMExports();
process.env.NODE_OPTIONS = `--import=${path.resolve(process.cwd(), "../../.tsx-userinfo-preload.mjs")}`;
process.argv = [process.execPath, "tsx", "scripts/build-catalog-manifest.ts"];
await import(pathToFileURL(process.cwd().replaceAll("\\", "/") + "/../../cli/node_modules/tsx/dist/cli.mjs").href);
