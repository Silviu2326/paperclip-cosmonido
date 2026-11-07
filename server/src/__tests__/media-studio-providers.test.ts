import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mediaStudioProviders, type MediaStudioProviderDeps } from "../services/media-studio-providers.js";

const KEY = "sk-test-SECRET-1234567890";
const db = {} as never;

function secretsFor(names: Record<string, string>, resolveFails = false): NonNullable<MediaStudioProviderDeps["secrets"]> {
  return {
    getByName: vi.fn(async (_c: string, name: string) => (name in names ? { id: `id-${name}` } : null)),
    resolveSecretValue: vi.fn(async (_c: string, id: string) => {
      if (resolveFails) throw new Error("boom");
      return names[id.slice(3)]!;
    }),
  } as never;
}

/** Fake ffmpeg: writes the output file (last argv) and answers duration probes. */
function fakeFfmpeg(clipSeconds = 1.5) {
  const calls: Array<{ args: string[]; cwd?: string }> = [];
  const run: NonNullable<MediaStudioProviderDeps["runFfmpeg"]> = async (args, opts) => {
    calls.push({ args, cwd: opts.cwd });
    if (args.includes("-f") && args.includes("null")) {
      const total = clipSeconds;
      return `Duration: 00:00:0${Math.floor(total)}.${String(Math.round((total % 1) * 100)).padStart(2, "0")}, start`;
    }
    const out = args[args.length - 1]!;
    await writeFile(opts.cwd ? join(opts.cwd, out) : out, Buffer.from("fake-audio"));
    return "";
  };
  return { run, calls };
}

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "mediaprov-test-")); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

const whisperBody = (extra: object = {}) => JSON.stringify({
  text: "hello world", language: "english", duration: 90,
  words: [{ word: " hello", start: 0, end: 0.4 }, { word: "world", start: 0.5, end: 0.9 }], ...extra,
});

describe("ensureConfigured", () => {
  it("throws 422 when the key is missing, with the secret name and no key material", async () => {
    const p = mediaStudioProviders(db, { secrets: secretsFor({}) });
    await expect(p.ensureConfigured("c1", "transcribe")).rejects.toMatchObject({ status: 422, message: expect.stringContaining("OpenAI API Key") });
    await expect(p.ensureConfigured("c1", "dub")).rejects.toMatchObject({ status: 422, message: expect.stringContaining("ElevenLabs") });
  });
  it("accepts the env-style fallback name and throws 422 when unresolvable", async () => {
    await expect(mediaStudioProviders(db, { secrets: secretsFor({ ELEVENLABS_API_KEY: "k" }) }).ensureConfigured("c1", "elevenlabs")).resolves.toBeUndefined();
    await expect(mediaStudioProviders(db, { secrets: secretsFor({ OPENAI_API_KEY: KEY }, true) }).ensureConfigured("c1", "openai_whisper"))
      .rejects.toMatchObject({ status: 422, message: expect.not.stringContaining(KEY) });
  });
});

describe("transcribe", () => {
  async function source() { const p = join(dir, "in.mp4"); await writeFile(p, "x"); return p; }

  it("sends word-timestamp form, parses words and flags cost as estimated with provenance", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => new Response(whisperBody({ usage: { type: "duration", seconds: 90 } }), { status: 200 }));
    const p = mediaStudioProviders(db, { secrets: secretsFor({ "OpenAI API Key": KEY }), fetch: fetchMock as never, runFfmpeg: fakeFfmpeg().run });
    const r = await p.transcribe({ companyId: "c1", sourcePath: await source() });
    expect(r.words).toEqual([{ text: "hello", start: 0, end: 0.4 }, { text: "world", start: 0.5, end: 0.9 }]);
    expect(r).toMatchObject({ provider: "openai_whisper", duration: 90, language: "english", costStatus: "estimated", costCents: 0.9 });
    expect(r.pricingProvenance?.unit).toBe("audio_second");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    const form = init.body as FormData;
    expect(form.get("model")).toBe("whisper-1");
    expect(form.get("response_format")).toBe("verbose_json");
    expect(form.getAll("timestamp_granularities[]")).toEqual(["word"]);
    expect(JSON.stringify(r)).not.toContain(KEY);
  });

  it("returns unpriced when neither usage nor duration is reported", async () => {
    const body = JSON.stringify({ text: "hi", words: [{ word: "hi", start: 0, end: 1 }] });
    const p = mediaStudioProviders(db, { secrets: secretsFor({ "OpenAI API Key": KEY }), fetch: (async () => new Response(body)) as never, runFfmpeg: fakeFfmpeg().run });
    const r = await p.transcribe({ companyId: "c1", sourcePath: await source() });
    expect(r.costStatus).toBe("unpriced");
    expect(r.pricingProvenance?.estimatedCents).toBeNull();
    expect(r.duration).toBe(1);
  });

  it("rejects missing words and redacts keys from provider errors", async () => {
    const p1 = mediaStudioProviders(db, { secrets: secretsFor({ "OpenAI API Key": KEY }), fetch: (async () => new Response(JSON.stringify({ text: "x" }))) as never, runFfmpeg: fakeFfmpeg().run });
    await expect(p1.transcribe({ companyId: "c1", sourcePath: await source() })).rejects.toThrow(/no word timestamps/);
    const err = JSON.stringify({ error: { message: `Incorrect API key provided: ${KEY}.` } });
    const p2 = mediaStudioProviders(db, { secrets: secretsFor({ "OpenAI API Key": KEY }), fetch: (async () => new Response(err, { status: 401 })) as never, runFfmpeg: fakeFfmpeg().run });
    const e = await p2.transcribe({ companyId: "c1", sourcePath: await source() }).catch((x) => x as Error);
    expect(e.message).toContain("401");
    expect(e.message).not.toContain(KEY);
  });

  it("enforces the upload size limit and response byte cap", async () => {
    const big: NonNullable<MediaStudioProviderDeps["runFfmpeg"]> = async (args) => { await writeFile(args[args.length - 1]!, Buffer.alloc(25 * 1024 * 1024 + 1)); return ""; };
    const fetchMock = vi.fn();
    const p = mediaStudioProviders(db, { secrets: secretsFor({ "OpenAI API Key": KEY }), fetch: fetchMock as never, runFfmpeg: big });
    await expect(p.transcribe({ companyId: "c1", sourcePath: await source() })).rejects.toThrow(/25 MiB/);
    expect(fetchMock).not.toHaveBeenCalled();
    const huge = new Response("x", { headers: { "content-length": String(99 * 1024 * 1024) } });
    const p2 = mediaStudioProviders(db, { secrets: secretsFor({ "OpenAI API Key": KEY }), fetch: (async () => huge) as never, runFfmpeg: fakeFfmpeg().run });
    await expect(p2.transcribe({ companyId: "c1", sourcePath: await source() })).rejects.toThrow(/limit/);
  });

  it("propagates abort to fetch and does not call it when already aborted", async () => {
    const ctl = new AbortController();
    const fetchMock = vi.fn((_u: string, init: RequestInit) => new Promise<Response>((_res, rej) => {
      init.signal!.addEventListener("abort", () => rej(new Error("aborted by signal")));
    }));
    const p = mediaStudioProviders(db, { secrets: secretsFor({ "OpenAI API Key": KEY }), fetch: fetchMock as never, runFfmpeg: fakeFfmpeg().run });
    const pending = p.transcribe({ companyId: "c1", sourcePath: await source(), signal: ctl.signal });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    ctl.abort();
    await expect(pending).rejects.toThrow(/abort/);
    await expect(p.transcribe({ companyId: "c1", sourcePath: await source(), signal: ctl.signal })).rejects.toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("dub", () => {
  const segs = [
    { start: 0, end: 2, text: "Hola" },
    { start: 3, end: 4, text: "Mundo" },
    { start: 5, end: 7, text: "Adiós" },
    { start: 8, end: 9, text: "Fin" },
  ];

  it("TTSes each segment with bounded concurrency, mixes with argv, writes output and reports unpriced cost", async () => {
    let active = 0, peak = 0;
    const fetchMock = vi.fn(async (_u: string, _i: RequestInit) => {
      active++; peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
      return new Response(Buffer.from("mp3"), { status: 200 });
    });
    const ff = fakeFfmpeg(1.5);
    const out = join(dir, "nested", "dub.mp3");
    const p = mediaStudioProviders(db, { secrets: secretsFor({ "ElevenLabs API Key": "xi-secret-key-123" }), fetch: fetchMock as never, runFfmpeg: ff.run });
    const r = await p.dub({ companyId: "c1", segments: segs, language: "es", voiceId: "voice_1", outputPath: out });
    expect(peak).toBeLessThanOrEqual(3);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.elevenlabs.io/v1/text-to-speech/voice_1?output_format=mp3_44100_128");
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("xi-secret-key-123");
    expect(JSON.parse(init.body as string)).toEqual({ text: "Hola", model_id: "eleven_multilingual_v2" });
    expect((await stat(out)).size).toBeGreaterThan(0);
    const mix = ff.calls[ff.calls.length - 1]!.args;
    const graph = mix[mix.indexOf("-filter_complex") + 1]!;
    expect(graph).toContain("atempo=");            // 1.5s clip in a 1s slot is sped up
    expect(graph).toContain("adelay=3000|3000");
    expect(graph).toContain("amix=inputs=4");
    expect(r).toMatchObject({ provider: "elevenlabs", costStatus: "unpriced", costCents: 0 });
    expect(r.pricingProvenance).toMatchObject({ unit: "character", units: 4 + 5 + 5 + 3 });
    expect(JSON.stringify(r)).not.toContain("xi-secret");
  });

  it("validates input before any provider call", async () => {
    const fetchMock = vi.fn();
    const p = mediaStudioProviders(db, { secrets: secretsFor({ "ElevenLabs API Key": "k" }), fetch: fetchMock as never, runFfmpeg: fakeFfmpeg().run });
    const base = { companyId: "c1", language: "es", voiceId: "v", outputPath: join(dir, "o.mp3") };
    await expect(p.dub({ ...base, segments: [] })).rejects.toThrow(/translated segments/);
    await expect(p.dub({ ...base, segments: [{ start: 2, end: 1, text: "x" }] })).rejects.toThrow(/valid timestamps/);
    await expect(p.dub({ ...base, voiceId: "../evil?x=1", segments: segs })).rejects.toMatchObject({ status: 422 });
    await expect(p.dub({ ...base, segments: [{ start: 0, end: 1, text: "a".repeat(5001) }] })).rejects.toThrow(/5000/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails without leaking the key when ElevenLabs rejects, and leaves no output file", async () => {
    const out = join(dir, "o.mp3");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ detail: { message: "bad xi-secret-key-123" } }), { status: 401 }));
    const p = mediaStudioProviders(db, { secrets: secretsFor({ "ElevenLabs API Key": "xi-secret-key-123" }), fetch: fetchMock as never, runFfmpeg: fakeFfmpeg().run });
    const e = await p.dub({ companyId: "c1", segments: segs, language: "es", voiceId: "v", outputPath: out }).catch((x) => x as Error);
    expect(e.message).toContain("401");
    expect(e.message).not.toContain("xi-secret");
    await expect(readFile(out)).rejects.toThrow();
  });

  it("stops scheduling new segments after the signal aborts", async () => {
    const ctl = new AbortController();
    const fetchMock = vi.fn(async () => { ctl.abort(); return new Response(Buffer.from("mp3")); });
    const p = mediaStudioProviders(db, { secrets: secretsFor({ "ElevenLabs API Key": "k" }), fetch: fetchMock as never, runFfmpeg: fakeFfmpeg().run });
    await expect(p.dub({ companyId: "c1", segments: segs, language: "es", voiceId: "v", outputPath: join(dir, "o.mp3"), signal: ctl.signal })).rejects.toBeTruthy();
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(3);
  });
});
