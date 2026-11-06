import { describe, expect, it } from "vitest";
import { concatAudio, DEFAULT_FORMAT, estimateDurationMs, formatFromMimeType, isSilentPcm16, mimeTypeFor, wavHeader } from "../../src/core/audio.js";
import { LANGUAGES, languageMatches, languageName, normalizeLanguageTag, primaryLanguage } from "../../src/core/languages.js";
import { applyPronunciation, chunkText, countBillableChars, estimateSpeechDurationMs, normalizeText, stripSsml } from "../../src/core/text.js";
import type { AudioOutput } from "../../src/core/types.js";

describe("language and text helpers", () => {
  it("normalizes regional tags and contains the required language catalog", () => {
    expect(normalizeLanguageTag("ES_es")).toBe("es-ES");
    expect(normalizeLanguageTag("zh_hant_tw")).toBe("zh-Hant-TW");
    expect(primaryLanguage("es-MX")).toBe("es");
    expect(languageMatches("es-ES", "es-MX")).toBe(true);
    expect(languageMatches("en", "es")).toBe(false);
    expect(languageMatches("", "")).toBe(false);
    expect(LANGUAGES.length).toBeGreaterThanOrEqual(40);
    expect(languageName("ES_es")).toBe("Spanish (Spain)");
  });
  it("chunks Spanish on sentence boundaries and preserves opening punctuation", () => {
    const text = "¿Cómo estás? ¡Muy bien! Hoy hace sol.";
    expect(chunkText(text, 23)).toEqual(["¿Cómo estás? ¡Muy bien!", "Hoy hace sol."]);
    const smaller = chunkText("¡Hola mundo! ¿Cómo estás hoy?", 12);
    expect(smaller.every((chunk) => chunk.length <= 12)).toBe(true);
    expect(smaller.join(" ")).toBe("¡Hola mundo! ¿Cómo estás hoy?");
  });
  it("chunks CJK text without requiring whitespace", () => {
    const text = "你好世界。今天很好！明天见？また会いましょう。";
    const chunks = chunkText(text, 9);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((chunk) => chunk.length <= 9)).toBe(true);
    expect(chunks.join("").replace(/\s/g, "")).toBe(text);
  });
  it("keeps oversized words intact and handles empty and invalid requests", () => {
    expect(chunkText("Hola extraordinariamente bien", 8)).toEqual(["Hola", "extraordinariamente", "bien"]);
    expect(chunkText("  ", 5)).toEqual([]);
    expect(() => chunkText("x", 0)).toThrow("positive integer");
    expect(chunkText("Primero.\n\nSegundo.", 100, { preferParagraphs: true })).toEqual(["Primero.", "Segundo."]);
    expect(normalizeText("  cafe\u0301\r\n\r\n  hola\t mundo  ")).toBe("café\n\nhola mundo");
  });
  it("strips SSML and decodes entities without applying phoneme rules", () => {
    expect(stripSsml('<speak><p>Hola &amp; adiós.</p><break time="1s"/>¡Sí! &#x1f600;</speak>')).toBe("Hola & adiós. ¡Sí! 😀");
    expect(applyPronunciation("José, Josés y José. Mañana.", [{ grapheme: "José", alias: "Pepe" }, { grapheme: "Pepe", alias: "X" }])).toBe("Pepe, Josés y Pepe. Mañana.");
    expect(applyPronunciation("mañana", [{ grapheme: "mañana", phoneme: "test" }])).toBe("mañana");
    expect(applyPronunciation("C++ y C++", [{ grapheme: "C++", alias: "$1" }])).toBe("$1 y $1");
    expect(countBillableChars("<speak>😀é</speak>")).toBe(2);
    expect(estimateSpeechDurationMs("Hola mundo", "es", 2)).toBeLessThan(estimateSpeechDurationMs("Hola mundo", "es", 1));
  });
});

function wav(samples: number[], extraChunk = false): AudioOutput {
  const format = { container: "wav", sampleRate: 16000, channels: 1, bitDepth: 16 } as const;
  const payload = Uint8Array.from(samples);
  const header = wavHeader(payload.length, format);
  let data = new Uint8Array([...header, ...payload]);
  if (extraChunk) {
    const junk = [74, 85, 78, 75, 1, 0, 0, 0, 7, 0];
    data = new Uint8Array([...header.slice(0, 36), ...junk, ...header.slice(36), ...payload]);
    new DataView(data.buffer).setUint32(4, data.length - 8, true);
  }
  return { data, format, mimeType: "audio/wav" };
}

describe("audio helpers", () => {
  it("rebuilds WAV headers and ignores additional padded RIFF chunks", () => {
    const result = concatAudio([wav([1, 0, 2, 0], true), wav([3, 0, 4, 0])]);
    expect(result.data.length).toBe(52);
    expect(Array.from(result.data.slice(44))).toEqual([1, 0, 2, 0, 3, 0, 4, 0]);
    expect(new DataView(result.data.buffer).getUint32(40, true)).toBe(8);
    expect(result.durationMs).toBe(0.25);
  });
  it("rejects mismatched formats and malformed or incompatible WAV headers", () => {
    const a = wav([1, 0]), b = wav([2, 0]);
    new DataView(b.data.buffer).setUint32(24, 24000, true);
    expect(() => concatAudio([a, b])).toThrow("mismatched WAV");
    expect(() => concatAudio([a, { ...a, format: { container: "mp3" } }])).toThrow("mismatched audio");
    expect(() => concatAudio([{ ...a, data: new Uint8Array(2) }])).toThrow("RIFF");
    expect(() => concatAudio([])).toThrow("No audio");
  });
  it("concatenates compressed bytes and sums known durations", () => {
    const audio = (data: number[], durationMs: number): AudioOutput => ({ data: Uint8Array.from(data), format: DEFAULT_FORMAT, mimeType: "audio/mpeg", durationMs });
    const result = concatAudio([audio([1, 2], 500), audio([3, 4], 300)]);
    expect(Array.from(result.data)).toEqual([1, 2, 3, 4]);
    expect(result.durationMs).toBe(800);
    expect(mimeTypeFor(DEFAULT_FORMAT)).toBe("audio/mpeg");
    expect(formatFromMimeType("audio/x-wav; codecs=pcm")).toEqual({ container: "wav" });
    expect(formatFromMimeType("application/json")).toBeUndefined();
    expect(estimateDurationMs(DEFAULT_FORMAT, 16_000)).toBe(1000);
    expect(isSilentPcm16(Uint8Array.of(0, 0))).toBe(true);
    expect(isSilentPcm16(Uint8Array.of(0, 1))).toBe(false);
    expect(isSilentPcm16(Uint8Array.of(0))).toBe(false);
  });
});
