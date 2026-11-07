import { vi } from "vitest";
import type { ProviderContext, SynthesisChunk } from "../../src/core/types.js";

export function fake(...responses: (Response | ((input: RequestInfo | URL, init?: RequestInit) => Response | Promise<Response>))[]) {
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const response = responses.shift();
    if (!response) throw new Error("Unexpected fetch: " + String(input));
    return typeof response === "function" ? response(input, init) : response;
  });
  const ctx: ProviderContext = { credentials: { apiKey: "test-key", userId: "test-user" }, fetch };
  return { ctx, fetch };
}

export function json(value: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json", ...headers } });
}

export function chunks(...parts: (string | Uint8Array)[]): Response {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(typeof part === "string" ? new TextEncoder().encode(part) : part);
      controller.close();
    },
  }));
}

export function split(text: string): Response {
  const bytes = new TextEncoder().encode(text);
  return chunks(...Array.from(bytes, byte => new Uint8Array([byte])));
}

export async function collect(stream: AsyncIterable<SynthesisChunk>): Promise<SynthesisChunk[]> {
  const output: SynthesisChunk[] = [];
  for await (const chunk of stream) output.push(chunk);
  return output;
}

