# Language models

The LLM engine presents provider-neutral chat messages, streaming deltas, tool calls, response formats, usage and TTFT. `llm-providers` and `llm-models` read static metadata without credentials; `chat` supports one-shot or streaming requests, JSON Schema output, and optional demo tools. Tool calls are executed only when an application explicitly runs the tool loop with handlers.

Use `tier: "fast"` for latency-sensitive voice interactions, then measure with `llm-bench` in the target environment. The benchmark contacts providers and is intentionally not used by automated tests. Reported token counts and estimates follow provider responses; unknown pricing stays null.

```ts
for await (const event of llm.stream({ messages: [{ role: "user", content: "Hello" }] })) {
  if (event.type === "text_delta") process.stdout.write(event.text);
}
```
