import type { PronunciationRule, SynthesisRequest } from "../../core/types.js";

/** Escape XML content and attributes before inserting generated SSML. */
export function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function pronunciation(text: string, rules: PronunciationRule[] = []): string {
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

/** Build mark-aware SSML; caller SSML is preserved and its mark names label timestamps. */
export function buildSsml(request: SynthesisRequest): { ssml: string; marks: Map<string, string> } {
  const marks = new Map<string, string>();
  if (request.ssml) {
    for (const match of request.text.matchAll(/<mark\b[^>]*\bname=["']([^"']+)["'][^>]*\/?\s*>/g)) marks.set(match[1], match[1]);
    return { ssml: request.text, marks };
  }
  let text: string;
  if (request.timestamps) {
    let i = 0;
    text = request.text.split(/(\s+)/u).map(word => {
      if (!word || /^\s+$/u.test(word)) return escapeXml(word);
      const mark = `w${i++}`; marks.set(mark, word);
      return `<mark name="${mark}"/>${pronunciation(word, request.pronunciation)}`;
    }).join("");
    // A terminal mark supplies the last word's end when the API emits it.
    text += '<mark name="end"/>';
  } else text = pronunciation(request.text, request.pronunciation);
  const sayAs = request.providerOptions?.sayAs;
  if (typeof sayAs === "string") text = `<say-as interpret-as="${escapeXml(sayAs)}">${text}</say-as>`;
  // audioConfig owns VoiceSettings, avoiding double application of speed/pitch/volume.
  const prosody = request.providerOptions?.prosody;
  if (prosody && typeof prosody === "object") {
    const attrs = Object.entries(prosody).filter(([k, v]) => ["rate", "pitch", "volume"].includes(k) && typeof v === "string").map(([k, v]) => `${k}="${escapeXml(String(v))}"`);
    if (attrs.length) text = `<prosody ${attrs.join(" ")}>${text}</prosody>`;
  }
  return { ssml: `<speak>${text}</speak>`, marks };
}
