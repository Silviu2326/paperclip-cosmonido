import type { EndOfTurnDetector } from "./types.js";
export const END_OF_TURN_TUNABLES: { baseSilenceMs: number; minSilenceMs: number; maxSilenceMs: number; shortFragmentWords: number } = { baseSilenceMs: 650, minSilenceMs: 220, maxSilenceMs: 1600, shortFragmentWords: 3 };
const terminal = /[.!?。！？]\s*$/u;
const continuation: Record<string, string[]> = { en: ["and", "but", "or", "because", "so", "uh", "um", "like"], es: ["y", "pero", "o", "porque", "entonces", "este", "eh"], fr: ["et", "mais", "ou", "parce", "euh"], de: ["und", "aber", "oder", "weil", "äh"], pt: ["e", "mas", "ou", "porque", "então", "hum"], it: ["e", "ma", "o", "perché", "allora", "eh"] };
/** Estimate end-of-turn from trailing silence, punctuation, and multilingual continuation cues. */
export class SilenceEndOfTurnDetector implements EndOfTurnDetector {
  async analyze(input: { transcript: string; silenceMs: number; language?: string }): Promise<{ endOfTurn: boolean; confidence: number }> {
    const text = input.transcript.trim(); const words = text.split(/\s+/u).filter(Boolean); const lang = (input.language ?? "en").toLowerCase().slice(0, 2);
    let threshold = END_OF_TURN_TUNABLES.baseSilenceMs;
    if (terminal.test(text)) threshold = END_OF_TURN_TUNABLES.minSilenceMs;
    else if (/[,…,:;—-]$/u.test(text) || words.length <= END_OF_TURN_TUNABLES.shortFragmentWords || (continuation[lang] ?? continuation.en!).includes((words.at(-1) ?? "").toLowerCase())) threshold = END_OF_TURN_TUNABLES.maxSilenceMs;
    const confidence = Math.max(0, Math.min(1, input.silenceMs / threshold));
    return { endOfTurn: input.silenceMs >= threshold, confidence };
  }
}
