import { existsSync } from "node:fs";
import { registerHooks, stripTypeScriptTypes } from "node:module";
import { fileURLToPath } from "node:url";

const packageRoot = new URL("../../", import.meta.url).href;

/** Resolve package-local .js imports to source .ts files under Node's type stripper. */
export function registerSourceResolution(): void {
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if ((specifier.startsWith("./") || specifier.startsWith("../")) && specifier.endsWith(".js") && context.parentURL?.startsWith(packageRoot)) {
        const target = new URL(specifier, context.parentURL);
        if (target.href.startsWith(packageRoot) && !existsSync(fileURLToPath(target))) {
          const source = new URL(target.href.slice(0, -3) + ".ts");
          if (existsSync(fileURLToPath(source))) return nextResolve(source.href, context);
        }
      }
      return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
      const loaded = nextLoad(url, context);
      if (url.startsWith(packageRoot) && url.endsWith(".ts") && loaded.format === "module-typescript" && loaded.source != null) {
        const source = typeof loaded.source === "string" ? loaded.source : new TextDecoder().decode(loaded.source);
        let javascript: string;
        try { javascript = stripTypeScriptTypes(source, { mode: "strip", sourceUrl: url }); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX") throw error;
          // Some engine dependencies use parameter properties. Node's built-in
          // transformer handles these without introducing a runtime dependency.
          javascript = stripTypeScriptTypes(source, { mode: "transform", sourceUrl: url });
        }
        return { ...loaded, format: "module", source: javascript };
      }
      return loaded;
    },
  });
}
