import { describe, expect, it } from "vitest";
import { addSharedVoice, getVoice, listVoices, normalizeVoice, searchVoiceLibrary, voiceStatus } from "../../src/providers/elevenlabs/voices.js";
import { deleteVoice, updateVoice } from "../../src/providers/elevenlabs/cloning.js";
import { fake, json, sample } from "./helpers.js";

describe("ElevenLabs voice catalog", () => {
  it("normalizes labels, origin, locales, model IDs, previews and fine tuning", () => {
    const raw = { voice_id: "a", name: "Alicia", category: "professional", labels: { gender: "Female", age: "middle aged", accent: "castilian", use_case: "narration", description: "Warm" },
      verified_languages: [{ language: "es", locale: "es_ES" }, { language: "en", locale: "en-US" }],
      high_quality_base_model_ids: ["eleven_multilingual_v2"], preview_url: "https://example.com/a.mp3", fine_tuning: { state: { eleven_multilingual_v2: "fine_tuning" } } };
    expect(normalizeVoice(raw)).toMatchObject({ id: "elevenlabs:a", providerVoiceId: "a", provider: "elevenlabs", name: "Alicia", description: "Warm",
      gender: "female", age: "middle_aged", accent: "castilian", tags: ["narration"], origin: "professional_clone", languages: ["es-ES", "en-US"],
      models: ["eleven_multilingual_v2"], previewUrl: "https://example.com/a.mp3", raw: { fine_tuning: raw.fine_tuning, status: "training" } });
    expect(voiceStatus({ fine_tuning: { state: { m: "fine_tuned" } } })).toBe("ready");
    expect(voiceStatus({ fine_tuning: { state: { m: "failed" } } })).toBe("failed");
    expect(voiceStatus({ category: "professional", voice_verification: { requires_verification: true } })).toBe("pending_verification");
  });

  it.each([["premade", "premade"], ["cloned", "cloned"], ["generated", "designed"], ["professional", "professional_clone"], ["other", "custom"]])("normalizes category %s", (category, origin) => {
    expect(normalizeVoice({ voice_id: "id", category })).toMatchObject({ origin, gender: "unknown", age: "unknown", languages: [], tags: [], models: [] });
  });

  it("paginates with all native filters and applies the limit after local filtering", async () => {
    const { ctx, calls } = fake([
      json({ voices: [{ voice_id: "one", name: "Warm man", labels: { gender: "male" } }], has_more: true, next_page_token: "cursor/+" }),
      json({ voices: [{ voice_id: "two", name: "Warm woman", category: "cloned", labels: { gender: "female" } }], has_more: true, next_page_token: "next" }),
    ]);
    const voices = await listVoices(ctx, { search: "Warm", gender: "female", limit: 1, pageSize: 2, voiceType: "personal", category: "cloned" });
    expect(voices.map(voice => voice.id)).toEqual(["elevenlabs:two"]);
    expect(calls).toHaveLength(2);
    expect(calls[0].url.pathname).toBe("/v2/voices");
    expect(Object.fromEntries(calls[0].url.searchParams)).toEqual({ search: "Warm", page_size: "2", voice_type: "personal", category: "cloned" });
    expect(calls[1].url.searchParams.get("next_page_token")).toBe("cursor/+");
  });

  it("deduplicates across pages and stops only at has_more=false", async () => {
    const { ctx } = fake([
      json({ voices: [{ voice_id: "one" }], has_more: true, next_page_token: "2" }),
      json({ voices: [{ voice_id: "one" }, { voice_id: "two" }], has_more: false }),
    ]);
    expect((await listVoices(ctx)).map(voice => voice.providerVoiceId)).toEqual(["one", "two"]);
  });

  it("rejects stalled pagination instead of looping forever", async () => {
    const { ctx } = fake([json({ voices: [], has_more: true, next_page_token: "repeat" }), json({ voices: [], has_more: true, next_page_token: "repeat" })]);
    await expect(listVoices(ctx)).rejects.toMatchObject({ code: "provider_unavailable" });
  });

  it("does no I/O for zero limit and returns undefined only for missing voices", async () => {
    const { ctx, calls } = fake([json({ detail: { status: "voice_not_found", message: "Missing" } }, 404), json({ detail: { status: "invalid_api_key" } }, 401)]);
    expect(await listVoices(ctx, { limit: 0 })).toEqual([]);
    expect(calls).toHaveLength(0);
    expect(await getVoice(ctx, "missing/id")).toBeUndefined();
    expect(calls[0].url.pathname).toBe("/v1/voices/missing%2Fid");
    await expect(getVoice(ctx, "x")).rejects.toMatchObject({ code: "auth" });
  });

  it("searches Voice Library by native filters and adds a shared voice", async () => {
    const { ctx, calls } = fake([
      json({ voices: [{ voice_id: "library", name: "Narrator", public_owner_id: "public", language: "es", gender: "Female", age: "young", accent: "spanish", use_case: "narration" }], has_more: false }),
      json({ voice_id: "account-copy" }),
    ]);
    const voices = await searchVoiceLibrary(ctx, { language: "es-ES", gender: "female", age: "young", accent: "spanish", useCase: "narration" });
    expect(voices[0]).toMatchObject({ origin: "community", gender: "female", languages: ["es"], tags: ["narration"], raw: { public_owner_id: "public" } });
    expect(Object.fromEntries(calls[0].url.searchParams)).toMatchObject({ language: "es", gender: "female", age: "young", accent: "spanish", use_cases: "narration", page: "0" });
    expect(await addSharedVoice(ctx, "user/id", "library/id", "My narrator")).toMatchObject({ id: "elevenlabs:account-copy", name: "My narrator" });
    expect(calls[1].url.pathname).toBe("/v1/voices/add/user%2Fid/library%2Fid");
    expect(calls[1].body).toEqual({ new_name: "My narrator" });
  });

  it("follows numbered shared-library pages", async () => {
    const { ctx, calls } = fake([json({ voices: [{ voice_id: "a" }], has_more: true }), json({ voices: [{ voice_id: "b" }], has_more: false })]);
    expect(await searchVoiceLibrary(ctx, { limit: 2 })).toHaveLength(2);
    expect(calls[1].url.searchParams.get("page")).toBe("1");
  });
});

describe("ElevenLabs voice mutation", () => {
  it("retains the current name, adds samples, deletes requested samples and refetches", async () => {
    const { ctx, calls } = fake([json({ voice_id: "v", name: "Existing" }), json({ status: "ok" }), new Response(null, { status: 204 }), json({ voice_id: "v", name: "Existing", description: "Updated" }), new Response(null, { status: 204 })]);
    expect(await updateVoice(ctx, "v", { description: "Updated", labels: { gender: "female" }, addSamples: [sample], removeSampleIds: ["old/sample"] })).toMatchObject({ description: "Updated" });
    const form = calls[1].init.body as FormData;
    expect(form.get("name")).toBe("Existing");
    expect(form.get("description")).toBe("Updated");
    expect(form.get("labels")).toBe('{"gender":"female"}');
    expect(form.getAll("files")).toHaveLength(1);
    expect(calls[2].url.pathname).toBe("/v1/voices/v/samples/old%2Fsample");
    expect(calls[2].init.method).toBe("DELETE");
    await deleteVoice(ctx, "v");
    expect(calls[4].init.method).toBe("DELETE");
  });
});
