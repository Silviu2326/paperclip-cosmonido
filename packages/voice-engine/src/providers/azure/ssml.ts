import type { PronunciationRule, SynthesisRequest, VoiceRef } from "../../core/types.js";
import { bounded } from "./http.js";

/** Escape XML text and attribute values, including caller-provided voice names. */
export function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** Substitute pronunciations in plain text before XML escaping, never inside generated tags. */
export function pronunciation(text: string, rules: PronunciationRule[] = []): string {
  const ordered = rules.filter(r => r.grapheme).sort((a, b) => b.grapheme.length - a.grapheme.length);
  let out = "";
  for (let i = 0; i < text.length;) {
    const rule = ordered.find(r => text.startsWith(r.grapheme, i));
    if (!rule) { out += escapeXml(text[i++]); continue; }
    const word = escapeXml(rule.grapheme);
    out += rule.phoneme ? `<phoneme alphabet="${escapeXml(rule.alphabet ?? "ipa")}" ph="${escapeXml(rule.phoneme)}">${word}</phoneme>`
      : rule.alias ? `<sub alias="${escapeXml(rule.alias)}">${word}</sub>` : word;
    i += rule.grapheme.length;
  }
  return out;
}

const styles: Record<string, string> = { happy: "cheerful", whisper: "whispering", narration: "narration-professional" };
const signed = (value: number, unit: string) => `${value >= 0 ? "+" : ""}${value}${unit}`;

/** Build Azure SSML, or preserve caller SSML while inserting a missing voice wrapper. */
export function buildSsml(request: SynthesisRequest & { voice: VoiceRef }): string {
  const personal = request.voice.voiceId.startsWith("personal:");
  const voice = personal ? String(request.providerOptions?.baseVoice ?? "en-US-DragonLatestNeural") : request.voice.voiceId;
  const language = request.language ?? (personal ? "en-US" : voice.match(/^[a-z]{2,3}-[A-Z]{2}/)?.[0] ?? "en-US");
  const wrapVoice = (text: string) => `<voice name="${escapeXml(voice)}">${personal ? `<mstts:ttsembedding speakerProfileId="${escapeXml(request.voice.voiceId.slice(9))}">${text}</mstts:ttsembedding>` : text}</voice>`;
  const root = (text: string) => `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${escapeXml(language)}">${text}</speak>`;
  if (request.ssml) {
    let xml = request.text;
    if (personal && /<voice\b/i.test(xml) && !/<mstts:ttsembedding\b/i.test(xml)) {
      xml = xml.replace(/<voice\b[^>]*>([\s\S]*?)<\/voice\s*>/gi, (_, text: string) => wrapVoice(text));
    }
    if (!/<voice\b/i.test(xml)) {
      if (/<speak\b[^>]*>[\s\S]*<\/speak\s*>/i.test(xml)) xml = xml.replace(/(<speak\b[^>]*>)([\s\S]*)(<\/speak\s*>)/i, (_, open: string, text: string, close: string) => open + wrapVoice(text) + close);
      else xml = root(wrapVoice(xml));
    }
    if (!/<speak\b/i.test(xml)) xml = root(xml);
    if (personal && !/xmlns:mstts\s*=/.test(xml)) xml = xml.replace(/<speak\b/, '<speak xmlns:mstts="https://www.w3.org/2001/mstts"');
    return xml;
  }
  let text = pronunciation(request.text, request.pronunciation);
  const settings = request.settings ?? {};
  const attributes: string[] = [];
  if (settings.speed !== undefined) attributes.push(`rate="${signed(Math.round((bounded(settings.speed, 0.25, 4)! - 1) * 100), "%")}"`);
  if (settings.pitch !== undefined) attributes.push(`pitch="${signed(bounded(settings.pitch, -12, 12)!, "st")}"`);
  if (settings.volume !== undefined) attributes.push(`volume="${signed(bounded(settings.volume, -20, 20)!, "dB")}"`);
  if (attributes.length) text = `<prosody ${attributes.join(" ")}>${text}</prosody>`;
  if (settings.emotion) {
    const degree = settings.style === undefined ? "" : ` styledegree="${Math.max(0.01, bounded(settings.style, 0, 1)! * 2)}"`;
    text = `<mstts:express-as style="${escapeXml(styles[settings.emotion] ?? settings.emotion)}"${degree}>${text}</mstts:express-as>`;
  }
  return root(wrapVoice(text));
}
