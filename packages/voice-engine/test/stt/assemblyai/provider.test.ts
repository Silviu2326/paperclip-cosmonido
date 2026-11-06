import { describe, expect, it } from "vitest";
import { createAssemblyAiSttProvider } from "../../../src/stt/providers/assemblyai/index.js";

describe("AssemblyAI STT", () => {
  it("uploads, creates and polls a transcript", async () => {
    const calls: Array<[string, RequestInit | undefined]> = []; let poll = 0;
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => { const url = String(input); calls.push([url, init]); if (url.endsWith("/v2/upload")) return Response.json({ upload_url: "https://audio/upload" }); if (url.endsWith("/v2/transcript")) return Response.json({ id: "t1", status: "queued" }); if (++poll === 1) return Response.json({ id: "t1", status: "processing" }); return Response.json({ id: "t1", status: "completed", text: "hello", words: [{ text: "hello", start: 0, end: 500 }] }); }) as typeof fetch;
    const p = createAssemblyAiSttProvider({ credentials: { apiKey: "k" }, fetch: fetcher });
    const result = await p.transcribe({ audio: { data: new Uint8Array([1]), mimeType: "audio/wav" }, keywords: ["hello"], diarization: { enabled: true } });
    expect(result.text).toBe("hello"); expect(calls[1][1]?.body).toContain('"speaker_labels":true'); expect(calls[1][1]?.body).toContain('"keyterms_prompt":["hello"]');
  });
  it("maps auth errors", async () => { const p = createAssemblyAiSttProvider({ credentials: { apiKey: "x" }, fetch: (async () => new Response("{}", { status: 401 })) as typeof fetch }); await expect(p.transcribe({ audio: { url: "https://a" } })).rejects.toMatchObject({ code: "auth", provider: "assemblyai" }); });
  it("opens a fake streaming socket and sends audio", async () => { const listeners: Record<string, (event: any) => void> = {}; const sent: unknown[] = []; const socket = { readyState: 1, binaryType: "", send(v: any) { sent.push(v); }, close() {}, addEventListener(type: string, fn: (e: any) => void) { listeners[type] = fn; } }; const p = createAssemblyAiSttProvider({ credentials: { apiKey: "k" }, fetch: fetch, webSocket: ((url: string) => { expect(url).toContain("/v3/ws?"); return socket as any; }) as any }); const stream = await p.openStream!({ encoding: "pcm16", sampleRate: 16000 }); stream.send(new Uint8Array([1, 2])); expect(sent[0]).toEqual(new Uint8Array([1, 2])); listeners.close({ code: 1000, reason: "done" }); await stream.close(); });
  it("honors abort during polling", async () => { const controller = new AbortController(); let calls = 0; const fetcher = (async (input: RequestInfo | URL) => { calls++; if (String(input).endsWith("/v2/transcript")) { controller.abort(); return Response.json({ id: "t1", status: "queued" }); } return Response.json({ upload_url: "https://audio/a" }); }) as typeof fetch; const p = createAssemblyAiSttProvider({ credentials: { apiKey: "k" }, fetch: fetcher }); await expect(p.transcribe({ audio: { url: "https://a" }, signal: controller.signal })).rejects.toMatchObject({ code: "aborted" }); });
});
