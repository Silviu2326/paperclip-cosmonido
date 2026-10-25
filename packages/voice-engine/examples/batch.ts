import { fileURLToPath } from "node:url";
const { help } = await import(new URL("./_runtime.ts", import.meta.url).href) as typeof import("./_runtime.js");
help("OPENAI_API_KEY is required for the default manifest. Run: node --experimental-strip-types examples/batch.ts [manifest.json]");
const { runCli } = await import("../src/cli/index.js");
const manifest = process.argv[2] ?? fileURLToPath(new URL("./multi-language-batch.json", import.meta.url));
process.exitCode = await runCli(["batch", manifest, "--concurrency=2", "--out-dir=audio/batch", "--json"], {
  stdout: process.stdout, stderr: process.stderr, env: process.env, cwd: process.cwd(),
});
