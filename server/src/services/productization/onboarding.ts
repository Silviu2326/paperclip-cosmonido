import { and, asc, eq, gte, inArray, isNotNull, isNull, ne, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Db } from "@paperclipai/db";
import { agents, companies, deliverableReviews, goals, issues, productizationOnboarding } from "@paperclipai/db";
import {
  applyOnboardingEvent,
  ONBOARDING_JOURNEY_VERSION,
  type OnboardingEvent,
  type OnboardingJourney,
  type OnboardingPath,
} from "@paperclipai/shared/productization/onboarding-journey";
import { onboardingJourneySchema, type OnboardingSnapshot, type OnboardingUserEvent } from "@paperclipai/shared/productization/onboarding-api";
import { conflict, notFound, unprocessable } from "../../errors.js";
import { persistActivity, publishActivity, type LogActivityInput } from "../activity-log.js";

const STARTED_ISSUE_STATUSES = ["in_progress", "in_review", "done"] as const;
const USABLE_AGENT_STATUSES = ["active", "idle"] as const;
const CANDIDATE_LIMIT = 100;

type OnboardingActor = Pick<LogActivityInput, "actorType" | "actorId" | "agentId">;

function serverEvidence(reference: string, at = new Date()): { at: string; reference: string } {
  return { at: at.toISOString(), reference };
}

export function productizationOnboardingService(db: Db) {
  async function readStored(companyId: string) {
    const [row] = await db.select().from(productizationOnboarding).where(eq(productizationOnboarding.companyId, companyId)).limit(1);
    if (!row) throw notFound("Onboarding journey not found", { code: "onboarding_journey_not_found" });
    const parsed = onboardingJourneySchema.safeParse(row.journey);
    if (!parsed.success || parsed.data.companyId !== companyId) throw unprocessable("Stored onboarding journey is invalid.", { code: "invalid_onboarding_state" });
    return { journey: parsed.data, revision: row.revision };
  }

  async function projectAcceptedDeliverable(journey: OnboardingJourney): Promise<OnboardingJourney> {
    if (!journey.firstJob || !journey.firstJobGoalId || !journey.firstJobIssueId || journey.firstAcceptedDeliverable) return journey;
    const firstStartedAt = new Date(journey.firstJob.at);
    const [review] = await db.select({ id: deliverableReviews.id, reviewedAt: deliverableReviews.reviewedAt })
      .from(deliverableReviews)
      .where(and(
        eq(deliverableReviews.companyId, journey.companyId),
        eq(deliverableReviews.goalId, journey.firstJobGoalId),
        or(isNull(deliverableReviews.issueId), eq(deliverableReviews.issueId, journey.firstJobIssueId)),
        eq(deliverableReviews.state, "accepted"),
        isNotNull(deliverableReviews.reviewedAt),
        gte(deliverableReviews.reviewedAt, firstStartedAt),
      ))
      .orderBy(asc(deliverableReviews.reviewedAt))
      .limit(1);
    if (!review?.reviewedAt) return journey;
    return { ...journey, firstAcceptedDeliverable: serverEvidence(`deliverable-review:${review.id}`, review.reviewedAt) };
  }

  async function snapshotFor(journey: OnboardingJourney, revision: number): Promise<OnboardingSnapshot> {
    const journeyWithOutcome = await projectAcceptedDeliverable(journey);
    const agentRows = await db.select({ id: agents.id, name: agents.name, title: agents.title })
      .from(agents)
      .where(and(eq(agents.companyId, journey.companyId), eq(agents.lifecycleState, "ready"), inArray(agents.status, [...USABLE_AGENT_STATUSES])))
      .orderBy(asc(agents.name)).limit(CANDIDATE_LIMIT + 1);
    const availableAgents = agentRows.slice(0, CANDIDATE_LIMIT);
    const availableAgentsTruncated = agentRows.length > CANDIDATE_LIMIT;
    const activatedAt = journey.team?.activated?.at;
    const teamIds = journey.team?.agentIds ?? [];
    const goalRows = !activatedAt || !teamIds.length ? [] : await db.select({ id: goals.id, title: goals.title, issueId: issues.id, startedAt: issues.startedAt })
      .from(goals)
      .innerJoin(issues, and(eq(issues.id, goals.rootIssueId), eq(issues.companyId, goals.companyId)))
      .where(and(
        eq(goals.companyId, journey.companyId),
        eq(goals.kind, "assignment"),
        ne(goals.status, "cancelled"),
        gte(goals.createdAt, new Date(activatedAt)),
        isNotNull(goals.rootIssueId),
        isNotNull(issues.startedAt),
        gte(issues.startedAt, new Date(activatedAt)),
        inArray(issues.status, [...STARTED_ISSUE_STATUSES]),
        inArray(issues.assigneeAgentId, teamIds),
      ))
      .orderBy(asc(issues.startedAt)).limit(CANDIDATE_LIMIT + 1);
    const eligibleGoals = goalRows.slice(0, CANDIDATE_LIMIT);
    return { journey: journeyWithOutcome, revision, serverNow: new Date().toISOString(), availableAgents, availableAgentsTruncated, eligibleGoalsTruncated: goalRows.length > CANDIDATE_LIMIT, eligibleGoals: eligibleGoals.flatMap((goal) =>
      goal.startedAt ? [{ id: goal.id, title: goal.title, issueId: goal.issueId, startedAt: goal.startedAt.toISOString() }] : [],
    ) };
  }

  async function checkCompany(companyId: string) {
    const [company] = await db.select({ id: companies.id }).from(companies).where(eq(companies.id, companyId)).limit(1);
    if (!company) throw notFound("Company not found");
  }

  async function writeRevision(companyId: string, expectedRevision: number, journey: OnboardingJourney, actor: OnboardingActor, action: string) {
    const updatedAt = new Date();
    const committed = await db.transaction(async (tx) => {
      const txDb = tx as unknown as Db;
      let updated;
      if (expectedRevision === 0) {
        const [inserted] = await tx.insert(productizationOnboarding).values({ companyId, revision: 1, journey, createdAt: updatedAt, updatedAt })
          .onConflictDoNothing({ target: productizationOnboarding.companyId }).returning({ revision: productizationOnboarding.revision });
        updated = inserted;
      } else {
        const [changed] = await tx.update(productizationOnboarding).set({ journey, revision: expectedRevision + 1, updatedAt })
          .where(and(eq(productizationOnboarding.companyId, companyId), eq(productizationOnboarding.revision, expectedRevision)))
          .returning({ revision: productizationOnboarding.revision });
        updated = changed;
      }
      if (!updated) {
        const [latest] = await tx.select({ journey: productizationOnboarding.journey, revision: productizationOnboarding.revision })
          .from(productizationOnboarding).where(eq(productizationOnboarding.companyId, companyId)).limit(1);
        throw conflict("Onboarding changed. Reload the latest journey before retrying.", {
          code: "onboarding_revision_conflict",
          currentRevision: latest?.revision ?? 0,
          journey: latest?.journey ?? null,
        });
      }
      const { publication } = await persistActivity(txDb, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId ?? null,
        action,
        entityType: "productization_onboarding",
        entityId: journey.id,
        details: { revision: updated.revision },
      });
      return { revision: updated.revision, publication };
    });
    publishActivity(committed.publication);
    return committed.revision;
  }

  return {
    get: async (companyId: string) => {
      const { journey, revision } = await readStored(companyId);
      return snapshotFor(journey, revision);
    },

    put: async (companyId: string, input: { expectedRevision: number; path: OnboardingPath }, actor: OnboardingActor) => {
      await checkCompany(companyId);
      const now = new Date();
      if (input.expectedRevision === 0) {
        const journey: OnboardingJourney = {
          version: ONBOARDING_JOURNEY_VERSION,
          id: randomUUID(),
          accountId: null,
          companyId,
          path: input.path,
          createdAt: now.toISOString(),
          connections: [],
        };
        const revision = await writeRevision(companyId, 0, journey, actor, "productization.onboarding.created");
        return snapshotFor(journey, revision);
      }
      const { journey, revision } = await readStored(companyId);
      if (revision !== input.expectedRevision) throw conflict("Onboarding changed. Reload the latest journey before retrying.", { code: "onboarding_revision_conflict", currentRevision: revision, journey });
      if (journey.business?.confirmation || journey.context?.confirmation || journey.team?.installed || journey.firstJob) {
        throw conflict("The path is fixed after onboarding facts are recorded.", { code: "onboarding_path_locked", currentRevision: revision, journey });
      }
      if (journey.path === input.path) return snapshotFor(journey, revision);
      const next = { ...journey, path: input.path };
      const nextRevision = await writeRevision(companyId, revision, next, actor, "productization.onboarding.path_changed");
      return snapshotFor(next, nextRevision);
    },

    recordUserEvent: async (companyId: string, expectedRevision: number, input: OnboardingUserEvent, actor: OnboardingActor) => {
      const { journey, revision } = await readStored(companyId);
      if (revision !== expectedRevision) throw conflict("Onboarding changed. Reload the latest journey before retrying.", { code: "onboarding_revision_conflict", currentRevision: revision, journey });
      const evidence = serverEvidence(`onboarding:${journey.id}:r${revision + 1}:${input.type}`);
      const event = { ...input, ...(input.type === "business_confirmed" || input.type === "context_confirmed" ? { evidence } : {}) } as OnboardingEvent;
      const result = applyOnboardingEvent(journey, event);
      if (!result.accepted) {
        return { ...await snapshotFor(journey, revision), result: { accepted: false, reason: result.reason } };
      }
      const nextRevision = await writeRevision(companyId, revision, result.journey, actor, `productization.onboarding.${input.type}`);
      return { ...await snapshotFor(result.journey, nextRevision), result: { accepted: true } };
    },

    selectTeam: async (companyId: string, expectedRevision: number, selectedAgentIds: string[], actor: OnboardingActor) => {
      const { journey, revision } = await readStored(companyId);
      if (revision !== expectedRevision) throw conflict("Onboarding changed. Reload the latest journey before retrying.", { code: "onboarding_revision_conflict", currentRevision: revision, journey });
      if (journey.firstJob) throw conflict("The team is locked after the first job.", { code: "onboarding_team_locked", currentRevision: revision, journey });
      if (!journey.business?.confirmation || !journey.context?.confirmation) throw conflict("Confirm the offer and context before selecting a team.", { code: "onboarding_prerequisite_missing" });
      const ids = [...new Set(selectedAgentIds)];
      if (!ids.length || ids.length !== selectedAgentIds.length) throw unprocessable("Select one or more different agents.");
      const selected = await db.select({ id: agents.id, status: agents.status, lifecycleState: agents.lifecycleState }).from(agents)
        .where(and(eq(agents.companyId, companyId), inArray(agents.id, ids)));
      if (selected.length !== ids.length || selected.some((agent) => agent.lifecycleState !== "ready" || !USABLE_AGENT_STATUSES.includes(agent.status as typeof USABLE_AGENT_STATUSES[number]))) {
        throw conflict("Selected agents must belong to this company and be approved and ready.", { code: "onboarding_team_not_ready" });
      }
      const now = new Date();
      const result = applyOnboardingEvent(journey, { type: "team_installed", agentIds: ids, evidence: serverEvidence(`selected-agents:${ids.join(",")}`, now) });
      if (!result.accepted) throw conflict("Confirm the business context and required setup before selecting the team.", { code: "onboarding_prerequisite_missing", reason: result.reason });
      const nextRevision = await writeRevision(companyId, revision, result.journey, actor, "productization.onboarding.team_selected");
      return snapshotFor(result.journey, nextRevision);
    },

    activateTeam: async (companyId: string, expectedRevision: number, actor: OnboardingActor) => {
      const { journey, revision } = await readStored(companyId);
      if (revision !== expectedRevision) throw conflict("Onboarding changed. Reload the latest journey before retrying.", { code: "onboarding_revision_conflict", currentRevision: revision, journey });
      const selectedIds = journey.team?.agentIds ?? [];
      if (!selectedIds.length || !journey.team?.installed) throw conflict("Select an approved team before activating it.", { code: "onboarding_team_not_selected" });
      const selected = await db.select({ id: agents.id, status: agents.status, lifecycleState: agents.lifecycleState }).from(agents)
        .where(and(eq(agents.companyId, companyId), inArray(agents.id, selectedIds)));
      if (selected.length !== selectedIds.length || selected.some((agent) => agent.lifecycleState !== "ready" || !USABLE_AGENT_STATUSES.includes(agent.status as typeof USABLE_AGENT_STATUSES[number]))) {
        throw conflict("The selected team is no longer ready. Choose available agents again.", { code: "onboarding_team_not_ready" });
      }
      const now = new Date();
      const result = applyOnboardingEvent(journey, { type: "team_activated", evidence: serverEvidence(`explicit-team-activation:${selectedIds.join(",")}`, now) });
      if (!result.accepted) throw conflict("The journey is not ready to activate this team.", { code: "onboarding_prerequisite_missing", reason: result.reason });
      const nextRevision = await writeRevision(companyId, revision, result.journey, actor, "productization.onboarding.team_activated");
      return snapshotFor(result.journey, nextRevision);
    },

    recordFirstJob: async (companyId: string, expectedRevision: number, goalId: string, actor: OnboardingActor) => {
      const { journey, revision } = await readStored(companyId);
      if (revision !== expectedRevision) throw conflict("Onboarding changed. Reload the latest journey before retrying.", { code: "onboarding_revision_conflict", currentRevision: revision, journey });
      if (journey.firstJob) return snapshotFor(await projectAcceptedDeliverable(journey), revision);
      if (!journey.team?.activated) throw conflict("Activate the selected team before linking its first job.", { code: "onboarding_prerequisite_missing" });
      const selectedIds = journey.team.agentIds ?? [];
      const [candidate] = await db.select({ goalId: goals.id, goalCreatedAt: goals.createdAt, goalStatus: goals.status, goalKind: goals.kind, issueId: issues.id, startedAt: issues.startedAt, status: issues.status, assigneeAgentId: issues.assigneeAgentId })
        .from(goals)
        .innerJoin(issues, and(eq(issues.id, goals.rootIssueId), eq(issues.companyId, goals.companyId)))
        .where(and(eq(goals.companyId, companyId), eq(goals.id, goalId), eq(goals.kind, "assignment"), ne(goals.status, "cancelled"), gte(goals.createdAt, new Date(journey.team.activated.at)), isNotNull(issues.startedAt), inArray(issues.status, [...STARTED_ISSUE_STATUSES]), inArray(issues.assigneeAgentId, selectedIds)))
        .limit(1);
      if (!candidate?.startedAt || candidate.goalKind !== "assignment" || candidate.goalStatus === "cancelled" || !selectedIds.includes(candidate.assigneeAgentId ?? "") || candidate.goalCreatedAt < new Date(journey.team.activated.at) || candidate.startedAt < new Date(journey.team.activated.at)) {
        throw conflict("Choose a real assignment whose root task started after team activation.", { code: "onboarding_goal_not_started" });
      }
      const result = applyOnboardingEvent(journey, {
        type: "first_job_started",
        goalId: candidate.goalId,
        issueId: candidate.issueId,
        evidence: serverEvidence(`issue:${candidate.issueId}`, candidate.startedAt),
      });
      if (!result.accepted) throw conflict("The assignment does not meet this journey's prerequisites.", { code: "onboarding_prerequisite_missing", reason: result.reason });
      const nextRevision = await writeRevision(companyId, revision, result.journey, actor, "productization.onboarding.first_job_linked");
      return snapshotFor(result.journey, nextRevision);
    },
  };
}
