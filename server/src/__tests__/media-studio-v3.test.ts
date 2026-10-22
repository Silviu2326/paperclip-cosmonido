import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { assets, companies, costEvents, createDb, EMBEDDED_POSTGRES_TEST_TIMEOUT_MS, goals, mediaJobs } from "@paperclipai/db";
import { stopMotion } from "@paperclipai/media-studio";
import { startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import { mediaStudioService } from "../services/media-studio.js";
import { callMediaTool } from "../services/media-tools.js";
import { getStorageService } from "../storage/index.js";

// The queue treats stop motion as a black box: the mock writes a placeholder MP4 and the test checks the surrounding behaviour.
vi.mock("@paperclipai/media-studio", async importOriginal => {
  const actual = await importOriginal<typeof import("@paperclipai/media-studio")>();
  return {
    ...actual,
    stopMotion: vi.fn(async (options: { outputPath: string; framePaths: string[]; frameDurationSeconds: number }) => {
      await writeFile(options.outputPath, Buffer.from("fake-mp4"));
      return { outputPath: options.outputPath, durationSeconds: options.framePaths.length * options.frameDurationSeconds };
    }),
  };
});

const PNG_BYTES = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");

describe("media studio v3 (stop motion, multivoice dubbing, voiceover)", () => {
  let temporary: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  let db: ReturnType<typeof createDb>;
  let storageDir: string;
  const previousEnv = { provider: process.env.PAPERCLIP_STORAGE_PROVIDER, dir: process.env.PAPERCLIP_STORAGE_LOCAL_DIR };

  beforeAll(async () => {
    temporary = await startEmbeddedPostgresTestDatabase("media-studio-v3-");
    db = createDb(temporary.connectionString);
    storageDir = await mkdtemp(join(tmpdir(), "paperclip-media-v3-storage-"));
    process.env.PAPERCLIP_STORAGE_PROVIDER = "local_disk";
    process.env.PAPERCLIP_STORAGE_LOCAL_DIR = storageDir;
  }, EMBEDDED_POSTGRES_TEST_TIMEOUT_MS);

  afterAll(async () => {
    if (previousEnv.provider === undefined) delete process.env.PAPERCLIP_STORAGE_PROVIDER; else process.env.PAPERCLIP_STORAGE_PROVIDER = previousEnv.provider;
    if (previousEnv.dir === undefined) delete process.env.PAPERCLIP_STORAGE_LOCAL_DIR; else process.env.PAPERCLIP_STORAGE_LOCAL_DIR = previousEnv.dir;
    await rm(storageDir, { recursive: true, force: true });
    await temporary?.cleanup();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function seedFrame(companyId: string, name: string) {
    const stored = await getStorageService().putFile({ companyId, namespace: "media-v3-test", originalFilename: name, contentType: "image/png", body: PNG_BYTES });
    const assetId = randomUUID();
    await db.insert(assets).values({ id: assetId, companyId, provider: stored.provider, objectKey: stored.objectKey, contentType: stored.contentType, byteSize: stored.byteSize, sha256: stored.sha256, originalFilename: stored.originalFilename });
    return assetId;
  }

  it("queues a stop motion job whose cost event carries the goal", async () => {
    const companyId = randomUUID(), goalId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "Stop motion tests", issuePrefix: "SMT" });
    await db.insert(goals).values({ id: goalId, companyId, title: "Demo personalizada" });
    const frameAssetId = await seedFrame(companyId, "frame-1.png");
    const service = mediaStudioService(db);
    const project = await service.createProject(companyId, { assetId: frameAssetId }, { userId: "media-v3-test-user" }, { goalId });
    expect(project?.goalId).toBe(goalId);

    const job = await service.enqueue(companyId, project!.id, "stop_motion", "stop-motion:goal-cost", {
      frameAssetIds: [frameAssetId], frameDurationSeconds: 0.5, cameraMotion: "none", aspect: "9:16", primary: false,
    });
    expect(job?.kind).toBe("stop_motion");

    let finished: typeof job | undefined;
    for (let attempt = 0; attempt < 300; attempt++) {
      const [current] = await db.select().from(mediaJobs).where(eq(mediaJobs.id, job!.id));
      if (current?.status === "done" || current?.status === "failed") { finished = current; break; }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    expect(finished?.status, finished?.error ?? "worker did not finish").toBe("done");
    expect(finished?.outputAssetId).toBeTruthy();
    expect(vi.mocked(stopMotion)).toHaveBeenCalledWith(expect.objectContaining({ frameDurationSeconds: 0.5, cameraMotion: "none", width: 1080, height: 1920 }));

    const [event] = await db.select().from(costEvents).where(and(eq(costEvents.companyId, companyId), eq(costEvents.idempotencyKey, `media:${job!.id}`)));
    expect(event?.goalId).toBe(goalId);
    expect(event?.usageKind).toBe("media");
    expect(event?.provider).toBe("ffmpeg");
    expect(event?.costCents).toBe(0);
  }, EMBEDDED_POSTGRES_TEST_TIMEOUT_MS);

  it("returns the same job for a repeated idempotency key and rejects a changed body", async () => {
    const companyId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "Stop motion idempotency", issuePrefix: "SMI" });
    const frameAssetId = await seedFrame(companyId, "frame-idem.png");
    const service = mediaStudioService(db);
    const project = await service.createProject(companyId, { assetId: frameAssetId }, { userId: "media-v3-test-user" }, {});
    const input = { frameAssetIds: [frameAssetId], frameDurationSeconds: 0.5, cameraMotion: "zoom", aspect: "9:16", primary: false };
    const first = await service.enqueue(companyId, project!.id, "stop_motion", "stop-motion:repeat", input);
    const second = await service.enqueue(companyId, project!.id, "stop_motion", "stop-motion:repeat", input);
    expect(second?.id).toBe(first?.id);
    await expect(service.enqueue(companyId, project!.id, "stop_motion", "stop-motion:repeat", { ...input, cameraMotion: "pan" }))
      .rejects.toThrow(/idempotency key/i);
  }, EMBEDDED_POSTGRES_TEST_TIMEOUT_MS);

  it("accepts the two new job kinds for dubbing and voiceover", async () => {
    const companyId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "Media v3 kinds", issuePrefix: "MVK" });
    const frameAssetId = await seedFrame(companyId, "frame-kinds.png");
    const service = mediaStudioService(db);
    const project = await service.createProject(companyId, { assetId: frameAssetId }, { userId: "media-v3-test-user" }, {});
    const multivoice = await service.enqueue(companyId, project!.id, "dub_multivoice", "kinds:multivoice", { language: "en", segments: [], primary: false });
    const voiceover = await service.enqueue(companyId, project!.id, "voiceover", "kinds:voiceover", { duckingDb: -12, primary: false, voiceAssetId: frameAssetId });
    expect(multivoice?.kind).toBe("dub_multivoice");
    expect(voiceover?.kind).toBe("voiceover");
  }, EMBEDDED_POSTGRES_TEST_TIMEOUT_MS);

  it("dispatches the three v3 tools to their routes with the expected bodies", async () => {
    const calls: Array<{ url: string; method: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, method: String(init.method), body: JSON.parse(String(init.body ?? "{}")) });
      return new Response(JSON.stringify({ id: randomUUID(), status: "queued" }), { status: 202, headers: { "content-type": "application/json" } });
    }));
    const projectId = randomUUID(), frameAssetId = randomUUID(), voiceAssetId = randomUUID();
    const context = { apiUrl: "http://localhost:3100", token: "test-token", companyId: randomUUID(), issueId: randomUUID(), agentId: randomUUID() };

    await callMediaTool({ ...context, name: "media_stop_motion", arguments: { projectId, idempotencyKey: "tool-stop", frameAssetIds: [frameAssetId], frameDurationSeconds: 0.5, cameraMotion: "pan" } });
    await callMediaTool({ ...context, name: "media_dub_multivoice", arguments: { projectId, idempotencyKey: "tool-multi", language: "en", segments: [{ start: 0, end: 1, text: "Hi", speaker: "host", voiceId: "voice_host" }] } });
    await callMediaTool({ ...context, name: "media_voiceover", arguments: { projectId, idempotencyKey: "tool-vo", voiceAssetId, duckingDb: -10 } });

    expect(calls.map(call => [call.method, call.url])).toEqual([
      ["POST", `http://localhost:3100/api/media-projects/${projectId}/stop-motion`],
      ["POST", `http://localhost:3100/api/media-projects/${projectId}/dub-multivoice`],
      ["POST", `http://localhost:3100/api/media-projects/${projectId}/voiceover`],
    ]);
    expect(calls[0]!.body).toMatchObject({ idempotencyKey: "tool-stop", frameAssetIds: [frameAssetId], cameraMotion: "pan", frameDurationSeconds: 0.5 });
    expect(calls[1]!.body).toMatchObject({ idempotencyKey: "tool-multi", language: "en" });
    expect(calls[2]!.body).toMatchObject({ idempotencyKey: "tool-vo", voiceAssetId, duckingDb: -10 });
  });

  it("rejects invalid v3 tool arguments before any request is sent", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const context = { apiUrl: "http://localhost:3100", token: "test-token", companyId: randomUUID(), issueId: randomUUID(), agentId: randomUUID() };
    const projectId = randomUUID();
    // A voiceover needs exactly one voice source, and a script needs a voiceId.
    await expect(callMediaTool({ ...context, name: "media_voiceover", arguments: { projectId, idempotencyKey: "bad-vo", script: "Hola", voiceAssetId: randomUUID(), voiceId: "voice_es" } })).rejects.toThrow();
    await expect(callMediaTool({ ...context, name: "media_voiceover", arguments: { projectId, idempotencyKey: "bad-vo-2", script: "Hola" } })).rejects.toThrow();
    // Stop motion frames must be UUIDs and the camera motion must be from the enum.
    await expect(callMediaTool({ ...context, name: "media_stop_motion", arguments: { projectId, idempotencyKey: "bad-sm", frameAssetIds: ["not-a-uuid"], frameDurationSeconds: 0.5, cameraMotion: "pan" } })).rejects.toThrow();
    await expect(callMediaTool({ ...context, name: "media_stop_motion", arguments: { projectId, idempotencyKey: "bad-sm-2", frameAssetIds: [randomUUID()], frameDurationSeconds: 0.5, cameraMotion: "tilt" } })).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
