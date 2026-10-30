import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { activityLog, agents, companies, createDb, principalPermissionGrants } from "@paperclipai/db";
import { defaultAgentWorkPermissions, type AgentCapabilities } from "@paperclipai/shared";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "../__tests__/helpers/embedded-postgres.js";
import { NEW_STANDARD_AGENT_DEFAULT_GRANT_KEYS, standardAgentGrantKeysFor } from "../lib/agent-permissions.js";
import {
  agentCapabilitiesService,
  capabilityMetadataForCreate,
  codeFromMetadata,
  profileFromMetadata,
} from "./agent-capabilities.js";

const support = await getEmbeddedPostgresTestSupport();
const describeDatabase = support.supported ? describe : describe.skip;

const ALL_ON: AgentCapabilities = { messages: true, calls: true, video: true, mediaAnalyze: true, mediaEdit: true, mediaCreateVideo: true, code: true };
const ACTOR = { actorType: "user" as const, actorId: "board-user", userId: "board-user" };

describe("agent capability metadata helpers", () => {
  it("stores the profile with the code flag from the capabilities and keeps other metadata keys", () => {
    const metadata = capabilityMetadataForCreate(
      { existing: "kept" },
      { messages: true, calls: false, video: false, mediaAnalyze: false, mediaEdit: false, mediaCreateVideo: false, code: false },
      { specialty: "customer_care", sectors: ["retail"] },
    );
    expect(metadata).toEqual({
      existing: "kept",
      profile: { specialty: "customer_care", sectors: ["retail"], code: false, workPermissions: defaultAgentWorkPermissions("customer_care") },
      requestedCapabilities: { messages: true, calls: false, video: false, mediaAnalyze: false, mediaEdit: false, mediaCreateVideo: false },
    });
  });

  it("does not activate permissions outside an explicit specialty, including pending hires", () => {
    const metadata = capabilityMetadataForCreate(null, ALL_ON, { specialty: "software", sectors: [] });
    expect(codeFromMetadata(metadata)).toBe(true);
    const grants = standardAgentGrantKeysFor(metadata);
    expect(grants).not.toContain("channels:message");
    expect(grants).not.toContain("channels:call");
    expect(grants.filter((key) => key.startsWith("media:"))).toEqual([]);
  });

  it("uses specialty defaults when creation supplies a profile without switches", () => {
    const grants = standardAgentGrantKeysFor(capabilityMetadataForCreate(null, undefined, { specialty: "operations", sectors: [] }));
    expect(grants).not.toContain("channels:message");
    expect(grants).not.toContain("channels:call");
    expect(grants.filter((key) => key.startsWith("media:"))).toEqual([]);
  });

  it("returns the metadata unchanged when neither capabilities nor profile were given", () => {
    const original = { a: 1 };
    expect(capabilityMetadataForCreate(original, undefined, undefined)).toBe(original);
    expect(capabilityMetadataForCreate(null, undefined, undefined)).toBeNull();
  });

  it("defaults the specialty to custom when only capabilities are given", () => {
    const metadata = capabilityMetadataForCreate(null, ALL_ON, undefined);
    expect(profileFromMetadata(metadata)).toEqual({ specialty: "custom", sectors: [] });
    expect(codeFromMetadata(metadata)).toBe(true);
  });

  it("activation grants keep only the requested capabilities, and every default without a snapshot", () => {
    const withSnapshot = standardAgentGrantKeysFor({
      requestedCapabilities: { messages: true, calls: false, video: true },
    });
    expect(withSnapshot).toContain("channels:message");
    expect(withSnapshot).toEqual(expect.arrayContaining(["media:analyze", "media:edit", "media:create_video"]));
    expect(withSnapshot).not.toContain("media:generate");
    expect(withSnapshot).not.toContain("channels:call");
    expect(withSnapshot).toContain("agents:configure");

    const legacy = standardAgentGrantKeysFor({});
    expect(legacy).toEqual(expect.arrayContaining(["channels:message", "channels:call", "media:generate"]));
    expect(legacy).toHaveLength(NEW_STANDARD_AGENT_DEFAULT_GRANT_KEYS.length);
  });

  it("reads code as enabled when no flag is stored, and rejects an unknown specialty", () => {
    expect(codeFromMetadata({})).toBe(true);
    expect(codeFromMetadata({ profile: { code: false } })).toBe(false);
    expect(profileFromMetadata({ profile: { specialty: "astronaut", sectors: [] } })).toBeNull();
  });
});

describeDatabase("agent capabilities service", () => {
  let db!: ReturnType<typeof createDb>;
  let cleanup: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const started = await startEmbeddedPostgresTestDatabase("agent-capabilities-service");
    db = createDb(started.connectionString);
    cleanup = started.cleanup;
  }, 20_000);

  afterAll(async () => {
    await cleanup?.();
  });

  async function seedCompanyAndAgent(metadata: Record<string, unknown> | null = null) {
    const companyId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name: "Capabilities",
      issuePrefix: `CP${companyId.slice(0, 6).toUpperCase()}`,
    });
    const [agent] = await db
      .insert(agents)
      .values({ companyId, name: "Agent", metadata })
      .returning();
    return { companyId, agentId: agent!.id };
  }

  async function grantKeys(companyId: string, agentId: string) {
    const rows = await db
      .select({ permissionKey: principalPermissionGrants.permissionKey })
      .from(principalPermissionGrants)
      .where(and(
        eq(principalPermissionGrants.companyId, companyId),
        eq(principalPermissionGrants.principalType, "agent"),
        eq(principalPermissionGrants.principalId, agentId),
      ));
    return rows.map((row) => row.permissionKey).sort();
  }

  it("get reports no capabilities and a null profile for an agent without grants", async () => {
    const { companyId, agentId } = await seedCompanyAndAgent();
    const service = agentCapabilitiesService(db);
    const view = await service.get(companyId, agentId);

    expect(view.capabilities).toEqual({ messages: false, calls: false, video: false, mediaAnalyze: false, mediaEdit: false, mediaCreateVideo: false, code: true });
    expect(view.profile).toBeNull();
    expect(view.autonomy).toEqual({ message: "draft_only", email: "draft_only", call: "draft_only" });
  });

  it("apply grants exactly the enabled capabilities, then revokes the ones switched off", async () => {
    const { companyId, agentId } = await seedCompanyAndAgent();
    const service = agentCapabilitiesService(db);

    await service.apply(companyId, agentId, { messages: true, calls: false, video: true, mediaAnalyze: true, mediaEdit: true, mediaCreateVideo: true, code: false }, undefined, ACTOR);
    expect(await grantKeys(companyId, agentId)).toEqual(["channels:message", "media:analyze", "media:create_video", "media:edit"]);

    const after = await service.apply(companyId, agentId, { messages: false, calls: true, video: true, mediaAnalyze: true, mediaEdit: true, mediaCreateVideo: true, code: false }, undefined, ACTOR);
    expect(await grantKeys(companyId, agentId)).toEqual(["channels:call", "media:analyze", "media:create_video", "media:edit"]);
    expect(after.capabilities).toEqual({ messages: false, calls: true, video: true, mediaAnalyze: true, mediaEdit: true, mediaCreateVideo: true, code: false });
  });

  it("preserves legacy grants on read and removes incompatible grants only on save", async () => {
    const { companyId, agentId } = await seedCompanyAndAgent();
    const service = agentCapabilitiesService(db);
    await service.apply(companyId, agentId, ALL_ON, { specialty: "custom", sectors: [] }, ACTOR);
    await db.update(agents).set({ metadata: { profile: { specialty: "software", sectors: [], code: true } } }).where(eq(agents.id, agentId));
    expect((await service.get(companyId, agentId)).capabilities.messages).toBe(true);
    await service.apply(companyId, agentId, ALL_ON, { specialty: "software", sectors: [] }, ACTOR);
    expect(await grantKeys(companyId, agentId)).toEqual([]);
    expect((await service.get(companyId, agentId)).capabilities).toMatchObject({ code: true, messages: false, calls: false, video: false });
  });

  it("persists the profile and the code flag in metadata while keeping other keys", async () => {
    const { companyId, agentId } = await seedCompanyAndAgent({ keep: "me" });
    const service = agentCapabilitiesService(db);

    const view = await service.apply(
      companyId,
      agentId,
      { messages: false, calls: false, video: false, mediaAnalyze: false, mediaEdit: false, mediaCreateVideo: false, code: true },
      { specialty: "software", sectors: ["fintech", "health"] },
      ACTOR,
    );
    expect(view.profile).toEqual({ specialty: "software", sectors: ["fintech", "health"], workPermissions: defaultAgentWorkPermissions("software") });

    const [row] = await db.select().from(agents).where(eq(agents.id, agentId));
    expect(row!.metadata).toMatchObject({
      keep: "me",
      profile: { specialty: "software", sectors: ["fintech", "health"], code: true },
    });
    expect(await service.get(companyId, agentId)).toMatchObject({
      profile: { specialty: "software", sectors: ["fintech", "health"] },
      capabilities: { messages: false, calls: false, video: false, mediaAnalyze: false, mediaEdit: false, mediaCreateVideo: false, code: true },
    });
  });

  it("writes an agent.capabilities_updated activity with before and after", async () => {
    const { companyId, agentId } = await seedCompanyAndAgent();
    const service = agentCapabilitiesService(db);
    await service.apply(companyId, agentId, { messages: true, calls: false, video: false, mediaAnalyze: false, mediaEdit: false, mediaCreateVideo: false, code: false }, undefined, ACTOR);

    const rows = await db
      .select()
      .from(activityLog)
      .where(and(eq(activityLog.companyId, companyId), eq(activityLog.entityId, agentId), eq(activityLog.action, "agent.capabilities_updated")));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.details).toMatchObject({
      before: { capabilities: { messages: false, calls: false, video: false, mediaAnalyze: false, mediaEdit: false, mediaCreateVideo: false, code: true } },
      after: { capabilities: { messages: true, calls: false, video: false, mediaAnalyze: false, mediaEdit: false, mediaCreateVideo: false, code: false } },
      grantsAdded: ["channels:message"],
      grantsRemoved: [],
    });
  });

  it("does not expose agents of another company", async () => {
    const { agentId } = await seedCompanyAndAgent();
    const other = await seedCompanyAndAgent();
    await expect(agentCapabilitiesService(db).get(other.companyId, agentId)).rejects.toMatchObject({ status: 404 });
  });
});
