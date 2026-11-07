import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { agents, companies, createDb } from "@paperclipai/db";
import { appearanceForLpc, appearanceForPalette, randomLpcCharacter } from "@paperclipai/shared";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import { errorHandler } from "../middleware/index.js";
import { agentRoutes } from "../routes/agents.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping agent appearance route tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

type Db = ReturnType<typeof createDb>;

function createApp(db: Db, actor: Express.Request["actor"]) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.actor = actor;
    next();
  });
  app.use("/api", agentRoutes(db));
  app.use(errorHandler);
  return app;
}

describeEmbeddedPostgres("agent appearance routes (lpc-v1 save flow)", () => {
  let db!: Db;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-agent-appearance-routes-");
    db = createDb(tempDb.connectionString);
  }, 120_000);

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  it("saves an lpc-v1 appearance, persists it, rejects invalid input, and switches back to cap-v1", async () => {
    const nonce = randomUUID().slice(0, 8);
    const [company] = await db
      .insert(companies)
      .values({ name: `Appearance Co ${nonce}`, issuePrefix: `AP${nonce.slice(0, 4).toUpperCase()}` })
      .returning();
    const [agent] = await db
      .insert(agents)
      .values({
        companyId: company!.id,
        name: "Pixel Agent",
        role: "general",
        status: "active",
        adapterType: "process",
        adapterConfig: {},
        runtimeConfig: {},
        appearance: appearanceForPalette("deep-tide"),
      })
      .returning();

    const app = createApp(db, {
      type: "board",
      userId: "board-user",
      source: "local_implicit",
      companyIds: [company!.id],
      isInstanceAdmin: true,
    } as Express.Request["actor"]);
    const agentPath = `/api/agents/${agent!.id}`;

    // 1. Save an lpc-v1 appearance.
    const lpcAppearance = appearanceForLpc(randomLpcCharacter(), "deep-tide");
    const saved = await request(app).patch(agentPath).send({ appearance: lpcAppearance });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body.appearance.characterVersion).toBe("lpc-v1");
    expect(saved.body.avatarUrl).toContain("/api/agent-avatars/lpc-v1/");

    // 2. The persisted appearance round-trips exactly.
    const fetched = await request(app).get(agentPath);
    expect(fetched.status, JSON.stringify(fetched.body)).toBe(200);
    expect(fetched.body.appearance).toEqual(lpcAppearance);

    // 3. An invalid lpc body is rejected with a 4xx.
    const invalid = await request(app).patch(agentPath).send({
      appearance: { schemaVersion: 1, characterVersion: "lpc-v1", paletteId: "deep-tide", lpc: { bodyType: "robot" } },
    });
    expect(invalid.status, JSON.stringify(invalid.body)).toBeGreaterThanOrEqual(400);
    expect(invalid.status, JSON.stringify(invalid.body)).toBeLessThan(500);

    // 4. Switching back to cap-v1 succeeds.
    const back = await request(app).patch(agentPath).send({ appearance: appearanceForPalette("deep-tide") });
    expect(back.status, JSON.stringify(back.body)).toBe(200);
    expect(back.body.appearance.characterVersion).toBe("cap-v1");
  }, 120_000);
});
