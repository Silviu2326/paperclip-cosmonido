import { describe, expect, it } from "vitest";
import { cloneVoice, requestProfessionalVoiceVerification, verifyProfessionalVoice } from "../../src/providers/elevenlabs/cloning.js";
import { designVoice, saveDesignedVoice } from "../../src/providers/elevenlabs/design.js";
import { fake, json, sample } from "./helpers.js";

describe("ElevenLabs cloning", () => {
  it("enforces explicit consent before any request, including professional clones", async () => {
    const { ctx, calls } = fake([]);
    for (const mode of ["instant", "professional"] as const) {
      for (const consent of [undefined, { attested: false }]) {
        await expect(cloneVoice(ctx, { name: "Clone", samples: [sample], mode, consent })).rejects.toMatchObject({ code: "invalid_request", retryable: false });
      }
    }
    expect(calls).toHaveLength(0);
  });

  it("uploads instant clone samples as repeated files fields with metadata", async () => {
    const { ctx, calls } = fake([json({ voice_id: "new" })]);
    const result = await cloneVoice(ctx, { name: "Clone", description: "Owner voice", language: "es-ES", labels: { gender: "female" }, samples: [sample, { ...sample, fileName: "second.wav" }], denoise: true, consent: { attested: true, text: "I authorize this clone." } });
    const form = calls[0].init.body as FormData;
    expect(calls[0].url.pathname).toBe("/v1/voices/add");
    expect(calls[0].headers.get("content-type")).toBeNull();
    expect(form.get("name")).toBe("Clone");
    expect(form.get("description")).toBe("Owner voice");
    expect(form.get("remove_background_noise")).toBe("true");
    expect(JSON.parse(String(form.get("labels")))).toEqual({ gender: "female", language: "es", consent_attested: "true" });
    const files = form.getAll("files") as File[];
    expect(files.map(file => file.name)).toEqual(["owner.wav", "second.wav"]);
    expect(new Uint8Array(await files[0].arrayBuffer())).toEqual(sample.data);
    expect(result).toMatchObject({ status: "ready", voice: { id: "elevenlabs:new", origin: "cloned", raw: { consent: { attested: true } } } });
  });

  it("respects instant-clone verification requirements from the provider", async () => {
    const { ctx } = fake([json({ voice_id: "new", requires_verification: true })]);
    expect(await cloneVoice(ctx, { name: "Clone", samples: [sample], consent: { attested: true } })).toMatchObject({ status: "pending_verification", voice: { raw: { status: "pending_verification" } } });
  });

  it("creates a professional clone, uploads samples and starts asynchronous training", async () => {
    const { ctx, calls } = fake([json({ voice_id: "pvc" }), json({ samples: [] }), json({ status: "ok" })]);
    const result = await cloneVoice(ctx, { name: "Professional", language: "en-US", mode: "professional", samples: [sample], denoise: false, consent: { attested: true } });
    expect(calls.map(call => call.url.pathname)).toEqual(["/v1/voices/pvc", "/v1/voices/pvc/pvc/samples", "/v1/voices/pvc/pvc/train"]);
    expect(calls[0].body).toMatchObject({ name: "Professional", language: "en" });
    expect((calls[1].init.body as FormData).get("remove_background_noise")).toBe("false");
    expect(calls[2].body).toEqual({ model_id: "eleven_multilingual_v2" });
    expect(result).toMatchObject({ status: "training", jobId: "pvc", voice: { origin: "professional_clone", raw: { status: "training" } } });
  });

  it("returns pending verification instead of claiming training when ownership is unverified", async () => {
    const { ctx } = fake([json({ voice_id: "pvc" }), json({}), json({ detail: { status: "voice_not_verified", message: "Verify ownership" } }, 400)]);
    expect(await cloneVoice(ctx, { name: "PVC", language: "en", mode: "professional", samples: [sample], consent: { attested: true } })).toMatchObject({ status: "pending_verification", jobId: "pvc" });
  });

  it("submits manual verification documents without pretending they are approved", async () => {
    const { ctx, calls } = fake([json({ voice_id: "pvc" }), json({}), json({ status: "ok" })]);
    const result = await cloneVoice(ctx, { name: "PVC", language: "en", mode: "professional", samples: [sample], consent: { attested: true }, providerOptions: { verification_documents: [{ ...sample, fileName: "ownership.pdf", mimeType: "application/pdf" }], verification_text: "Verification case" } });
    expect(result.status).toBe("pending_verification");
    expect(calls[2].url.pathname).toBe("/v1/voices/pvc/pvc/verification");
    expect((calls[2].init.body as FormData).get("extra_text")).toBe("Verification case");
    expect(((calls[2].init.body as FormData).get("files") as File).name).toBe("ownership.pdf");
  });

  it("preserves the created voice ID in partial failures and prevents automatic duplication", async () => {
    const { ctx } = fake([json({ voice_id: "recover-me" }), json({ detail: { status: "system_busy" } }, 503)]);
    await expect(cloneVoice(ctx, { name: "PVC", language: "en", mode: "professional", samples: [sample], consent: { attested: true } })).rejects.toMatchObject({ code: "provider_unavailable", retryable: false, details: { voice_id: "recover-me" } });
  });

  it("exposes manual and captcha verification endpoints", async () => {
    const { ctx, calls } = fake([json({ status: "ok" }), json({ status: "ok" })]);
    await requestProfessionalVoiceVerification(ctx, "pvc/id", [sample], "Owner evidence");
    await verifyProfessionalVoice(ctx, "pvc/id", sample);
    expect(calls[0].url.pathname).toBe("/v1/voices/pvc/pvc%2Fid/verification");
    expect(calls[1].url.pathname).toBe("/v1/voices/pvc/pvc%2Fid/captcha");
    expect((calls[1].init.body as FormData).get("recording")).toBeInstanceOf(Blob);
  });
});

describe("ElevenLabs voice design", () => {
  it("expands terse prompts, maps options, decodes previews and saves a chosen candidate", async () => {
    const { ctx, calls } = fake([json({ previews: [
      { generated_voice_id: "candidate", audio_base_64: "AQID", media_type: "audio/mpeg", duration_secs: 1.2 },
      { generated_voice_id: "other", audio_base_64: "BA==" },
    ] }), json({ voice_id: "saved", name: "My designed voice", category: "generated" })]);
    const result = await designVoice(ctx, { prompt: "Warm", gender: "female", age: "middle_aged", accent: "castilian", language: "es-ES", candidates: 1,
      providerOptions: { model_id: "eleven_ttv_v3", guidance_scale: 7, loudness: 0.4, seed: 123, output_format: "mp3_44100_192" } });
    expect(calls[0].url.pathname).toBe("/v1/text-to-voice/design");
    expect(calls[0].url.searchParams.get("output_format")).toBe("mp3_44100_192");
    expect(calls[0].body).toMatchObject({ model_id: "eleven_ttv_v3", guidance_scale: 7, loudness: 0.4, seed: 123, auto_generate_text: true });
    for (const text of ["female", "middle aged", "castilian", "es-ES"]) expect(calls[0].body.voice_description).toContain(text);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({ candidateId: "candidate", preview: { data: new Uint8Array([1, 2, 3]), mimeType: "audio/mpeg", durationMs: 1200, format: { bitrate: 192 } } });
    expect(await saveDesignedVoice(ctx, "candidate", "My designed voice", "Warm narrator")).toMatchObject({ id: "elevenlabs:saved", origin: "designed" });
    expect(calls[1].body).toEqual({ generated_voice_id: "candidate", voice_name: "My designed voice", voice_description: "Warm narrator" });
  });

  it("keeps full prompts and caller-provided preview text", async () => {
    const prompt = "Warm natural narration with a clear steady delivery and a gentle cadence. A mature speaker with a calm, grounded tone.";
    const { ctx, calls } = fake([json({ previews: [] })]);
    await designVoice(ctx, { prompt, text: "This is the exact preview text." });
    expect(calls[0].body).toMatchObject({ voice_description: prompt, text: "This is the exact preview text.", auto_generate_text: false, model_id: "eleven_multilingual_ttv_v2" });
  });
});
