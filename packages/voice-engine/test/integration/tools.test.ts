import { describe, expect, it, vi } from "vitest";
import type { AudioStorage } from "../../src/core/types.js";
import { artifactAudioStorage } from "../../src/integration/storage.js";
import { createVoiceToolHandlers, INLINE_AUDIO_LIMIT, VOICE_TOOLS } from "../../src/integration/tools.js";
import { describeProviders, voiceEngineManifest } from "../../src/integration/manifest.js";
import { createFakeEngine, fakeAudio, fakeVoice } from "../cli/fake-engine.js";

function setup() {
  const engine = createFakeEngine();
  const save = vi.fn(async () => ({ uri: "artifact://company-1/audio-1" }));
  const storage: AudioStorage = { save };
  return { engine, save, handlers: createVoiceToolHandlers(engine, { storage }) };
}

describe("agent tools", () => {
  it("returns a URI and metadata without bytes or base64 by default", async () => {
    const { engine, save, handlers } = setup();
    const result = await handlers.voice_speak({ text: "Hello", voice: "fake:alice", fileName: "hello.mp3" });
    expect(engine.synthesize).toHaveBeenCalledWith({ text: "Hello", voice: "fake:alice" });
    expect(save).toHaveBeenCalledWith(fakeAudio, expect.objectContaining({ fileName: "hello.mp3" }));
    expect(result).toMatchObject({ uri: "artifact://company-1/audio-1", byteLength: 4, mimeType: "audio/mpeg" });
    expect(JSON.stringify(result)).not.toContain('"data"');
    expect(result).not.toHaveProperty("base64");
  });
  it("allows explicit small inline output and rejects it at the 1 MB boundary", async () => {
    const { engine, handlers } = setup();
    expect(await handlers.voice_speak({ text: "Hi", voice: "fake:alice", inline: true })).toHaveProperty("base64", Buffer.from(fakeAudio.data).toString("base64"));
    const base = await engine.synthesize({ text: "Hi", voice: "fake:alice" });
    vi.spyOn(engine, "synthesize").mockResolvedValue({ ...base, audio: { ...fakeAudio, data: new Uint8Array(INLINE_AUDIO_LIMIT) } });
    expect(await handlers.voice_speak({ text: "Hi", voice: "fake:alice", inline: true })).not.toHaveProperty("base64");
  });
  it("routes long-form options and estimates without synthesis", async () => {
    const { engine, handlers } = setup();
    await handlers.voice_speak_long({ text: "Long text", voice: "fake:alice", concurrency: 2, maxChunkChars: 500 });
    expect(engine.synthesizeLong).toHaveBeenCalledWith({ text: "Long text", voice: "fake:alice" }, { concurrency: 2, maxChunkChars: 500 });
    await handlers.voice_estimate({ text: "Hi", voice: "fake:alice" });
    expect(engine.estimateCost).toHaveBeenCalledWith({ text: "Hi", voice: "fake:alice", model: undefined });
    expect(engine.synthesize).not.toHaveBeenCalled();
  });
  it("rejects missing consent and unsafe filenames before engine calls", async () => {
    const { engine, handlers } = setup();
    await expect(handlers.voice_clone({ provider: "fake", name: "Alice", samples: [] })).rejects.toMatchObject({ code: "invalid_request" });
    await expect(handlers.voice_speak({ text: "Hi", voice: "fake:alice", fileName: "../escape.mp3" })).rejects.toMatchObject({ code: "invalid_request" });
    await expect(handlers.voice_speak({ text: "Hi", voice: "fake:alice", companyId: "other-company" })).rejects.toMatchObject({ code: "invalid_request" });
    expect(engine.cloneVoice).not.toHaveBeenCalled();
    expect(engine.synthesize).not.toHaveBeenCalled();
  });
  it("decodes consented sample data and stores design previews", async () => {
    const { engine, handlers } = setup();
    await handlers.voice_clone({ provider: "fake", name: "Alice", consent: { attested: true }, samples: [{ dataBase64: "AQI=", mimeType: "audio/wav" }] });
    expect(engine.cloneVoice).toHaveBeenCalledWith("fake", expect.objectContaining({ consent: { attested: true }, samples: [expect.objectContaining({ data: Buffer.from([1, 2]) })] }));
    const result = await handlers.voice_design({ provider: "fake", prompt: "Warm Spanish narrator" });
    expect(result).toMatchObject({ candidates: [expect.objectContaining({ candidateId: "candidate-1", uri: "artifact://company-1/audio-1" }), expect.objectContaining({ candidateId: "candidate-2", uri: "artifact://company-1/audio-1" })] });
    expect(JSON.stringify(result)).not.toContain('"data"');
  });
  it("filters raw provider payloads from catalog results", async () => {
    const { engine, handlers } = setup();
    vi.spyOn(engine, "listVoices").mockResolvedValue([{ ...fakeVoice, raw: { audio_base64: "not-for-tool-output" } }]);
    expect(await handlers.voice_list_voices({ language: "es-ES" })).toEqual([fakeVoice]);
  });
  it("does not leak inline previews through data URLs", async () => {
    const { engine, handlers } = setup();
    vi.spyOn(engine, "listVoices").mockResolvedValue([{ ...fakeVoice, previewUrl: "data:audio/mp3;base64,AQI=" }]);
    expect(await handlers.voice_list_voices({})).toEqual([fakeVoice]);
    const dataStorage = createVoiceToolHandlers(engine, { storage: { save: async () => ({ uri: "data:audio/mp3;base64,AQI=" }) } });
    await expect(dataStorage.voice_speak({ text: "Hi", voice: "fake:alice" })).rejects.toMatchObject({ code: "invalid_request" });
  });
  it("keeps schemas, handlers and manifest in sync", () => {
    const { handlers } = setup();
    expect(Object.keys(handlers).sort()).toEqual(voiceEngineManifest.tools.toSorted());
    expect(VOICE_TOOLS.filter(tool => tool.effect === "read").map(tool => tool.name)).toEqual(["voice_list_voices", "voice_estimate"]);
  });
  it("describes unavailable providers without creating them", async () => {
    const engine = createFakeEngine({ availableProviders: async () => [] });
    expect(await describeProviders(engine)).toEqual([expect.objectContaining({ id: "fake", available: false, capabilities: null })]);
    expect(engine.provider).not.toHaveBeenCalled();
  });
});

describe("artifact storage", () => {
  it("passes audio and metadata to a scoped uploader", async () => {
    const upload = vi.fn(async () => ({ artifactId: "audio-1", uri: "artifact://audio-1" }));
    const result = await artifactAudioStorage({ upload }).save(fakeAudio, { fileName: "hello.mp3", metadata: { companyId: "co-1" } });
    expect(upload).toHaveBeenCalledWith(fakeAudio.data, { fileName: "hello.mp3", mimeType: "audio/mpeg", metadata: { companyId: "co-1" } });
    expect(result).toEqual({ uri: "artifact://audio-1" });
  });
});
