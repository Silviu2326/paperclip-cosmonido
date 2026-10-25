import type { AudioInput, ProviderContext, VoiceRef } from "../../src/core/types.js";

export interface Call { url: URL; headers: Headers; init: RequestInit; body: Record<string, unknown> }

export function fake(responses: (Response | ((call: Call) => Response | Promise<Response>))[], overrides: Partial<ProviderContext> = {}) {
  const calls: Call[] = [];
  const ctx: ProviderContext = { credentials: { apiKey: "test-elevenlabs-key" }, timeoutMs: 2000,
    fetch: (async (input: string | URL | Request, init: RequestInit = {}) => {
      const call: Call = { url: new URL(String(input)), headers: new Headers(init.headers), init,
        body: typeof init.body === "string" ? JSON.parse(init.body) : {} };
      calls.push(call);
      const response = responses.shift();
      if (!response) throw new Error(`Unexpected request: ${call.url}`);
      return typeof response === "function" ? response(call) : response;
    }) as typeof fetch, ...overrides };
  return { ctx, calls };
}

export const json = (data: unknown, status = 200, headers: HeadersInit = {}) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...headers } });
export const audio = (headers: HeadersInit = {}) => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "audio/mpeg", ...headers } });
export const voice: VoiceRef = { provider: "elevenlabs", voiceId: "voice/id" };
export const sample: AudioInput = { data: new Uint8Array([7, 8, 9]), mimeType: "audio/wav", fileName: "owner.wav" };
export const alignment = (text: string, start = 0) => ({ characters: Array.from(text),
  character_start_times_seconds: Array.from(text, (_, index) => start + index * 0.1),
  character_end_times_seconds: Array.from(text, (_, index) => start + (index + 1) * 0.1) });

export function stream(chunks: Uint8Array[]): Response {
  return new Response(new ReadableStream({ start(controller) { chunks.forEach(chunk => controller.enqueue(chunk)); controller.close(); } }));
}

export async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const chunks: T[] = [];
  for await (const chunk of iterable) chunks.push(chunk);
  return chunks;
}
