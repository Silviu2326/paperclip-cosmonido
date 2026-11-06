#!/usr/bin/env node
// A URL import bootstraps source mode without requiring .ts import specifiers.
if (import.meta.url.endsWith(".ts")) {
  const { registerSourceResolution } = await import(new URL("./register-source.ts", import.meta.url).href);
  registerSourceResolution();
}
const { runCli } = await import("./index.js");
process.exitCode = await runCli(process.argv.slice(2), {
  stdout: process.stdout, stderr: process.stderr, env: process.env, cwd: process.cwd(),
});
