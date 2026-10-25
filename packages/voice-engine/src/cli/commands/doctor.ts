import { option, positional, type ParsedArgs } from "../args.js";
import { output, table, type CliContext } from "../context.js";
import { errorDetails, errorText } from "../errors.js";
import { availableProviderIds, credentialRequirements } from "../credentials.js";
import { allSttProviders } from "../../stt/index.js";
import { allLlmProviders } from "../../llm/index.js";
import { allRealtimeProviders } from "../../realtime/index.js";
export const help = "doctor [--provider ID]\nCheck credentials and health for TTS, STT, LLM, and realtime definitions where supported. Returns 1 for missing credentials or failed health.";

/** Diagnose each provider independently so one failure does not hide others. */
export async function run(ctx: CliContext, args: ParsedArgs): Promise<number> {
  positional(args, 0);
  const filter = option(args, "provider");
  const available = await availableProviderIds(ctx);
  const rows = await Promise.all(ctx.engine.providers().filter(def => !filter || def.id === filter).map(async def => {
    if (!available.has(def.id)) {
      const names = credentialRequirements(def).map(group => group.join(" or ")).join(", ");
      return { provider: def.id, credentialsPresent: false, ok: false, healthcheck: "skipped", detail: `Set ${names}.` };
    }
    try {
      const provider = await ctx.engine.provider(def.id);
      if (!provider.healthcheck) return { provider: def.id, credentialsPresent: true, ok: true, healthcheck: "unavailable", detail: "Credentials present; connectivity not checked." };
      const result = await provider.healthcheck();
      return { provider: def.id, credentialsPresent: true, ok: result.ok, healthcheck: "checked", detail: result.detail ?? (result.ok ? "Healthy" : "Healthcheck failed") };
    } catch (error) {
      const details = errorDetails(error);
      return { provider: def.id, credentialsPresent: true, ok: false, healthcheck: "failed", detail: errorText(details), error: details };
    }
  }));
  const expanded = rows.map(row => ({ ...row, kind: "tts", id: row.provider, credentials: row.credentialsPresent ? "present" : "missing", health: row.healthcheck }));
  const extra: Array<{ kind: string; id: string; credentials: string; health: string; ok: boolean; detail: string }> = [];
  for (const [kind, definitions, runtime] of [["stt", allSttProviders, ctx.sttEngine], ["llm", allLlmProviders, ctx.llmEngine]] as const) {
    if (!runtime) continue;
    const available = new Set(await runtime.availableProviders());
    for (const def of definitions.filter(item => !filter || item.id === filter)) {
      if (!available.has(def.id)) { extra.push({ kind, id: def.id, credentials: "missing", health: "skipped", ok: false, detail: "Required credential is unavailable." }); continue; }
      try { const p = await runtime.provider(def.id); const result = p.healthcheck ? await p.healthcheck() : undefined; extra.push({ kind, id: def.id, credentials: "present", health: result ? result.ok ? "healthy" : "failed" : "not checked", ok: result?.ok ?? true, detail: result?.detail ?? "Credentials present; connectivity not checked." }); }
      catch (error) { extra.push({ kind, id: def.id, credentials: "present", health: "failed", ok: false, detail: errorText(errorDetails(error)) }); }
    }
  }
  for (const def of allRealtimeProviders.filter(item => !filter || item.id === filter)) {
    const credentials = def.requiredCredentials.every(field => (def.credentialEnv[field] ?? [field]).some(name => ctx.io.env[name]?.trim()));
    extra.push({ kind: "realtime", id: def.id, credentials: credentials ? "present" : "missing", health: "not checked", ok: credentials, detail: credentials ? "Credentials present; connectivity not checked." : "Required credential is unavailable." });
  }
  const all = [...expanded, ...extra];
  output(ctx, all, table(["KIND", "ID", "CREDENTIALS", "HEALTH", "DETAIL"], all.map(row => [row.kind, row.id, row.credentials, row.health, row.detail])));
  return all.some(row => !row.ok) ? 1 : 0;
}
