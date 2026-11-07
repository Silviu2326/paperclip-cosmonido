// Source-only bootstrap: all normal package imports retain their .js suffixes.
const { registerSourceResolution } = await import(new URL("../src/cli/register-source.ts", import.meta.url).href);
registerSourceResolution();
export const { createVoiceEngine } = await import("../src/core/engine.js");
export const { allProviders } = await import("../src/providers/index.js");
export const { createFileStorage } = await import("../src/core/storage.js");
export const { createFileCache } = await import("../src/core/cache.js");

/** Print invocation help without making a provider call. */
export function help(text: string): void {
  if (process.argv.includes("--help")) { console.log(text); process.exit(0); }
}
