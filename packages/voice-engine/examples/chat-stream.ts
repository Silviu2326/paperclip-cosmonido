import { createLlmEngine, allLlmProviders } from "../src/llm/index.js";

const engine = createLlmEngine({ providers: allLlmProviders });
for await (const event of engine.stream({ tier: "fast", messages: [{ role: "user", content: process.argv.slice(2).join(" ") || "Say hello." }] })) {
  if (event.type === "text_delta") process.stdout.write(event.text);
  if (event.type === "done") process.stderr.write(`\n${event.result.usage.outputTokens} tokens; TTFT ${event.result.ttftMs ?? "n/a"} ms\n`);
}
