import { and, eq, inArray, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Db } from "@paperclipai/db";
import { companySkills, connectionGrants, productizationOnboarding, toolConnections } from "@paperclipai/db";
import type { BuilderDraft, BuilderDraftVersion, BuilderSelection } from "@paperclipai/shared/productization/description-builder";
import { onboardingJourneySchema } from "@paperclipai/shared/productization/onboarding-api";
import { conflict, notFound, unprocessable } from "../../errors.js";
import { persistActivity, publishActivity, type LogActivityInput } from "../activity-log.js";

type Actor = Pick<LogActivityInput, "actorType" | "actorId" | "agentId">;
type DraftInput = { expectedRevision: number; draftId?: string; description: string; selection: BuilderSelection };

export function productizationDescriptionBuilderService(db: Db) {
  async function read(companyId: string) {
    const [row] = await db.select().from(productizationOnboarding).where(eq(productizationOnboarding.companyId, companyId)).limit(1);
    if (!row) throw notFound("Start the business onboarding before saving a builder draft.", { code: "onboarding_journey_not_found" });
    const parsed = onboardingJourneySchema.safeParse(row.journey);
    if (!parsed.success || parsed.data.companyId !== companyId) throw unprocessable("Stored onboarding journey is invalid.", { code: "invalid_onboarding_state" });
    return { journey: parsed.data, revision: row.revision };
  }

  async function save(companyId: string, expectedRevision: number, journey: ReturnType<typeof onboardingJourneySchema.parse>, actor: Actor, action: string, publications?: import("../activity-log.js").ActivityPublication[]) {
    const updatedAt = new Date();
    const committed = await db.transaction(async (tx) => {
      const [row] = await tx.update(productizationOnboarding)
        .set({ journey, revision: expectedRevision + 1, updatedAt })
        .where(and(eq(productizationOnboarding.companyId, companyId), eq(productizationOnboarding.revision, expectedRevision)))
        .returning({ revision: productizationOnboarding.revision });
      if (!row) {
        const [latest] = await tx.select({ revision: productizationOnboarding.revision })
          .from(productizationOnboarding).where(eq(productizationOnboarding.companyId, companyId)).limit(1);
        throw conflict("Onboarding changed. Reload before saving this draft.", { code: "onboarding_revision_conflict", currentRevision: latest?.revision ?? 0 });
      }
      const { publication } = await persistActivity(tx as unknown as Db, {
        companyId, actorType: actor.actorType, actorId: actor.actorId, agentId: actor.agentId ?? null,
        action, entityType: "productization_onboarding", entityId: journey.id, details: { revision: row.revision },
      });
      return { revision: row.revision, publication };
    });
    if (publications) publications.push(committed.publication);
    else publishActivity(committed.publication);
    return committed.revision;
  }

  async function validateSelection(companyId: string, selection: BuilderSelection) {
    if (selection.skillIds.length) {
      const rows = await db.select({ id: companySkills.id, compatibility: companySkills.compatibility }).from(companySkills)
        .where(and(eq(companySkills.companyId, companyId), inArray(companySkills.id, selection.skillIds)));
      if (rows.length !== selection.skillIds.length || rows.some((skill) => skill.compatibility === "invalid")) throw unprocessable("Choose compatible skills that are already available to this company.", { code: "builder_skill_not_available" });
    }
    if (selection.connectionIds.length) {
      const rows = await db.select({ id: toolConnections.id }).from(toolConnections)
        .where(and(eq(toolConnections.companyId, companyId), inArray(toolConnections.id, selection.connectionIds), eq(toolConnections.status, "active"), eq(toolConnections.enabled, true)));
      if (rows.length !== selection.connectionIds.length) throw unprocessable("Choose active connections from this company.", { code: "builder_connection_not_available" });
    }
  }

  async function latestVersion(companyId: string, draftId: string, version?: number) {
    const { journey, revision } = await read(companyId);
    const draft = (journey.builderDrafts ?? []).find((item) => item.id === draftId);
    if (!draft) throw notFound("Builder draft not found.", { code: "builder_draft_not_found" });
    const selected = version === undefined ? draft.versions.at(-1) : draft.versions.find((item) => item.version === version);
    if (!selected) throw notFound("Builder draft version not found.", { code: "builder_version_not_found" });
    return { journey, revision, draft, selected };
  }

  return {
    /** Shared persistence helpers for the configuration copilot, which reuses the same journey revision CAS and activity trail. */
    internals: { read, save, validateSelection, latestVersion },

    saveDraft: async (companyId: string, input: DraftInput, actor: Actor) => {
      const { journey, revision } = await read(companyId);
      if (revision !== input.expectedRevision) throw conflict("Onboarding changed. Reload before saving this draft.", { code: "onboarding_revision_conflict", currentRevision: revision });
      await validateSelection(companyId, input.selection);
      const now = new Date().toISOString();
      const version: BuilderDraftVersion = { version: 1, createdAt: now, description: input.description.trim(), selection: input.selection, provenance: "human_supplied" };
      const drafts = journey.builderDrafts ?? [];
      let nextDrafts: BuilderDraft[];
      let draftId: string;
      if (input.draftId) {
        const index = drafts.findIndex((item) => item.id === input.draftId);
        if (index < 0) throw notFound("Builder draft not found.", { code: "builder_draft_not_found" });
        const prior = drafts[index]!;
        if (prior.versions.length >= 10) throw conflict("This draft reached its 10-version limit. Clone it to continue.", { code: "builder_version_limit" });
        draftId = prior.id;
        const updated: BuilderDraft = { ...prior, versions: [...prior.versions, { ...version, version: prior.versions.length + 1 }] };
        nextDrafts = drafts.map((item, i) => i === index ? updated : item);
      } else {
        if (drafts.length >= 20) throw conflict("This company reached its 20 saved draft limit.", { code: "builder_draft_limit" });
        draftId = randomUUID();
        nextDrafts = [...drafts, { id: draftId, createdAt: now, versions: [version] }];
      }
      const next = onboardingJourneySchema.parse({ ...journey, builderDrafts: nextDrafts });
      const nextRevision = await save(companyId, revision, next, actor, input.draftId ? "productization.builder.version_saved" : "productization.builder.draft_created");
      return { journey: next, revision: nextRevision, draftId, version: nextDrafts.find((item) => item.id === draftId)!.versions.length, serverNow: now, generation: { status: "not_configured", provider: null as string | null } };
    },

    clone: async (companyId: string, draftId: string, sourceVersion: number, expectedRevision: number, actor: Actor) => {
      const { journey, revision } = await read(companyId);
      if (revision !== expectedRevision) throw conflict("Onboarding changed. Reload before cloning this draft.", { code: "onboarding_revision_conflict", currentRevision: revision });
      const source = (journey.builderDrafts ?? []).find((item) => item.id === draftId)?.versions.find((item) => item.version === sourceVersion);
      if (!source) throw notFound("Builder draft version not found.", { code: "builder_version_not_found" });
      if ((journey.builderDrafts ?? []).length >= 20) throw conflict("This company reached its 20 saved draft limit.", { code: "builder_draft_limit" });
      await validateSelection(companyId, source.selection);
      const now = new Date().toISOString();
      // A clone is a human action: it keeps lineage and the proposed plan, but not the source's exact model response or idempotency key.
      const { proposal: _proposal, ...sourceValues } = source;
      const newDraft: BuilderDraft = { id: randomUUID(), createdAt: now, versions: [{ ...sourceValues, version: 1, createdAt: now, provenance: "human_supplied", clonedFrom: { draftId, version: sourceVersion } }] };
      const next = onboardingJourneySchema.parse({ ...journey, builderDrafts: [...(journey.builderDrafts ?? []), newDraft] });
      const nextRevision = await save(companyId, revision, next, actor, "productization.builder.draft_cloned");
      return { journey: next, revision: nextRevision, draftId: newDraft.id, version: 1, serverNow: now, generation: { status: "not_configured", provider: null as string | null } };
    },

    compare: async (companyId: string, leftDraftId: string, leftVersion: number, rightDraftId: string, rightVersion: number) => {
      const [left, right] = await Promise.all([latestVersion(companyId, leftDraftId, leftVersion), latestVersion(companyId, rightDraftId, rightVersion)]);
      const leftValues = left.selected;
      const rightValues = right.selected;
      return { left: { draftId: left.draft.id, ...leftValues }, right: { draftId: right.draft.id, ...rightValues }, changes: {
        description: leftValues.description !== rightValues.description,
        role: leftValues.selection.role !== rightValues.selection.role,
        skills: JSON.stringify(leftValues.selection.skillIds) !== JSON.stringify(rightValues.selection.skillIds),
        connections: JSON.stringify(leftValues.selection.connectionIds) !== JSON.stringify(rightValues.selection.connectionIds),
        autonomy: leftValues.selection.autonomy !== rightValues.selection.autonomy,
        monthlyBudgetUsd: leftValues.selection.monthlyBudgetUsd !== rightValues.selection.monthlyBudgetUsd,
        plan: JSON.stringify(leftValues.plan ?? null) !== JSON.stringify(rightValues.plan ?? null),
        provenance: leftValues.provenance !== rightValues.provenance,
      } };
    },

    configurationPreview: async (companyId: string, draftId: string, version: number, expectedRevision: number, userId: string | null) => {
      const { revision, selected } = await latestVersion(companyId, draftId, version);
      if (revision !== expectedRevision) throw conflict("Onboarding changed. Reload before previewing this draft.", { code: "onboarding_revision_conflict", currentRevision: revision });
      await validateSelection(companyId, selected.selection);
      const health = selected.selection.connectionIds.length ? await db.select({ connectionId: connectionGrants.connectionId })
        .from(connectionGrants).where(and(eq(connectionGrants.companyId, companyId), eq(connectionGrants.status, "active"), inArray(connectionGrants.connectionId, selected.selection.connectionIds), userId
          ? or(eq(connectionGrants.kind, "organization"), and(eq(connectionGrants.kind, "user"), eq(connectionGrants.subjectUserId, userId)))
          : eq(connectionGrants.kind, "organization"))) : [];
      const authorizedIds = new Set(health.map((item) => item.connectionId));
      return {
        mode: "configuration_preview" as const,
        executed: false as const,
        createdAgent: false as const,
        changedPermissions: false as const,
        startedExecution: false as const,
        draftId, version,
        checks: {
          descriptionPresent: selected.description.trim().length > 0,
          roleSelected: Boolean(selected.selection.role.trim()),
          selectedSkills: selected.selection.skillIds.length,
          selectedConnections: selected.selection.connectionIds.length,
          authorizedConnections: selected.selection.connectionIds.filter((id) => authorizedIds.has(id)).length,
          connectionsNeedAuthorization: selected.selection.connectionIds.filter((id) => !authorizedIds.has(id)),
          requestedMonthlyBudgetUsd: selected.selection.monthlyBudgetUsd,
          budgetApplied: false as const,
          autonomyApplied: false as const,
        },
        nextAction: "human_review_and_existing_hire_flow",
        serverNow: new Date().toISOString(),
      };
    },
  };
}
