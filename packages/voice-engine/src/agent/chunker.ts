export interface SentenceChunkerOptions { minClauseWords?: number; firstChunkFlushMs?: number; maxWords?: number; maxChars?: number; }
/** Incrementally splits LLM text into sanitized, speakable chunks. */
export class SentenceChunker {
  private pending = ""; private startedAt?: number; private first = true; readonly emitted: string[] = []; readonly options: Required<SentenceChunkerOptions>;
  constructor(options: SentenceChunkerOptions = {}) { this.options = { minClauseWords: 6, firstChunkFlushMs: 400, maxWords: 20, maxChars: 120, ...options }; }
  /** Add an LLM delta and return any chunks that became ready. */
  push(delta: string): string[] { this.pending += delta; return this.extract(); }
  /** Flush the remaining text. */
  flush(): string[] { const clean = sanitize(this.pending).trim(); this.pending = ""; return clean ? [this.record(clean)] : []; }
  /** Apply the caller clock to release a delayed first clause chunk. */
  tick(nowMs: number): string[] { if (this.first && this.startedAt !== undefined && nowMs - this.startedAt >= this.options.firstChunkFlushMs && /[,;:—–-]/u.test(this.pending) && wordCount(this.pending) >= this.options.minClauseWords) return this.flush(); return []; }
  private extract(): string[] {
    const out: string[] = []; if (this.startedAt === undefined && this.pending) this.startedAt = Date.now();
    while (this.pending) {
      const boundary = findSentenceEnd(this.pending);
      const words = wordCount(this.pending);
      let clause = -1;
      if (this.first) { const match = /[,;:—–-](?=\s|$)/gu; let found: RegExpExecArray | null; while ((found = match.exec(this.pending))) { if (wordCount(this.pending.slice(0, found.index)) >= this.options.minClauseWords) { clause = found.index; break; } } }
      let cut = boundary;
      if (cut < 0 && clause >= 0) cut = clause + 1;
      if (cut < 0 && (words >= this.options.maxWords || this.pending.length >= this.options.maxChars)) cut = safeCap(this.pending, this.options.maxWords, this.options.maxChars);
      if (cut < 0) break;
      const raw = this.pending.slice(0, cut); this.pending = this.pending.slice(cut).replace(/^\s+/u, "");
      const clean = sanitize(raw).trim(); if (clean) out.push(this.record(clean));
      this.startedAt = this.pending ? Date.now() : undefined;
    }
    return out;
  }
  private record(text: string): string { this.first = false; this.emitted.push(text); return text; }
}
function wordCount(s: string): number { return (sanitize(s).match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu) ?? []).length; }
function safeCap(s: string, maxWords: number, maxChars: number): number { let limit = Math.min(s.length, maxChars); const matches = [...s.slice(0, limit).matchAll(/\s+/gu)]; if (wordCount(s.slice(0, limit)) > maxWords && matches.length) limit = matches[maxWords - 1]!.index!; else if (limit < s.length && !/\s/u.test(s[limit - 1] ?? "")) limit = Math.max(0, s.lastIndexOf(" ", limit)); return limit || -1; }
function findSentenceEnd(s: string): number {
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!; if (!".!?…。！？".includes(c)) continue;
    if ((c === "." && ((/\d/u.test(s[i - 1] ?? "") && /\d/u.test(s[i + 1] ?? "")) || isAbbreviation(s.slice(0, i + 1)))) || (c === "." && /https?:\/\/[^\s]*$/iu.test(s.slice(0, i + 1)))) continue;
    let j = i + 1; while (/[!?…]/u.test(s[j] ?? "")) j++;
    if (j === s.length || /\s/u.test(s[j] ?? "")) return j;
  }
  return -1;
}
function isAbbreviation(s: string): boolean { return /(?:\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|e\.g|i\.e)\.)$/iu.test(s) || /\b[A-Z](?:\.[A-Z])?\.$/u.test(s); }
function sanitize(s: string): string { return s.replace(/```[\s\S]*?```/gu, x => x.replace(/```[^\n]*\n?/gu, "")).replace(/!?\[([^\]]+)\]\([^)]*\)/gu, "$1").replace(/^\s{0,3}#{1,6}\s*/gmu, "").replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/gmu, "").replace(/[*_~`]/gu, "").replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, "").replace(/\s+/gu, " "); }
