import { fileURLToPath } from "node:url";
import { createServer } from "vite";

// Execute the same eager locale initialization as the browser before shipping.
// This includes raw dictionaries, merged productization messages and the strict
// key, placeholder and payload checks in locale-validation.ts.
const server = await createServer({
  configFile: false,
  root: fileURLToPath(new URL("..", import.meta.url)),
  logLevel: "error",
  server: { middlewareMode: true, watch: null, ws: false },
  optimizeDeps: { noDiscovery: true, include: [] },
});

try {
  const { localeMessages, supportedLocales, loadLocaleMessages } =
    await server.ssrLoadModule("/src/i18n/locales.ts");
  const i18nextResources = Object.fromEntries(await Promise.all(
    supportedLocales.map(async (locale) => [locale, await loadLocaleMessages(locale)]),
  ));
  const expected = [...supportedLocales].sort().join(",");
  for (const [name, resources] of Object.entries({ localeMessages, i18nextResources })) {
    if (Object.keys(resources).sort().join(",") !== expected) {
      throw new Error(name + " must contain exactly the supported locales");
    }
  }
  console.log("Validated " + supportedLocales.length + " locales and their merged runtime resources.");
} finally {
  await server.close();
}
