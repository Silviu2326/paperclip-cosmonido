import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMultipart, errorFromResponse, fetchBytes, fetchJson, iterateBody, parseRetryAfter, readBounded, withTimeout } from "../../src/core/http.js";

afterEach(() => vi.useRealTimers());
describe("HTTP helpers", () => {
  it("maps nested provider errors and Retry-After", async () => {
    const error = await errorFromResponse(new Response(JSON.stringify({ error: { message: "Too fast" } }), { status: 429, headers: { "retry-after": "2" } }), "fake");
    expect(error).toMatchObject({ code: "rate_limit", provider: "fake", status: 429, retryable: true, retryAfterMs: 2000 });
    expect(error.message).toContain("Too fast");
    expect(await errorFromResponse(new Response("broken", { status: 401 }), "fake")).toMatchObject({ code: "auth", retryable: false });
  });
  it("parses retry dates and rejects malformed delays", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    expect(parseRetryAfter("Thu, 01 Jan 2026 00:00:03 GMT")).toBe(3000);
    expect(parseRetryAfter("0.5")).toBe(500);
    expect(parseRetryAfter("-1")).toBeUndefined();
    expect(parseRetryAfter("bogus")).toBeUndefined();
  });
  it("limits actual streamed bytes and cancels on overflow or early exit", async () => {
    const cancel = vi.fn();
    const response = () => new Response(new ReadableStream({ start(controller) { controller.enqueue(Uint8Array.of(1, 2, 3)); }, cancel }));
    await expect(readBounded(response(), 2, "Audio")).rejects.toThrow("Audio exceeds");
    expect(cancel).toHaveBeenCalledTimes(1);
    for await (const bytes of iterateBody(response())) { expect(bytes.length).toBe(3); break; }
    expect(cancel).toHaveBeenCalledTimes(2);
  });
  it("uses injected fetch for bytes and JSON and maps invalid JSON", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('{"ok":true}')).mockResolvedValueOnce(new Response(Uint8Array.of(1, 2))).mockResolvedValueOnce(new Response("no-json"));
    const ctx = { credentials: {}, fetch };
    expect(await fetchJson(ctx, "https://example.test")).toEqual({ ok: true });
    expect(await fetchBytes(ctx, "https://example.test")).toEqual(Uint8Array.of(1, 2));
    await expect(fetchJson(ctx, "https://example.test")).rejects.toMatchObject({ code: "provider_unavailable" });
    expect(fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
  it("propagates caller cancellation and builds multipart blobs", async () => {
    const controller = new AbortController(), signal = withTimeout(controller.signal, 5000);
    controller.abort(); expect(signal.aborted).toBe(true);
    const fetch = vi.fn();
    await expect(fetchBytes({ credentials: {}, fetch }, "https://example.test", { signal })).rejects.toMatchObject({ code: "aborted" });
    expect(fetch).not.toHaveBeenCalled();
    const form = buildMultipart([{ name: "name", value: "voice" }, { name: "file", value: Uint8Array.of(1), fileName: "a.wav", contentType: "audio/wav" }]);
    expect(form.get("name")).toBe("voice");
    expect(form.get("file")).toMatchObject({ name: "a.wav", type: "audio/wav", size: 1 });
  });
});
