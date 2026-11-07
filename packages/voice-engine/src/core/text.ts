import { VoiceEngineError } from "./errors.js";
import { primaryLanguage } from "./languages.js";
import type { PronunciationRule } from "./types.js";

/** Normalize Unicode and whitespace while preserving paragraph boundaries. */
export function normalizeText(text: string): string {
  return text.normalize("NFC").replace(/\r\n?/g, "\n").replace(/[^\S\n]+/gu, " ")
    .replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Split on paragraphs, sentences and words; an indivisible word may exceed maxChars. */
export function chunkText(text: string, maxChars: number, options: { preferParagraphs?: boolean } = {}): string[] {
  if (!Number.isInteger(maxChars) || maxChars < 1) {
    throw new VoiceEngineError("maxChars must be a positive integer", { code: "invalid_request" });
  }
  const value = normalizeText(text);
  if (!value) return [];
  const chunks: string[] = [];
  let current = "";
  const flush = () => { if (current.trim()) chunks.push(current.trim()); current = ""; };
  const append = (part: string, separator = "") => {
    if (current && (current + separator + part).trimEnd().length > maxChars) flush();
    current += (current ? separator : "") + part;
  };
  const paragraphs = value.split(/\n\s*\n/);
  const sentences = new Intl.Segmenter(undefined, { granularity: "sentence" });
  const words = new Intl.Segmenter(undefined, { granularity: "word" });
  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i];
    if (options.preferParagraphs && i > 0) flush();
    if (paragraph.length <= maxChars) { append(paragraph, "\n\n"); continue; }
    for (const { segment } of sentences.segment(paragraph)) {
      const sentence = segment.trim();
      if (!sentence) continue;
      if (sentence.length <= maxChars) { append(sentence, " "); continue; }
      flush();
      // Keep punctuation attached to adjacent words, including Spanish opening marks.
      const tokens: string[] = [];
      let prefix = "";
      for (const word of words.segment(sentence)) {
        if (word.isWordLike) { tokens.push(prefix + word.segment); prefix = ""; }
        else if (/^\s+$/u.test(word.segment) || /^[¿¡([{«“]+$/u.test(word.segment)) prefix += word.segment;
        else if (tokens.length) tokens[tokens.length - 1] += word.segment;
        else prefix += word.segment;
      }
      if (prefix) { if (tokens.length) tokens[tokens.length - 1] += prefix; else tokens.push(prefix); }
      for (const token of tokens) {
        if (current && (current + token).trimEnd().length > maxChars) flush();
        current += current ? token : token.trimStart();
      }
      flush();
    }
  }
  flush();
  return chunks;
}

/** Remove SSML markup and decode common XML entities for plain-text providers. */
export function stripSsml(text: string): string {
  const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return normalizeText(text.replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/(?:p|s)\s*>|<break\b[^>]*\/?>/gi, " ").replace(/<[^>]*>/g, "")
    .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (whole, key: string) => {
      if (!key.startsWith("#")) return entities[key.toLowerCase()] ?? whole;
      const code = key[1].toLowerCase() === "x" ? parseInt(key.slice(2), 16) : Number(key.slice(1));
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : whole;
    }));
}

/** Apply literal, case-sensitive aliases at Unicode word boundaries without cascading. */
export function applyPronunciation(text: string, rules: PronunciationRule[]): string {
  const aliases = new Map(rules.filter((rule) => rule.grapheme && rule.alias !== undefined)
    .map((rule) => [rule.grapheme.normalize("NFC"), rule.alias!]));
  if (!aliases.size) return text;
  const alternatives = [...aliases.keys()].sort((a, b) => b.length - a.length)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}\\p{M}_])(?:${alternatives.join("|")})(?![\\p{L}\\p{N}\\p{M}_])`, "gu");
  return text.normalize("NFC").replace(pattern, (word) => aliases.get(word)!);
}

/** Count Unicode code points in spoken text, excluding SSML markup. */
export function countBillableChars(text: string): number { return Array.from(stripSsml(text)).length; }

/** Approximate speech duration using language-specific characters per second. */
export function estimateSpeechDurationMs(text: string, language = "en", speed = 1): number {
  const rates: Record<string, number> = { en: 15, es: 17, pt: 16, fr: 16, de: 15, it: 17, ru: 14, ar: 12, hi: 12, ja: 6, zh: 5, yue: 5, ko: 7, th: 12 };
  if (!Number.isFinite(speed) || speed <= 0) throw new VoiceEngineError("speed must be positive", { code: "invalid_request" });
  return Math.round(countBillableChars(text) / (rates[primaryLanguage(language)] ?? 15) / speed * 1000);
}
