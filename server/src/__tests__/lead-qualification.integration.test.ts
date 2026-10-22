import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { agents, companies, costEvents, createDb, leadQualifications } from "@paperclipai/db";
import type { QualificationCriteria } from "@paperclipai/shared";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import { enrichmentService } from "../services/enrichment.js";
import { leadQualificationService } from "../services/lead-qualification.js";

const pgSupport = await getEmbeddedPostgresTestSupport();
const describePg = pgSupport.supported ? describe : describe.skip;

const criteria: QualificationCriteria = {
  version: "2026-10",
  threshold: 60,
  criteria: [
    { key: "budget", label: "Presupuesto", weight: 50 },
    { key: "need", label: "Necesidad", weight: 30 },
    { key: "timing", label: "Plazo", weight: 20 },
  ],
};

describePg("lead qualification and enrichment (embedded Postgres)", () => {
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let db: ReturnType<typeof createDb>;
  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-lead-qualification-");
    db = createDb(tempDb.connectionString);
  }, 90_000);
  afterAll(async () => { await tempDb?.cleanup(); });

  async function company(name: string) {
    return (await db.insert(companies).values({ name, issuePrefix: `LQ${randomUUID().slice(0, 6).toUpperCase()}` }).returning())[0]!;
  }
  async function agent(companyId: string, name: string) {
    return (await db.insert(agents).values({ companyId, name, role: "general", status: "idle", adapterType: "codex_local", adapterConfig: {} }).returning())[0]!;
  }

  it("returns an actionable 422 when the criteria document is absent", async () => {
    const c = await company("No criteria");
    const service = leadQualificationService(db);
    await expect(service.qualify(c.id, { leadId: randomUUID(), assessments: [{ criterion: "budget", met: true, note: null }], sources: [] }, {}))
      .rejects.toMatchObject({ status: 422, message: expect.stringContaining("qualification-criteria") });
    expect(await service.criteria(c.id)).toBeNull();
  });

  it("scores against the criteria weights, stores the row and reports qualified against the threshold", async () => {
    const c = await company("Scoring");
    const a = await agent(c.id, "Qualifier");
    const leadId = randomUUID();
    const service = leadQualificationService(db, { loadCriteria: async () => criteria });
    const result = await service.qualify(c.id, {
      leadId,
      assessments: [
        { criterion: "budget", met: true, note: "Approved budget" },
        { criterion: "need", met: true, note: null },
        { criterion: "timing", met: false, note: "Decision in 2027" },
      ],
      sources: [{ kind: "conversation", ref: "msg-1" }],
    }, { agentId: a.id, runId: null, userId: null });

    expect(result.score).toBe(80);
    expect(result.qualified).toBe(true);
    expect(result.threshold).toBe(60);
    expect(result.criteriaVersion).toBe("2026-10");
    const stored = await db.select().from(leadQualifications).where(eq(leadQualifications.leadId, leadId));
    expect(stored).toHaveLength(1);
    expect(stored[0]!.score).toBe(80);
    expect(stored[0]!.reasons.map((reason) => reason.criterion)).toEqual(["budget", "need", "timing"]);
  });

  it("counts missing criteria as not met with the note sin evaluar and rejects unknown criteria", async () => {
    const c = await company("Missing");
    const service = leadQualificationService(db, { loadCriteria: async () => criteria });
    const result = await service.qualify(c.id, {
      leadId: randomUUID(),
      assessments: [{ criterion: "budget", met: true, note: null }],
      sources: [],
    }, {});
    expect(result.score).toBe(50);
    expect(result.qualified).toBe(false);
    expect(result.reasons.find((reason) => reason.criterion === "timing")).toMatchObject({ met: false, note: "sin evaluar" });

    await expect(service.qualify(c.id, {
      leadId: randomUUID(),
      assessments: [{ criterion: "vibes", met: true, note: null }],
      sources: [],
    }, {})).rejects.toMatchObject({ status: 422, message: expect.stringContaining("vibes") });
  });

  it("does not return another company's qualification from latest()", async () => {
    const owner = await company("Owner");
    const other = await company("Other");
    const leadId = randomUUID();
    const service = leadQualificationService(db, { loadCriteria: async () => criteria });
    await service.qualify(owner.id, { leadId, assessments: [{ criterion: "budget", met: true, note: null }], sources: [] }, {});
    expect(await service.latest(other.id, leadId)).toBeNull();
    expect(await service.history(other.id, leadId)).toHaveLength(0);
    expect((await service.latest(owner.id, leadId))?.score).toBe(50);
  });

  it("records an enrichment cost with usage_kind enrichment from an injected provider", async () => {
    const c = await company("Enrichment");
    const a = await agent(c.id, "Researcher");
    const service = enrichmentService(db, {
      providers: [{
        id: "exa",
        search: async () => ({
          results: [{ url: "https://www.acme.com/about", title: "Acme | Software platform", snippet: "Acme raised funding and has 50-200 employees" }],
          costCents: 3,
        }),
      }],
    });
    const result = await service.enrich(c.id, { query: "buyer@acme.com" }, { agentId: a.id });
    expect(result).toMatchObject({ domain: "acme.com", company: "Acme", sector: "software", size: "50-200", costCents: 3 });
    expect(result.signals).toContain("funding");
    expect(result.sources).toEqual([{ provider: "exa", url: "https://www.acme.com/about", title: "Acme | Software platform" }]);

    const costs = await db.select().from(costEvents).where(eq(costEvents.companyId, c.id));
    expect(costs).toHaveLength(1);
    expect(costs[0]).toMatchObject({ usageKind: "enrichment", provider: "exa", model: "search", agentId: a.id });
  }, 60_000);

  it("refuses enrichment without a configured provider", async () => {
    const c = await company("No provider");
    const a = await agent(c.id, "Researcher");
    await expect(enrichmentService(db).enrich(c.id, { query: "acme.com" }, { agentId: a.id }))
      .rejects.toMatchObject({ status: 422, message: "No enrichment connection configured (Exa, Firecrawl or Tavily)" });
  });
});
