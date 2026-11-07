import type { VoiceEngine, VoiceEngineOptions } from "../core/types.js";
import type { SttEngine, SttEngineOptions } from "../stt/types.js";
import type { LlmEngine, LlmEngineOptions } from "../llm/types.js";
import type { RealtimeProviderDefinition } from "../realtime/types.js";

export type Writer = { write(text: string): unknown } | ((text: string) => unknown);
export interface CliIO {
  stdout: Writer;
  stderr: Writer;
  env: Record<string, string | undefined>;
  cwd: string;
  engineFactory?: (options: VoiceEngineOptions) => VoiceEngine | Promise<VoiceEngine>;
  sttEngineFactory?: (options: SttEngineOptions) => SttEngine | Promise<SttEngine>;
  llmEngineFactory?: (options: LlmEngineOptions) => LlmEngine | Promise<LlmEngine>;
  realtimeProviders?: RealtimeProviderDefinition[];
  stdin?: string | AsyncIterable<string | Uint8Array>;
}
export interface CliContext {
  engine: VoiceEngine;
  sttEngine?: SttEngine;
  llmEngine?: LlmEngine;
  io: CliIO;
  json: boolean;
  outDir: string;
}

/** Write to a stream or a capture function. */
export function write(writer: Writer, text: string): void {
  if (typeof writer === "function") writer(text); else writer.write(text);
}

/** Render an aligned, single-line-per-row table without terminal escape sequences. */
export function table(headers: string[], rows: unknown[][]): string {
  const clean = (value: unknown) => String(value ?? "-").replace(/[\u0000-\u001f\u007f-\u009f]/g, " ");
  const cells = [headers, ...rows].map(row => row.map(clean));
  const widths = headers.map((_, i) => Math.max(...cells.map(row => (row[i] ?? "").length)));
  return cells.map(row => row.map((cell, i) => cell.padEnd(widths[i])).join("  ").trimEnd()).join("\n") + "\n";
}

/** Print a JSON result or its human-readable representation. */
export function output(ctx: CliContext, value: unknown, human?: string): void {
  write(ctx.io.stdout, ctx.json || human === undefined ? JSON.stringify(value, null, 2) + "\n" : human);
}
