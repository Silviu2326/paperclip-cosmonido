/** Pure, versioned contract for the reentrant Sprint 4 onboarding journey.
 *
 * This module records facts supplied by owning services or explicit user
 * confirmations. It performs no extraction, connection, installation,
 * activation, issue creation, persistence, or authorization.
 */

export const ONBOARDING_JOURNEY_VERSION = 1 as const;
export const ONBOARDING_CONNECTION_EVIDENCE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type OnboardingPath = "entrepreneur" | "agency" | "commercial";
export type OnboardingStep =
  | "business"
  | "context"
  | "connections"
  | "team"
  | "activation"
  | "first_job"
  | "complete";

export type Evidence = {
  /** Canonical UTC timestamp (Date.toISOString format). */
  at: string;
  /** Reference to an auditable server fact or explicit user action. */
  reference: string;
};

export type ConnectionStage = "available" | "connected" | "authorized" | "checked";

export type OnboardingConnection = {
  id: string;
  stage: ConnectionStage;
  /** Latest provider check. Required for `checked` and freshness is evaluated at read time. */
  checkEvidence?: Evidence;
  /** A revocation/reconnect signal invalidates earlier checks until checked again. */
  invalidatedAt?: Evidence;
  /** Historical provider observations preserve the facts behind completed milestones. */
  checkHistory?: Evidence[];
  invalidationHistory?: Evidence[];
};

export type ConnectionCheckSnapshot = {
  connectionId: string;
  checkedAt: string;
  evidenceReference: string;
};

export type OnboardingJourney = {
  version: typeof ONBOARDING_JOURNEY_VERSION;
  id: string;
  /** Self-hosted Paperclip has no account entity; null is its explicit scope. */
  accountId: string | null;
  companyId: string;
  path: OnboardingPath;
  createdAt: string;
  /** A hint for display only. Eligibility is always derived from recorded facts. */
  currentStep?: OnboardingStep;
  business?: {
    url?: string;
    /** Extracted/copied suggestion; it is not user-confirmed business truth. */
    suggestedBusinessName?: string;
    suggestedOffer?: string;
    confirmedBusinessName?: string;
    confirmedOffer?: string;
    confirmation?: Evidence;
  };
  context?: {
    audience: string;
    desiredOutcome: string;
    constraints?: string;
    confirmation: Evidence;
  };
  /** Requirements are selected by the owning, server-side journey script. */
  connections: OnboardingConnection[];
  team?: {
    /** Company-scoped agents explicitly selected through the server endpoint. */
    agentIds?: string[];
    installed?: Evidence;
    installedConnections?: ConnectionCheckSnapshot[];
    activated?: Evidence;
    activatedConnections?: ConnectionCheckSnapshot[];
  };
  firstJob?: Evidence;
  firstJobGoalId?: string;
  firstJobIssueId?: string;
  firstJobConnections?: ConnectionCheckSnapshot[];
  firstAcceptedDeliverable?: Evidence;
  /** Saved description-based setup drafts; every version is human supplied. */
  builderDrafts?: import("./description-builder.js").BuilderDraft[];
};

export type OnboardingEvent =
  | { type: "business_suggestion_recorded"; url?: string; businessName?: string; offer?: string }
  | { type: "business_confirmed"; businessName: string; offer: string; evidence: Evidence }
  | { type: "context_confirmed"; audience: string; desiredOutcome: string; constraints?: string; evidence: Evidence }
  | { type: "connection_stage_recorded"; connectionId: string; stage: ConnectionStage; evidence?: Evidence }
  | { type: "connection_invalidated"; connectionId: string; evidence: Evidence }
  | { type: "team_installed"; agentIds: string[]; evidence: Evidence }
  | { type: "team_activated"; evidence: Evidence }
  | { type: "first_job_started"; goalId: string; issueId: string; evidence: Evidence }
  | { type: "deliverable_accepted"; evidence: Evidence };

export type OnboardingBlocker =
  | "invalid_journey"
  | "business_not_confirmed"
  | "context_incomplete"
  | "connection_not_checked"
  | "connection_check_stale"
  | "team_not_installed"
  | "team_not_activated"
  | "first_job_not_started"
  | "invalid_or_out_of_order_evidence";

export type OnboardingProgress = {
  nextStep: OnboardingStep;
  ready: boolean;
  blockedBy: OnboardingBlocker[];
  /** Workflow completion is separate from product demand, payment, and retention validation. */
  journeyCompleted: boolean;
  metrics: {
    timeToFirstJobMs?: number;
    timeToFirstAcceptedDeliverableMs?: number;
  };
};

export type OnboardingEventResult = {
  journey: OnboardingJourney;
  accepted: boolean;
  reason?: "invalid_evidence" | "prerequisite_missing" | "out_of_order" | "unknown_connection" | "invalid_transition" | "already_recorded";
};

const CONNECTION_RANK: Record<ConnectionStage, number> = {
  available: 0,
  connected: 1,
  authorized: 2,
  checked: 3,
};

const ONBOARDING_EVENT_TYPES = new Set([
  "business_suggestion_recorded", "business_confirmed", "context_confirmed",
  "connection_stage_recorded", "connection_invalidated", "team_installed",
  "team_activated", "first_job_started", "deliverable_accepted",
]);

function nonEmpty(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** Accept only canonical UTC timestamps, so durations have an unambiguous basis. */
export function isValidOnboardingTimestamp(value: string): boolean {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) return false;
  const millis = Date.parse(value);
  return Number.isFinite(millis) && new Date(millis).toISOString() === value;
}

function validEvidence(evidence: Evidence | undefined): evidence is Evidence {
  return Boolean(evidence && nonEmpty(evidence.reference) && isValidOnboardingTimestamp(evidence.at));
}

function evidenceAtOrAfter(evidence: Evidence | undefined, timestamp: string): boolean {
  return validEvidence(evidence) && isValidOnboardingTimestamp(timestamp) && Date.parse(evidence.at) >= Date.parse(timestamp);
}

function maxRecordedTime(journey: OnboardingJourney): number {
  const times = [journey.createdAt, journey.business?.confirmation?.at, journey.context?.confirmation?.at,
    journey.team?.installed?.at, journey.team?.activated?.at, journey.firstJob?.at,
    journey.firstAcceptedDeliverable?.at, ...journey.connections.map((connection) => connection.checkEvidence?.at)]
    .filter((value): value is string => typeof value === "string" && isValidOnboardingTimestamp(value));
  return Math.max(...times.map((value) => Date.parse(value)));
}

/** Returns a copy with an event recorded only when its prerequisites and evidence are valid. */
export function applyOnboardingEvent(
  journey: OnboardingJourney,
  event: OnboardingEvent,
): OnboardingEventResult {
  const reject = (reason: NonNullable<OnboardingEventResult["reason"]>): OnboardingEventResult => ({ journey, accepted: false, reason });
  const accept = (updated: OnboardingJourney): OnboardingEventResult => ({ journey: updated, accepted: true });
  if (!event || typeof event !== "object" || !ONBOARDING_EVENT_TYPES.has(event.type)) return reject("invalid_transition");
  if (!isValidJourneyIdentity(journey)) return reject("invalid_evidence");
  if (journey.version !== ONBOARDING_JOURNEY_VERSION) return reject("invalid_transition");

  switch (event.type) {
    case "business_suggestion_recorded":
      if (journey.firstJob) return reject("already_recorded");
      return accept({ ...journey, business: { ...journey.business, url: event.url, suggestedBusinessName: event.businessName, suggestedOffer: event.offer } });
    case "business_confirmed":
      if (journey.firstJob) return reject("already_recorded");
      if (!nonEmpty(event.businessName) || !nonEmpty(event.offer) || !validEvidence(event.evidence)) return reject("invalid_evidence");
      if (!evidenceAtOrAfter(event.evidence, journey.createdAt)) return reject("out_of_order");
      return accept({ ...journey, business: { ...journey.business, confirmedBusinessName: event.businessName.trim(), confirmedOffer: event.offer.trim(), confirmation: event.evidence }, context: undefined, connections: resetConnections(journey.connections), team: undefined });
    case "context_confirmed":
      if (journey.firstJob) return reject("already_recorded");
      if (!nonEmpty(journey.business?.confirmedBusinessName) || !nonEmpty(journey.business?.confirmedOffer) ||
          !validEvidence(event.evidence) || !validEvidence(journey.business?.confirmation) ||
          Date.parse(event.evidence.at) < Date.parse(journey.business?.confirmation?.at ?? "") ||
          !nonEmpty(event.audience) || !nonEmpty(event.desiredOutcome)) return reject("prerequisite_missing");
      return accept({ ...journey, context: { audience: event.audience.trim(), desiredOutcome: event.desiredOutcome.trim(), constraints: event.constraints?.trim(), confirmation: event.evidence }, connections: resetConnections(journey.connections), team: undefined });
    case "connection_stage_recorded": {
      if (!Object.hasOwn(CONNECTION_RANK, event.stage)) return reject("invalid_transition");
      const index = journey.connections.findIndex((connection) => connection.id === event.connectionId);
      if (index < 0) return reject("unknown_connection");
      if (!businessAndContextReady(journey)) return reject("prerequisite_missing");
      const existing = journey.connections[index];
      const nextRank = CONNECTION_RANK[event.stage];
      if (nextRank < CONNECTION_RANK[existing.stage] || nextRank > CONNECTION_RANK[existing.stage] + 1) return reject("invalid_transition");
      if (event.stage === "checked" && !validEvidence(event.evidence)) return reject("invalid_evidence");
      if (event.stage === "checked" && !evidenceAtOrAfter(event.evidence, existing.invalidatedAt?.at ?? journey.context!.confirmation.at)) return reject("out_of_order");
      const connections = journey.connections.slice();
      connections[index] = {
        ...existing,
        stage: event.stage,
        checkEvidence: event.stage === "checked" ? event.evidence : existing.checkEvidence,
        checkHistory: event.stage === "checked" ? [...(existing.checkHistory ?? (existing.checkEvidence ? [existing.checkEvidence] : [])), event.evidence!] : existing.checkHistory,
        invalidatedAt: event.stage === "checked" ? undefined : existing.invalidatedAt,
      };
      return accept({ ...journey, connections, team: journey.firstJob ? journey.team : undefined });
    }
    case "connection_invalidated": {
      const index = journey.connections.findIndex((connection) => connection.id === event.connectionId);
      if (index < 0) return reject("unknown_connection");
      if (!validEvidence(event.evidence)) return reject("invalid_evidence");
      const existing = journey.connections[index];
      const lastInvalidation = latestEvidenceAt(connectionInvalidations(existing), Number.POSITIVE_INFINITY);
      if (!evidenceAtOrAfter(event.evidence, lastInvalidation?.at ?? existing.checkEvidence?.at ?? journey.createdAt)) return reject("out_of_order");
      const connections = journey.connections.slice();
      connections[index] = {
        ...existing,
        stage: "available",
        invalidatedAt: event.evidence,
        invalidationHistory: [...(existing.invalidationHistory ?? (existing.invalidatedAt ? [existing.invalidatedAt] : [])), event.evidence],
      };
      return accept({ ...journey, connections, team: journey.firstJob ? journey.team : journey.team?.installed ? { installed: journey.team.installed } : undefined });
    }
    case "team_installed":
      if (journey.firstJob) return reject("already_recorded");
      if (!Array.isArray(event.agentIds) || event.agentIds.length === 0 || event.agentIds.some((id) => !nonEmpty(id)) || new Set(event.agentIds).size !== event.agentIds.length) return reject("invalid_evidence");
      if (!validEvidence(event.evidence) || !businessAndContextReady(journey) ||
          !connectionsReadyAt(journey, event.evidence.at) ||
          Date.parse(event.evidence.at) < maxRecordedTime(journey)) return reject("prerequisite_missing");
      return accept({ ...journey, team: { agentIds: [...event.agentIds], installed: event.evidence, installedConnections: snapshotConnections(journey, event.evidence.at) } });
    case "team_activated": {
      if (journey.firstJob) return reject("already_recorded");
      const installed = journey.team?.installed;
      if (!validEvidence(event.evidence)) return reject("invalid_evidence");
      if (!validEvidence(installed) || !connectionsReadyAt(journey, event.evidence.at) || !businessAndContextReady(journey)) return reject("prerequisite_missing");
      if (Date.parse(event.evidence.at) < Math.max(Date.parse(installed.at), maxRecordedTime(journey))) return reject("out_of_order");
      return accept({ ...journey, team: { ...journey.team, activated: event.evidence, activatedConnections: snapshotConnections(journey, event.evidence.at) } });
    }
    case "first_job_started":
      if (journey.firstJob) return reject("already_recorded");
      if (!validEvidence(event.evidence) || !nonEmpty(event.goalId) || !nonEmpty(event.issueId)) return reject("invalid_evidence");
      if (!activationReady(journey) || !connectionsReadyAt(journey, event.evidence.at)) return reject("prerequisite_missing");
      if (Date.parse(event.evidence.at) < maxRecordedTime(journey)) return reject("out_of_order");
      return accept({ ...journey, firstJob: event.evidence, firstJobGoalId: event.goalId, firstJobIssueId: event.issueId, firstJobConnections: snapshotConnections(journey, event.evidence.at) });
    case "deliverable_accepted": {
      const firstJob = journey.firstJob;
      if (journey.firstAcceptedDeliverable) return reject("already_recorded");
      if (!validEvidence(event.evidence)) return reject("invalid_evidence");
      if (!validEvidence(firstJob)) return reject("prerequisite_missing");
      if (Date.parse(event.evidence.at) < Date.parse(firstJob.at)) return reject("out_of_order");
      return accept({ ...journey, firstAcceptedDeliverable: event.evidence });
    }
  }
}

function isValidJourneyIdentity(journey: OnboardingJourney): boolean {
  return Boolean(journey && typeof journey === "object" && journey.version === ONBOARDING_JOURNEY_VERSION && nonEmpty(journey.id) && (journey.accountId === null || nonEmpty(journey.accountId)) && nonEmpty(journey.companyId) &&
    isValidOnboardingTimestamp(journey.createdAt) && ["entrepreneur", "agency", "commercial"].includes(journey.path) &&
    Array.isArray(journey.connections) && journey.connections.every((connection) => Boolean(connection && typeof connection === "object")) &&
    new Set(journey.connections.map((connection) => connection.id)).size === journey.connections.length &&
    journey.connections.every((connection) => nonEmpty(connection.id) && Object.hasOwn(CONNECTION_RANK, connection.stage)) &&
    (!journey.team?.agentIds || (Array.isArray(journey.team.agentIds) && journey.team.agentIds.length > 0 && journey.team.agentIds.every(nonEmpty) && new Set(journey.team.agentIds).size === journey.team.agentIds.length)));
}

function businessAndContextReady(journey: OnboardingJourney): boolean {
  return nonEmpty(journey.business?.confirmedBusinessName) && nonEmpty(journey.business?.confirmedOffer) &&
    validEvidence(journey.business?.confirmation) && nonEmpty(journey.context?.audience) &&
    nonEmpty(journey.context?.desiredOutcome) && validEvidence(journey.context?.confirmation);
}

function activationReady(journey: OnboardingJourney): boolean {
  return businessAndContextReady(journey) && Array.isArray(journey.team?.agentIds) && journey.team.agentIds.length > 0 && validEvidence(journey.team?.installed) && validEvidence(journey.team?.activated);
}

function resetConnections(connections: OnboardingConnection[]): OnboardingConnection[] {
  return connections.map(({ id }) => ({ id, stage: "available" }));
}

function snapshotConnections(journey: OnboardingJourney, at: string): ConnectionCheckSnapshot[] {
  if (!connectionsReadyAt(journey, at)) return [];
  const atMillis = Date.parse(at);
  const snapshot = journey.connections.map((connection) => {
    const evidence = latestEvidenceAt(connectionChecks(connection), atMillis);
    return evidence ? { connectionId: connection.id, checkedAt: evidence.at, evidenceReference: evidence.reference } : undefined;
  });
  return snapshot.every((item) => item !== undefined) ? snapshot as ConnectionCheckSnapshot[] : [];
}

function connectionSnapshotIsValid(
  snapshot: ConnectionCheckSnapshot[] | undefined,
  journey: OnboardingJourney,
  at: string,
): boolean {
  if (!snapshot || !isValidOnboardingTimestamp(at) || snapshot.some((item) => !item || typeof item !== "object") ||
      snapshot.length !== journey.connections.length ||
      new Set(snapshot.map((item) => item.connectionId)).size !== snapshot.length) return false;
  const requiredIds = new Set(journey.connections.map((connection) => connection.id));
  const atMillis = Date.parse(at);
  return snapshot.every((item) => {
    if (!requiredIds.has(item.connectionId) || !nonEmpty(item.evidenceReference) ||
        !isValidOnboardingTimestamp(item.checkedAt)) return false;
    const checkedAt = Date.parse(item.checkedAt);
    if (checkedAt > atMillis || atMillis - checkedAt > ONBOARDING_CONNECTION_EVIDENCE_MAX_AGE_MS) return false;
    const connection = journey.connections.find((candidate) => candidate.id === item.connectionId)!;
    const invalidation = latestEvidenceAt(connectionInvalidations(connection), atMillis);
    return !invalidation || checkedAt >= Date.parse(invalidation.at);
  });
}

function connectionsReadyAt(journey: OnboardingJourney, at: string): boolean {
  if (!isValidOnboardingTimestamp(at)) return false;
  const atMillis = Date.parse(at);
  return journey.connections.every((connection) => {
    const evidence = latestEvidenceAt(connectionChecks(connection), atMillis);
    const invalidation = latestEvidenceAt(connectionInvalidations(connection), atMillis);
    return connection.stage === "checked" && validEvidence(evidence) &&
      (!invalidation || Date.parse(evidence.at) >= Date.parse(invalidation.at)) &&
      atMillis - Date.parse(evidence.at) <= ONBOARDING_CONNECTION_EVIDENCE_MAX_AGE_MS;
  });
}

function connectionChecks(connection: OnboardingConnection): Evidence[] {
  return connection.checkHistory ?? (connection.checkEvidence ? [connection.checkEvidence] : []);
}

function connectionInvalidations(connection: OnboardingConnection): Evidence[] {
  return connection.invalidationHistory ?? (connection.invalidatedAt ? [connection.invalidatedAt] : []);
}

function latestEvidenceAt(evidence: Evidence[], atMillis: number): Evidence | undefined {
  return evidence.filter((item) => validEvidence(item) && Date.parse(item.at) <= atMillis)
    .sort((left, right) => Date.parse(right.at) - Date.parse(left.at))[0];
}

function hasValidEvidenceTimeline(journey: OnboardingJourney, now: string): boolean {
  if (!isValidJourneyIdentity(journey) || !isValidOnboardingTimestamp(now)) return false;
  const nowMillis = Date.parse(now);
  const createdAt = Date.parse(journey.createdAt);
  const business = journey.business?.confirmation;
  const context = journey.context?.confirmation;
  const installed = journey.team?.installed;
  const activated = journey.team?.activated;
  const firstJob = journey.firstJob;
  const accepted = journey.firstAcceptedDeliverable;
  const snapshots = [
    ...(journey.team?.installedConnections ?? []),
    ...(journey.team?.activatedConnections ?? []),
    ...(journey.firstJobConnections ?? []),
  ];
  const evidence = [business, context, installed, activated, firstJob, accepted,
    ...journey.connections.flatMap((connection) => [...connectionChecks(connection), ...connectionInvalidations(connection)]),
    ...snapshots.map((snapshot) => ({ at: snapshot.checkedAt, reference: snapshot.evidenceReference }))].filter(Boolean) as Evidence[];
  if (evidence.some((item) => !validEvidence(item) || Date.parse(item.at) > nowMillis)) return false;
  if (business && Date.parse(business.at) < createdAt) return false;
  if (context && (!business || Date.parse(context.at) < Date.parse(business.at))) return false;
  for (const connection of journey.connections) {
    if (connectionInvalidations(connection).some((item) => Date.parse(item.at) < createdAt)) return false;
    if (connectionChecks(connection).some((item) => !context || Date.parse(item.at) < Date.parse(context.at))) return false;
  }
  if (installed && (!context || Date.parse(installed.at) < Date.parse(context.at) ||
      !connectionSnapshotIsValid(journey.team?.installedConnections, journey, installed.at))) return false;
  if (activated && (!installed || Date.parse(activated.at) < Date.parse(installed.at))) return false;
  if (activated && !connectionSnapshotIsValid(journey.team?.activatedConnections, journey, activated.at)) return false;
  if (firstJob && (!activated || !nonEmpty(journey.firstJobGoalId) || !nonEmpty(journey.firstJobIssueId) || Date.parse(firstJob.at) < Date.parse(activated.at))) return false;
  if (firstJob && !connectionSnapshotIsValid(journey.firstJobConnections, journey, firstJob.at)) return false;
  if (accepted && (!firstJob || Date.parse(accepted.at) < Date.parse(firstJob.at))) return false;
  return true;
}

/** Derives the next eligible step from facts, ignoring any persisted `currentStep` hint. */
export function getOnboardingProgress(
  journey: OnboardingJourney,
  now: string,
): OnboardingProgress {
  const blockedBy: OnboardingBlocker[] = [];
  const nowMillis = isValidOnboardingTimestamp(now) ? Date.parse(now) : Number.NaN;
  if (!isValidJourneyIdentity(journey) || !Number.isFinite(nowMillis) || Date.parse(journey.createdAt) > nowMillis) {
    return { nextStep: "business", ready: false, blockedBy: ["invalid_journey"], journeyCompleted: false, metrics: {} };
  }
  const validTimeline = hasValidEvidenceTimeline(journey, now);
  if (!validTimeline) blockedBy.push("invalid_or_out_of_order_evidence");
  if (!nonEmpty(journey.business?.confirmedBusinessName) || !nonEmpty(journey.business?.confirmedOffer) || !validEvidence(journey.business?.confirmation)) {
    blockedBy.push("business_not_confirmed");
  }
  if (!journey.context || !nonEmpty(journey.context.audience) || !nonEmpty(journey.context.desiredOutcome) || !validEvidence(journey.context.confirmation)) {
    blockedBy.push("context_incomplete");
  }
  let staleConnection = false;
  for (const connection of journey.connections) {
    const evidence = latestEvidenceAt(connectionChecks(connection), nowMillis);
    if (connection.stage !== "checked" || !validEvidence(evidence) ||
      (connection.invalidatedAt && !evidenceAtOrAfter(evidence, connection.invalidatedAt.at))) blockedBy.push("connection_not_checked");
    else if (!Number.isFinite(nowMillis) || nowMillis < Date.parse(evidence.at) ||
        nowMillis - Date.parse(evidence.at) > ONBOARDING_CONNECTION_EVIDENCE_MAX_AGE_MS) staleConnection = true;
  }
  if (staleConnection) blockedBy.push("connection_check_stale");
  if (!validEvidence(journey.team?.installed)) blockedBy.push("team_not_installed");
  if (!validEvidence(journey.team?.activated)) blockedBy.push("team_not_activated");
  if (!validEvidence(journey.firstJob)) blockedBy.push("first_job_not_started");

  let nextStep: OnboardingStep;
  if (validTimeline && validEvidence(journey.firstJob)) nextStep = "complete";
  else if (blockedBy.includes("business_not_confirmed")) nextStep = "business";
  else if (blockedBy.includes("context_incomplete")) nextStep = "context";
  else if (blockedBy.includes("connection_not_checked") || blockedBy.includes("connection_check_stale")) nextStep = "connections";
  else if (blockedBy.includes("team_not_installed")) nextStep = "team";
  else if (blockedBy.includes("team_not_activated")) nextStep = "activation";
  else if (blockedBy.includes("first_job_not_started")) nextStep = "first_job";
  else nextStep = "complete";
  if (blockedBy.includes("invalid_or_out_of_order_evidence") && nextStep === "complete") nextStep = "first_job";

  const createdAt = isValidOnboardingTimestamp(journey.createdAt) ? Date.parse(journey.createdAt) : Number.NaN;
  const firstJob = journey.firstJob;
  const firstAcceptedDeliverable = journey.firstAcceptedDeliverable;
  const firstJobAt = validEvidence(firstJob) ? Date.parse(firstJob.at) : Number.NaN;
  const acceptedAt = validEvidence(firstAcceptedDeliverable) ? Date.parse(firstAcceptedDeliverable.at) : Number.NaN;
  const journeyCompleted = nextStep === "complete" && !blockedBy.includes("invalid_journey") &&
    !blockedBy.includes("invalid_or_out_of_order_evidence");
  return {
    nextStep,
    ready: journeyCompleted && blockedBy.length === 0,
    blockedBy,
    journeyCompleted,
    metrics: {
      ...(validTimeline && Number.isFinite(createdAt) && Number.isFinite(firstJobAt) && firstJobAt >= createdAt ? { timeToFirstJobMs: firstJobAt - createdAt } : {}),
      ...(validTimeline && Number.isFinite(createdAt) && Number.isFinite(acceptedAt) && acceptedAt >= createdAt && acceptedAt >= firstJobAt
        ? { timeToFirstAcceptedDeliverableMs: acceptedAt - createdAt } : {}),
    },
  };
}
