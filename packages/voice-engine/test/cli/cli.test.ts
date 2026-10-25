import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../../src/cli/index.js";
import { VoiceEngineError } from "../../src/core/errors.js";
import { createFakeEngine, fakeAudio, fakeUsage, fakeVoice } from "./fake-engine.js";

let cwd: string;
beforeEach(async () => { cwd = await mkdtemp(join(tmpdir(), "voice-cli-")); });
afterEach(async () => { await rm(cwd, { recursive: true, force: true }); });
function harness(engine = createFakeEngine()) {
  const stdout: string[] = [], stderr: string[] = [];
  const factory = vi.fn(() => engine);
  return { engine, stdout, stderr, factory, run: (args: string[], stdin?: string) => runCli(args, { cwd, env: {}, stdout: text => stdout.push(text), stderr: text => stderr.push(text), engineFactory: factory, stdin }) };
}

describe("CLI contracts", () => {
  it("prints voices as an aligned table and forwards filters", async () => {
    const h = harness();
    expect(await h.run(["voices", "--language", "es-ES", "--tag=calm", "--tag=narration", "--company=company-1"])).toBe(0);
    expect(h.stdout.join("")).toContain("ID          NAME");
    expect(h.stdout.join("")).toContain("fake:alice");
    expect(h.engine.listVoices).toHaveBeenCalledWith(expect.objectContaining({ language: "es-ES", tags: ["calm", "narration"] }));
    expect(h.factory).toHaveBeenCalledWith(expect.objectContaining({ scope: { companyId: "company-1" } }));
  });
  it("prints parseable JSON without table headings", async () => {
    const h = harness();
    expect(await h.run(["voices", "--json"])).toBe(0);
    expect(JSON.parse(h.stdout.join(""))).toEqual([fakeVoice]);
    expect(h.stderr).toEqual([]);
  });
  it("writes synthesis audio and timestamps; keeps diagnostics on stderr", async () => {
    const h = harness();
    expect(await h.run(["speak", "Hola", "--voice=fake:alice", "--out-dir=audio", "--out=hello.mp3", "--timestamps", "--json", "--pitch=-2"])).toBe(0);
    expect(await readFile(join(cwd, "audio", "hello.mp3"))).toEqual(Buffer.from(fakeAudio.data));
    expect(JSON.parse(await readFile(join(cwd, "audio", "hello.mp3.json"), "utf8")).timestamps).toHaveLength(1);
    expect(h.engine.synthesize).toHaveBeenCalledWith(expect.objectContaining({ text: "Hola", settings: expect.objectContaining({ pitch: -2 }) }));
    expect(JSON.parse(h.stdout.join("")).path).toBe(join(cwd, "audio", "hello.mp3"));
    expect(h.stderr.join("")).toContain("latency 12 ms");
    expect(h.stdout.join("")).not.toContain('"data"');
  });
  it("supports stdin, @files, automatic selection and long synthesis", async () => {
    const h = harness();
    expect(await h.run(["speak", "-", "--voice=auto", "--language=es-ES", "--long", "--concurrency=2"], "From stdin")).toBe(0);
    expect(h.engine.recommendVoice).toHaveBeenCalledWith(expect.objectContaining({ language: "es-ES" }));
    expect(h.engine.synthesizeLong).toHaveBeenCalledWith(expect.objectContaining({ text: "From stdin", voice: "fake:alice" }), expect.objectContaining({ concurrency: 2 }));
    await writeFile(join(cwd, "input.txt"), "From file");
    expect(await h.run(["estimate", "@input.txt", "--voice=fake:alice"])).toBe(0);
    expect(h.engine.estimateCost).toHaveBeenCalledWith(expect.objectContaining({ text: "From file" }));
  });
  it("writes streaming chunks before the next chunk is requested", async () => {
    const engine = createFakeEngine({ synthesizeStream: async function* () {
      yield { audio: new Uint8Array([1, 2]) };
      expect(await readFile(join(cwd, "stream.mp3"))).toEqual(Buffer.from([1, 2]));
      yield { audio: new Uint8Array([3, 4]) };
      engine.emit({ type: "usage", usage: fakeUsage });
    } });
    const h = harness(engine);
    expect(await h.run(["speak", "Hi", "--voice=fake:alice", "--stream", "--out=stream.mp3", "--json"])).toBe(0);
    expect(await readFile(join(cwd, "stream.mp3"))).toEqual(Buffer.from([1, 2, 3, 4]));
    expect(engine.estimateCost).not.toHaveBeenCalled();
    expect(JSON.parse(h.stdout.join("")).usageRecords).toEqual([fakeUsage]);
  });
  it("refuses cloning without explicit consent before reading samples", async () => {
    const h = harness();
    expect(await h.run(["clone", "--provider=fake", "--name=Alice", "--sample=missing.wav"])).toBe(2);
    expect(h.stderr.join("")).toContain("--consent");
    expect(h.engine.cloneVoice).not.toHaveBeenCalled();
  });
  it("loads repeated clone samples and attests consent", async () => {
    const h = harness();
    await writeFile(join(cwd, "a.wav"), fakeAudio.data);
    expect(await h.run(["clone", "--provider=fake", "--name=Alice", "--sample=a.wav", "--sample=a.wav", "--consent", "--mode=professional"])).toBe(0);
    expect(h.engine.cloneVoice).toHaveBeenCalledWith("fake", expect.objectContaining({ consent: { attested: true }, mode: "professional", samples: expect.arrayContaining([expect.objectContaining({ mimeType: "audio/wav" })]) }));
  });
  it.each([["no-such-command"], ["voices", "--limti=2"], ["voices", "--limit=-1"], ["speak", "Hello", "--voice=fake:alice", "--stream", "--long"], ["delete-voice", "fake:alice"]])("returns usage exit 2: %s", async (...args) => {
    expect(await harness().run(args)).toBe(2);
  });
  it("returns engine exit 1 with actionable error fields", async () => {
    const h = harness(createFakeEngine({ listVoices: async () => { throw new VoiceEngineError("Set FAKE_API_KEY.", { code: "auth", provider: "fake", status: 401 }); } }));
    expect(await h.run(["voices", "--json"])).toBe(1);
    expect(JSON.parse(h.stderr.join(""))).toEqual({ error: { code: "auth", provider: "fake", status: 401, message: "Set FAKE_API_KEY." } });
  });
  it("does not initialize an engine for help", async () => {
    const h = harness();
    expect(await h.run(["speak", "--help"])).toBe(0);
    expect(h.factory).not.toHaveBeenCalled();
  });
  it("saves all design previews and the selected candidate", async () => {
    const h = harness();
    expect(await h.run(["design", "--provider=fake", "--prompt=Warm narrator", "--save=Alice", "--pick=2", "--json"])).toBe(0);
    const result = JSON.parse(h.stdout.join(""));
    expect(result.candidates).toHaveLength(2);
    expect(await readFile(result.candidates[0].path)).toEqual(Buffer.from(fakeAudio.data));
    expect(h.engine.saveDesignedVoice).toHaveBeenCalledWith("fake", "candidate-2", "Alice");
  });
  it("runs bounded batches, reports partial failures and does not lose results", async () => {
    let active = 0, maximum = 0;
    const baseline = createFakeEngine();
    const h = harness(createFakeEngine({ synthesize: async request => {
      active++; maximum = Math.max(maximum, active);
      await new Promise(resolve => setTimeout(resolve, 5)); active--;
      if (request.text === "fail") throw new Error("fixture failure");
      return baseline.synthesize(request);
    } }));
    await writeFile(join(cwd, "batch.json"), JSON.stringify(["one", "two", "fail", "four"].map(text => ({ text, voice: "fake:alice" }))));
    expect(await h.run(["batch", "batch.json", "--concurrency=2", "--json"])).toBe(1);
    const result = JSON.parse(h.stdout.join(""));
    expect(result).toMatchObject({ succeeded: 3, failed: 1, totalChars: 10 });
    expect(maximum).toBe(2);
    expect(result.results.map((row: { index: number }) => row.index)).toEqual([1, 2, 3, 4]);
  });
  it("validates every batch row and output collision before spending", async () => {
    const h = harness();
    await writeFile(join(cwd, "batch.json"), JSON.stringify([{ text: "one", voice: "fake:alice", out: "same.mp3" }, { text: "two", voice: "fake:alice", out: "same.mp3" }]));
    expect(await h.run(["batch", "batch.json"])).toBe(2);
    expect(h.engine.synthesize).not.toHaveBeenCalled();
  });
  it("reports static capabilities without instantiating unavailable providers through the engine", async () => {
    const h = harness(createFakeEngine({ availableProviders: async () => [] }));
    expect(await h.run(["providers", "--json"])).toBe(0);
    const row = JSON.parse(h.stdout.join(""))[0];
    expect(row).toMatchObject({ available: false });
    expect(row.capabilities).toBeNull(); // the fake definition cannot be built offline
    expect(h.engine.provider).not.toHaveBeenCalled();
  });
  it("lists languages and reports doctor health", async () => {
    const h = harness();
    expect(await h.run(["languages", "--json"])).toBe(0);
    expect(JSON.parse(h.stdout.join(""))).toContainEqual({ tag: "es-ES", name: expect.stringContaining("Spanish"), providers: ["fake"] });
    const doctor = harness(createFakeEngine({ availableProviders: async () => [] }));
    expect(await doctor.run(["doctor", "--json"])).toBe(1);
    expect(JSON.parse(doctor.stdout.join(""))[0].detail).toContain("FAKE_API_KEY");
  });
  it("filters models and returns voice details and recommendations", async () => {
    const models = harness();
    expect(await models.run(["models", "--language=es-MX", "--tier=balanced", "--json"])).toBe(0);
    expect(JSON.parse(models.stdout.join(""))).toHaveLength(1);
    const details = harness();
    expect(await details.run(["voice", "fake:alice", "--json"])).toBe(0);
    expect(JSON.parse(details.stdout.join(""))).toEqual(fakeVoice);
    const recommendation = harness();
    expect(await recommendation.run(["recommend", "--gender=female", "--tag=narration", "--json"])).toBe(0);
    expect(recommendation.engine.recommendVoice).toHaveBeenCalledWith(expect.objectContaining({ gender: "female", tags: ["narration"] }));
  });
  it("returns not_found for missing voices and recommendations", async () => {
    expect(await harness(createFakeEngine({ getVoice: async () => undefined })).run(["voice", "fake:missing"])).toBe(1);
    expect(await harness(createFakeEngine({ recommendVoice: async () => undefined })).run(["recommend"])).toBe(1);
  });
  it("converts speech into a file and explicitly deletes provider voices", async () => {
    await writeFile(join(cwd, "input.wav"), fakeAudio.data);
    const h = harness();
    expect(await h.run(["sts", "--voice=fake:alice", "--input=input.wav", "--out=converted.mp3"])).toBe(0);
    expect(await readFile(join(cwd, "converted.mp3"))).toEqual(Buffer.from(fakeAudio.data));
    expect(h.engine.speechToSpeech).toHaveBeenCalledWith(expect.objectContaining({ voice: "fake:alice", audio: expect.objectContaining({ fileName: "input.wav", mimeType: "audio/wav" }) }));
    expect(await h.run(["delete-voice", "fake:alice", "--yes"])).toBe(0);
    expect(h.engine.deleteVoice).toHaveBeenCalledExactlyOnceWith("fake:alice");
  });
  it("preserves engine error fields in batch failure summaries", async () => {
    const h = harness(createFakeEngine({ synthesize: async () => { throw new VoiceEngineError("Set FAKE_API_KEY.", { code: "auth", provider: "fake", status: 401 }); } }));
    await writeFile(join(cwd, "batch.json"), JSON.stringify([{ text: "hello", voice: "fake:alice" }]));
    expect(await h.run(["batch", "batch.json", "--json"])).toBe(1);
    expect(JSON.parse(h.stdout.join("")).results[0].error).toEqual({ code: "auth", provider: "fake", status: 401, message: "Set FAKE_API_KEY." });
  });
  it("returns usage 2 for an invalid later batch row before synthesizing earlier rows", async () => {
    const h = harness();
    await writeFile(join(cwd, "batch.json"), JSON.stringify([{ text: "hello", voice: "fake:alice" }, { text: "hi", voice: "auto", gender: "typo" }]));
    expect(await h.run(["batch", "batch.json"])).toBe(2);
    expect(h.engine.synthesize).not.toHaveBeenCalled();
  });
});
