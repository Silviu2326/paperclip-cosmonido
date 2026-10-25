import { describe, expect, it } from "vitest";
import { createGladiaSttProvider } from "../../../src/stt/providers/gladia/index.js";

describe("Gladia STT", () => {
  it("uploads, creates and polls pre-recorded audio", async () => { const calls: Array<[string, RequestInit | undefined]> = []; const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => { const url = String(input); calls.push([url, init]); if (url.endsWith("/v2/upload")) return Response.json({ audio_url: "https://audio/a" }); if (url.endsWith("/v2/pre-recorded")) return Response.json({ id: "g1", result_url: "https://api.gladia.io/result/g1" }); return Response.json({ status: "done", result: { text: "ok" } }); }) as typeof fetch; const p = createGladiaSttProvider({ credentials: { apiKey: "k" }, fetch: fetcher }); const r = await p.transcribe({ audio: { data: new Uint8Array([1]), mimeType: "audio/wav" }, translateTo: "es" }); expect(r.text).toBe("ok"); expect(calls[1][1]?.body).toContain('"translation":true'); });
  it("maps auth failures", async () => { const p = createGladiaSttProvider({ credentials: { apiKey: "x" }, fetch: (async () => new Response("{}", { status: 401 })) as typeof fetch }); await expect(p.transcribe({ audio: { url: "https://a" } })).rejects.toMatchObject({ code: "auth" }); });
});
