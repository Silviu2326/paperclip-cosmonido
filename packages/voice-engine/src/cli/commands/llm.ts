import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { allLlmProviders } from "../../llm/index.js";
import type { LlmProvider, LlmProviderDefinition, LlmStreamEvent } from "../../llm/types.js";
import { choice, flag, numeric, option, positional, type ParsedArgs } from "../args.js";
import { output, table, write, type CliContext } from "../context.js";

export const providersHelp = "llm-providers [--provider ID]";
export const modelsHelp = "llm-models [--provider ID] [--tier flagship|balanced|fast|legacy]";
export const chatHelp = "chat <prompt|-|@file> [--provider ID] [--model ID] [--system TEXT] [--tier fast] [--stream] [--temperature N] [--max-tokens N] [--json-schema FILE] [--tools]";
export const benchHelp = "llm-bench [--provider a,b,c] [--model ID] [--runs 5] [--prompt TEXT]";
function staticLlm(def: LlmProviderDefinition): LlmProvider { return def.create({ credentials: Object.fromEntries(Object.keys(def.credentialEnv).map((field) => [field, field === "baseUrl" ? "http://localhost" : "static-metadata-placeholder"])), fetch: (async () => { throw new Error("static provider metadata cannot make network calls"); }) as typeof fetch }); }
function engine(ctx: CliContext) { if (!ctx.llmEngine) throw new Error("LLM engine is unavailable in this CLI context."); return ctx.llmEngine; }
export async function listProviders(ctx: CliContext, args: ParsedArgs) { positional(args, 0); const id = option(args, "provider"); const rows = allLlmProviders.filter(x => !id || x.id === id).map(x => ({ id: x.id, name: x.name, docsUrl: x.docsUrl, credentialEnv: x.credentialEnv, requiredCredentials: x.requiredCredentials, capabilities: staticLlm(x).capabilities })); output(ctx, rows, table(["ID", "NAME", "CREDENTIALS", "STREAM"], rows.map(x => [x.id, x.name, Object.values(x.credentialEnv).flat().join(", ") || "none", x.capabilities.streaming]))); }
export async function listModels(ctx: CliContext, args: ParsedArgs) { positional(args, 0); const provider = option(args, "provider"); const tier = choice(args, "tier", ["flagship", "balanced", "fast", "legacy"]); const models = (await Promise.all(allLlmProviders.filter(x => !provider || x.id === provider).map(x => staticLlm(x).listModels()))).flat().filter(x => !tier || x.tier === tier); output(ctx, models, table(["PROVIDER", "MODEL", "TIER", "LATENCY", "CONTEXT"], models.map(x => [x.provider, x.id, x.tier, x.latencyClass, x.contextWindow ?? "-"]))); }

/** Run one chat request and report latency, tokens, and estimated cost. */
export async function chat(ctx: CliContext, args: ParsedArgs) {
  const [input] = positional(args, 1); const prompt = input === "-" ? await stdinText(ctx) : input.startsWith("@") ? await readFile(input.slice(1), "utf8") : input;
  const schemaFile = option(args, "json-schema"); const responseFormat = schemaFile ? { type: "json_schema" as const, name: "response", schema: JSON.parse(await readFile(schemaFile, "utf8")) as Record<string, unknown>, strict: true } : undefined;
  const tools = flag(args, "tools") ? demoTools() : undefined; const request = { provider: option(args, "provider"), model: option(args, "model"), tier: choice(args, "tier", ["flagship", "balanced", "fast", "legacy"]), system: option(args, "system"), messages: [{ role: "user" as const, content: prompt }], temperature: numeric(args, "temperature", 0, 2), maxTokens: numeric(args, "max-tokens", 1, 1_000_000, true), responseFormat, tools };
  const started = performance.now(); let deltas = ""; let ttft: number | undefined;
  if (flag(args, "stream")) {
    const events: LlmStreamEvent[] = []; for await (const event of engine(ctx).stream(request)) { events.push(event); if (event.type === "text_delta") { ttft ??= performance.now() - started; deltas += event.text; if (!ctx.json) write(ctx.io.stdout, event.text); } }
    const result = events.findLast(event => event.type === "done")?.type === "done" ? (events.findLast(event => event.type === "done") as Extract<LlmStreamEvent, {type:"done"}>).result : undefined;
    const summary = { text: deltas || result?.text || "", usage: result?.usage, ttftMs: ttft ?? result?.ttftMs, latencyMs: performance.now() - started, provider: result?.provider, model: result?.model };
    if (ctx.json) output(ctx, summary); else write(ctx.io.stdout, `\nTTFT ${summary.ttftMs ?? "n/a"} ms; ${summary.usage?.inputTokens ?? "?"} in / ${summary.usage?.outputTokens ?? "?"} out; cost ${summary.usage?.estimatedCents ?? "unpriced"} cents\n`); return;
  }
  const result = await engine(ctx).complete(request); output(ctx, { text: result.text, usage: result.usage, ttftMs: result.ttftMs, latencyMs: result.latencyMs, provider: result.provider, model: result.model }, `${result.text}\nTTFT ${result.ttftMs ?? "n/a"} ms; ${result.usage.inputTokens} in / ${result.usage.outputTokens} out; cost ${result.usage.estimatedCents ?? "unpriced"} cents\n`);
}

/** Measure first token and streaming throughput for selected providers. */
export async function benchmark(ctx: CliContext, args: ParsedArgs) { positional(args, 0); const ids = option(args, "provider")?.split(",").map(x => x.trim()).filter(Boolean) ?? await engine(ctx).availableProviders(); const runs = numeric(args, "runs", 1, 100, true) ?? 5; const prompt = option(args, "prompt") ?? "Reply with one short sentence."; const rows = []; for (const provider of ids) { const times: number[] = []; let tokens = 0; for (let i = 0; i < runs; i++) { const start = performance.now(); let first: number | undefined; for await (const event of engine(ctx).stream({ provider, model: option(args, "model"), messages: [{ role: "user", content: prompt }] })) if (event.type === "text_delta") { first ??= performance.now() - start; tokens += Math.max(1, event.text.trim().split(/\s+/).length); } if (first !== undefined) times.push(first); } const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : null; rows.push({ provider, runs, successfulRuns: times.length, meanTtftMs: avg, tokensPerSecond: avg && tokens ? tokens / ((avg / 1000) * Math.max(1, runs)) : null }); } output(ctx, rows, table(["PROVIDER", "RUNS", "MEAN TTFT MS", "TOKENS/S APPROX"], rows.map(x => [x.provider, `${x.successfulRuns}/${x.runs}`, x.meanTtftMs?.toFixed(1) ?? "n/a", x.tokensPerSecond?.toFixed(1) ?? "n/a"]))); }

function demoTools() { return [{ name: "echo", description: "Echo a string", inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } }, { name: "time", description: "Get current ISO time", inputSchema: { type: "object", properties: {}, required: [] } }, { name: "calc", description: "Add two numbers", inputSchema: { type: "object", properties: { a: { type: "number" }, b: { type: "number" } }, required: ["a", "b"] } }]; }
async function stdinText(ctx: CliContext): Promise<string> { if (typeof ctx.io.stdin === "string") return ctx.io.stdin; if (!ctx.io.stdin) return ""; let text = ""; for await (const part of ctx.io.stdin) text += typeof part === "string" ? part : new TextDecoder().decode(part); return text; }
