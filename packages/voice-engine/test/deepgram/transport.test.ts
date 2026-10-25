import { describe, expect, it, vi } from "vitest";
import { createDeepgramProvider } from "../../src/providers/deepgram/index.js";
import { VoiceEngineError } from "../../src/core/errors.js";
import { collect, fake, json } from "./fixtures.js";

const input = { text: "Hello", voice: { provider: "deepgram", voiceId: "aura-2-thalia-en" } };

describe("deepgram transport", () => {
  it.each([[400, "invalid_request"], [401, "auth"], [402, "quota_exceeded"], [403, "auth"], [404, "not_found"], [422, "invalid_request"], [429, "rate_limit"], [500, "provider_unavailable"], [504, "timeout"]] as const)(
    "normalizes HTTP %s", async (status, code) => {
      const { ctx } = fake(json({ err_code: "FAIL", err_msg: "Native failure" }, status, { "retry-after": "1.5" }));
      try { await createDeepgramProvider(ctx).synthesize(input); throw new Error("Expected failure"); }
      catch (error) {
        expect(error).toBeInstanceOf(VoiceEngineError);
        expect(error).toMatchObject({ provider: "deepgram", message: "Native failure", status, code, retryAfterMs: 1500,
          retryable: ["rate_limit", "provider_unavailable", "timeout"].includes(code) });
      }
    },
  );

  it("parses HTTP-date Retry-After and plain-text server errors", async () => {
    const date = new Date(Date.now() + 10000).toUTCString();
    const { ctx } = fake(new Response("upstream unavailable", { status: 503, headers: { "retry-after": date } }));
    try { await createDeepgramProvider(ctx).synthesize(input); throw new Error("Expected failure"); }
    catch (error) {
      expect(error).toBeInstanceOf(VoiceEngineError);
      expect((error as VoiceEngineError).retryAfterMs).toBeGreaterThan(7000);
      expect((error as VoiceEngineError).retryAfterMs).toBeLessThanOrEqual(10000);
      expect((error as VoiceEngineError).details).toBe("upstream unavailable");
    }
  });

  it("maps network failures", async () => {
    const { ctx } = fake(() => { throw new TypeError("connection reset"); });
    await expect(createDeepgramProvider(ctx).synthesize(input)).rejects.toMatchObject({ code: "provider_unavailable", retryable: true });
  });

  it("rejects missing credentials before fetch", async () => {
    const { ctx, fetch } = fake();
    ctx.credentials = {};
    await expect(createDeepgramProvider(ctx).synthesize(input)).rejects.toMatchObject({ code: "auth" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("honors pre-aborted requests", async () => {
    const { ctx, fetch } = fake();
    await expect(createDeepgramProvider(ctx).synthesize({ ...input, signal: AbortSignal.abort() })).rejects.toMatchObject({ code: "aborted", retryable: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("times out even when the injected fetch never settles", async () => {
    const { ctx } = fake(() => new Promise<Response>(() => {}));
    ctx.timeoutMs = 5;
    await expect(createDeepgramProvider(ctx).synthesize(input)).rejects.toMatchObject({ code: "timeout", retryable: true });
  });

  it("keeps timeout protection active while reading response bodies", async () => {
    const { ctx } = fake(new Response(new ReadableStream({ start() {} })));
    ctx.timeoutMs = 5;
    await expect(createDeepgramProvider(ctx).synthesize(input)).rejects.toMatchObject({ code: "timeout" });
  });

  it("cancels pending stream reads and releases the response on early return", async () => {
    const cancel = vi.fn();
    const response = () => new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode("audio")); }, cancel,
    }));
    const { ctx } = fake(response(), response());
    const provider = createDeepgramProvider(ctx);
    const controller = new AbortController();
    const iterator = provider.synthesizeStream!({ ...input, signal: controller.signal })[Symbol.asyncIterator]();
    expect((await iterator.next()).done).toBe(false);
    controller.abort();
    await expect(iterator.next()).rejects.toMatchObject({ code: "aborted" });
    const second = provider.synthesizeStream!(input)[Symbol.asyncIterator]();
    await second.next();
    await second.return!();
    expect(cancel).toHaveBeenCalledTimes(2);
  });

  it("normalizes failures that occur after stream headers", async () => {
    let calls = 0;
    const { ctx } = fake(new Response(new ReadableStream<Uint8Array>({
      pull(controller) {
        if (calls++ === 0) controller.enqueue(new TextEncoder().encode("audio"));
        else controller.error(new TypeError("broken stream"));
      },
    })));
    await expect(collect(createDeepgramProvider(ctx).synthesizeStream!(input))).rejects.toMatchObject({ code: "provider_unavailable" });
  });
});

