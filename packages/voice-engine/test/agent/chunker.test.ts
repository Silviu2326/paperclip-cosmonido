import { describe, expect, it } from "vitest";
import { SentenceChunker } from "../../src/agent/chunker.js";
describe("SentenceChunker", () => {
  it("handles inverted Spanish punctuation, decimals and abbreviations", () => { const c = new SentenceChunker(); expect(c.push("¿Vienes? Sí. Son 3.5 kg, Dr. López dijo: listo." )).toEqual(["¿Vienes?", "Sí.", "Son 3.5 kg, Dr. López dijo: listo."]); });
  it("strips markdown, flushes a first clause, and handles CJK", () => { const c = new SentenceChunker({ minClauseWords: 2 }); expect(c.push("# **Hola** mundo, seguimos aquí" )).toEqual(["Hola mundo,"]); expect(c.push("。" )).toEqual(["seguimos aquí。"]); const d = new SentenceChunker(); expect(d.push("[OpenAI](https://openai.com) works. Next" )).toEqual(["OpenAI works."]); });
});
