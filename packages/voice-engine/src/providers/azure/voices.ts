import type { ProviderContext, VoiceDescriptor, VoiceQuery } from "../../core/types.js";
import { VoiceEngineError } from "../../core/errors.js";
import { endpoint, headers } from "./api.js";
import { filterVoices, jsonHttp } from "./http.js";

/** Normalize the regional voices/list response and retain style metadata. */
export function normalizeVoice(raw: Record<string, unknown>): VoiceDescriptor {
  const id = String(raw.ShortName ?? raw.Name ?? "");
  const styles = Array.isArray(raw.StyleList) ? raw.StyleList.filter((s): s is string => typeof s === "string") : [];
  const secondary = Array.isArray(raw.SecondaryLocaleList) ? raw.SecondaryLocaleList.filter((s): s is string => typeof s === "string") : [];
  const gender = String(raw.Gender).toLowerCase();
  return { id: `azure:${id}`, provider: "azure", providerVoiceId: id, name: String(raw.DisplayName ?? raw.LocalName ?? id),
    languages: [...new Set([String(raw.Locale ?? id.split("-").slice(0, 2).join("-")), ...secondary])],
    gender: gender === "male" || gender === "female" ? gender : "unknown", age: "unknown", tags: styles, origin: "premade",
    models: [/HD/i.test(id) ? "neural-hd" : /Multilingual/i.test(id) ? "multilingual" : "neural"], raw: { ...raw, styles },
  };
}

const fallback: [string, string][] = [
  ["es-ES-ElviraNeural", "Female"], ["es-ES-AlvaroNeural", "Male"], ["es-MX-DaliaNeural", "Female"], ["es-MX-JorgeNeural", "Male"],
  ["en-US-AvaMultilingualNeural", "Female"], ["en-US-AndrewMultilingualNeural", "Male"], ["en-US-JennyNeural", "Female"], ["en-US-GuyNeural", "Male"],
  ["en-US-Ava:DragonHDLatestNeural", "Female"], ["en-US-Andrew:DragonHDLatestNeural", "Male"],
  ["en-GB-SoniaNeural", "Female"], ["en-GB-RyanNeural", "Male"], ["en-AU-NatashaNeural", "Female"],
  ["pt-BR-FranciscaNeural", "Female"], ["pt-BR-AntonioNeural", "Male"], ["pt-PT-RaquelNeural", "Female"],
  ["fr-FR-DeniseNeural", "Female"], ["fr-FR-HenriNeural", "Male"], ["de-DE-KatjaNeural", "Female"], ["de-DE-ConradNeural", "Male"],
  ["it-IT-ElsaNeural", "Female"], ["ja-JP-NanamiNeural", "Female"], ["ja-JP-KeitaNeural", "Male"],
  ["zh-CN-XiaoxiaoNeural", "Female"], ["zh-CN-YunxiNeural", "Male"], ["ko-KR-SunHiNeural", "Female"],
  ["ar-SA-ZariyahNeural", "Female"], ["hi-IN-SwaraNeural", "Female"], ["ru-RU-SvetlanaNeural", "Female"], ["nl-NL-ColetteNeural", "Female"],
];

export const AZURE_VOICES = fallback.map(([ShortName, Gender]) => normalizeVoice({ ShortName, Gender,
  DisplayName: ShortName.split("-").slice(2).join("-").replace(/Neural$/, ""), Locale: ShortName.split("-").slice(0, 2).join("-"),
}));

/** Use a static catalog without credentials or during a transient catalog outage. */
export async function listVoices(ctx: ProviderContext, query?: VoiceQuery): Promise<VoiceDescriptor[]> {
  if (!ctx.credentials.apiKey) return filterVoices(structuredClone(AZURE_VOICES), query);
  try {
    const data = await jsonHttp<Record<string, unknown>[]>(ctx, `${endpoint(ctx)}/cognitiveservices/voices/list`, { headers: headers(ctx) });
    if (!Array.isArray(data)) throw new VoiceEngineError("Invalid Azure voice catalog", { provider: "azure", code: "provider_unavailable" });
    return filterVoices(data.map(normalizeVoice), query);
  } catch (error) {
    if (!(error instanceof VoiceEngineError) || !["provider_unavailable", "timeout"].includes(error.code)) throw error;
    ctx.logger?.warn("Azure voice catalog unavailable; using static fallback", { code: error.code });
    return filterVoices(structuredClone(AZURE_VOICES), query);
  }
}
