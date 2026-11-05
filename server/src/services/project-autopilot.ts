import { and, eq, inArray, lte, or, sql } from "drizzle-orm";
import { isDeepStrictEqual } from "node:util";
import { agents, companies, heartbeatRuns, issues, projectAutopilots, projects, type Db } from "@paperclipai/db";
import { aiConnectionBindingSchema, autopilotCapacity, initialAutopilotState, validateAutopilotVerification,
  type AutopilotConfig, type AutopilotPhase, type AutopilotPlan, type AutopilotReport, type AutopilotState } from "@paperclipai/shared";
import { accessService } from "./access.js";
import { projectService } from "./projects.js";
import { issueService } from "./issues.js";
import { heartbeatService } from "./heartbeat.js";
import { queueIssueAssignmentWakeup } from "./issue-assignment-wakeup.js";
import type { IssueAssignmentWakeupDeps } from "./issue-assignment-wakeup.js";
import { logActivity } from "./activity-log.js";
import { aiConnectionService } from "./ai-connections.js";
import { fetchCompanyQuotaWindows, fetchLocalAdapterQuotaWindows } from "./quota-windows.js";
import { autopilotPrompt } from "./project-autopilot-prompts.js";
import { conflict, HttpError, unprocessable } from "../errors.js";
import { logger } from "../middleware/logger.js";
import { pendingNativeWorkspaceFinalizationCondition } from "./native-runtime/native-workspace-finalization-state.js";

type Row = typeof projectAutopilots.$inferSelect;
const phaseStatus = { planning: "planning", implementation: "implementing", review: "reviewing", verification: "verifying" } as const;
const terminal = new Set(["done", "cancelled"]);
function record(state: AutopilotState, message: string, issueId?: string) {
  state.summary = message;
  state.events = [...state.events, { at: new Date().toISOString(), message, ...(issueId ? { issueId } : {}) }].slice(-100);
}

export function projectAutopilotService(db: Db, options: { heartbeat?: IssueAssignmentWakeupDeps;
  observeCapacity?: (row: Row, agent: typeof agents.$inferSelect) => Promise<{ available: boolean; known: boolean; retryAt: string | null }> } = {}) {
  const projectSvc = projectService(db);
  const access = accessService(db);
  const issueSvc = issueService(db);
  const heartbeat = options.heartbeat ?? heartbeatService(db);
  const get = (projectId: string) => db.select().from(projectAutopilots).where(eq(projectAutopilots.projectId, projectId)).then(rows => rows[0] ?? null);

  async function authorized(row: Row) {
    const actor = row.responsibleUserId === "local-board"
      ? { type: "board" as const, source: "local_implicit" as const }
      : { type: "board" as const, userId: row.responsibleUserId };
    const [read, assign] = await Promise.all([
      access.decide({ actor, action: "project:read", resource: { type: "project", companyId: row.companyId, projectId: row.projectId } }),
      access.decide({ actor, action: "tasks:assign", resource: { type: "company", companyId: row.companyId } }),
    ]);
    return read.allowed && assign.allowed;
  }

  async function configure(projectId: string, companyId: string, config: AutopilotConfig, responsibleUserId: string, expectedRevision?: number) {
    if (config.builderAgentId === config.reviewerAgentId) throw unprocessable("Choose an independent reviewer, different from the builder");
    if (config.fallbackAgentId === config.reviewerAgentId) throw unprocessable("The fallback builder must be different from the independent reviewer");
    if (config.deploymentTargets.length && !config.allowPush) throw unprocessable("Deployment verification requires pushed commits; enable feature-branch pushes or remove deployment targets");
    const ids = [...new Set([config.plannerAgentId, config.builderAgentId, config.reviewerAgentId, config.fallbackAgentId].filter((id): id is string => !!id))];
    const roster = await db.select().from(agents).where(and(eq(agents.companyId, companyId), inArray(agents.id, ids)));
    if (roster.length !== ids.length || roster.some(agent => ["terminated", "pending_approval"].includes(agent.status))) throw unprocessable("Choose available agents from this company");
    const project = await projectSvc.getById(projectId);
    if (!project || project.companyId !== companyId) throw unprocessable("Project unavailable");
    if (config.enabled && !project.workspaces.some(workspace => workspace.repoUrl)) throw unprocessable("Attach at least one GitHub repository before enabling autonomy");
    for (const target of config.deploymentTargets) {
      if (!project.workspaces.some(workspace => workspace.id === target.projectWorkspaceId && workspace.repoUrl)) throw unprocessable("Deployment target must reference a repository in this project");
      if (!config.allowProductionDeploy && /^(production|prod)$/i.test(target.environment)) throw unprocessable("Enable production deployment authority or choose a preview/staging target");
    }
    return db.transaction(async tx => {
      // The project row also serializes the first configuration insert.
      await tx.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).for("update");
      const [existing] = await tx.select().from(projectAutopilots).where(eq(projectAutopilots.projectId, projectId)).for("update");
      if (existing && expectedRevision !== existing.revision) throw conflict("Autonomy configuration changed. Reload before saving.");
      if (existing && (existing.state.activeIssueId || existing.state.phase !== "planning") && !isDeepStrictEqual({ ...existing.config, enabled: config.enabled }, config)) {
        throw conflict("Pause new work and wait for the current task to finish before changing the execution configuration");
      }
      const values = { companyId, config, enabled: config.enabled, responsibleUserId, nextTickAt: new Date(), updatedAt: new Date() };
      if (existing) return (await tx.update(projectAutopilots).set({ ...values, revision: existing.revision + 1 }).where(eq(projectAutopilots.projectId, projectId)).returning())[0]!;
      return (await tx.insert(projectAutopilots).values({ projectId, ...values, state: initialAutopilotState() }).returning())[0]!;
    });
  }

  async function mutate(projectId: string, fn: (row: Row) => void) {
    return db.transaction(async tx => {
      const [row] = await tx.select().from(projectAutopilots).where(eq(projectAutopilots.projectId, projectId)).for("update");
      if (!row) throw conflict("Configure project autonomy first");
      fn(row);
      return (await tx.update(projectAutopilots).set({ state: row.state, nextTickAt: new Date(), revision: row.revision + 1, updatedAt: new Date() })
        .where(eq(projectAutopilots.projectId, projectId)).returning())[0]!;
    });
  }

  function assertActive(row: Row, issueId: string) {
    if (row.state.activeIssueId !== issueId) throw conflict("This result belongs to a superseded autonomy task");
  }

  async function submitPlans(projectId: string, input: { issueId: string; summary: string; recommendedPlanId: AutopilotPlan["id"]; plans: AutopilotPlan[] }) {
    const workspaces = await projectSvc.listWorkspaces(projectId);
    const ids = new Set(workspaces.map(workspace => workspace.id));
    if (input.plans.some(plan => plan.workspaceIds.some(id => !ids.has(id)))) throw unprocessable("A plan references a repository outside this project");
    return mutate(projectId, row => {
      assertActive(row, input.issueId);
      if (row.state.phase !== "planning") throw conflict("This task is not the discovery stage");
      row.state.plans = input.plans;
      row.state.recommendedPlanId = input.recommendedPlanId;
      record(row.state, input.summary, input.issueId);
    });
  }

  async function submitReport(projectId: string, report: AutopilotReport, agentId: string, runId: string) {
    const workspaces = await projectSvc.listWorkspaces(projectId);
    const ids = new Set(workspaces.map(workspace => workspace.id));
    if ([...report.commits.map(item => item.workspaceId), ...report.deployments.map(item => item.workspaceId)].some(id => !ids.has(id))) throw unprocessable("Evidence references a repository outside this project");
    return mutate(projectId, row => {
      assertActive(row, report.issueId);
      if (row.state.phase === "planning") throw conflict("Submit discovery plans instead of an execution report");
      const implementation = [...row.state.reports].reverse().find(item => item.cycle === row.state.cycle && item.phase === "implementation");
      if (["review", "verification"].includes(row.state.phase) && implementation?.agentId === agentId) {
        throw unprocessable("Independent review and verification cannot be submitted by the implementation agent");
      }
      if (row.state.phase === "verification") {
        const failures = validateAutopilotVerification(row.config, implementation, report);
        if (failures.length) throw unprocessable(failures.join("; "));
      }
      if (row.state.phase === "implementation" && report.outcome === "passed" && row.config.allowPush) {
        const plan = row.state.plans.find(item => item.id === row.state.selectedPlanId);
        if (plan?.workspaceIds.some(id => !report.commits.some(commit => commit.workspaceId === id))) throw unprocessable("Record a pushed commit for each affected repository");
      }
      row.state.reports = [...row.state.reports.filter(item => item.issueId !== report.issueId), { ...report, agentId, runId, cycle: row.state.cycle, phase: row.state.phase, at: new Date().toISOString() }].slice(-30);
      record(row.state, report.summary, report.issueId);
    });
  }

  async function selectPlan(projectId: string, planId: AutopilotPlan["id"]) {
    return mutate(projectId, row => {
      if (row.state.status !== "awaiting_selection" || row.state.activeIssueId) throw conflict("Plans are not ready for selection yet");
      const plan = row.state.plans.find(item => item.id === planId);
      if (!plan) throw unprocessable("Select a plan from this discovery cycle");
      row.state.selectedPlanId = planId;
      row.state.phase = "implementation";
      row.state.status = "idle";
      record(row.state, `Plan seleccionado: ${plan.title}`);
    });
  }

  async function requestCycle(projectId: string) {
    return mutate(projectId, row => {
      if (!row.enabled) throw conflict("Enable autonomy before starting a cycle");
      if (row.state.activeIssueId || ["implementing", "reviewing", "verifying"].includes(row.state.status)) throw conflict("A cycle is still active");
      row.state = { ...initialAutopilotState(), cycle: row.state.cycle, day: row.state.day, cyclesToday: row.state.cyclesToday,
        feedback: row.state.feedback, events: row.state.events, reports: row.state.reports };
      record(row.state, "Análisis del producto solicitado");
    });
  }

  async function feedback(projectId: string, text: string) {
    return mutate(projectId, row => {
      row.state.feedback = [...row.state.feedback, { at: new Date().toISOString(), text }].slice(-30);
      record(row.state, "Preferencia guardada para los próximos trabajos");
    });
  }

  /** Only examine the account actually selected for this agent. Never pool unrelated account quotas. */
  async function capacity(row: Row, agent: typeof agents.$inferSelect, hasProjectEnvironment = false) {
    const binding = aiConnectionBindingSchema.safeParse(agent.runtimeConfig.aiConnection);
    if (!binding.success) {
      const env = agent.adapterConfig.env;
      const unmodifiedLocalIdentity = !agent.runtimeConfig.aiConnection && row.responsibleUserId === "local-board" && !agent.defaultEnvironmentId && !hasProjectEnvironment
        && ["codex_local", "claude_local"].includes(agent.adapterType) && (!env || (typeof env === "object" && Object.keys(env).length === 0));
      const observed = unmodifiedLocalIdentity ? await fetchLocalAdapterQuotaWindows(agent.adapterType) : null;
      return observed?.ok && observed.windows.some(window => window.usedPercent !== null)
        ? { ...autopilotCapacity(observed.windows, row.config.reservePercent), known: true }
        : { available: true, known: false, retryAt: null };
    }
    const selected = await aiConnectionService(db).select({ companyId: row.companyId, userId: row.responsibleUserId, agentId: agent.id,
      adapterType: agent.adapterType, model: agent.adapterConfig.model, runnerProvider: agent.adapterConfig.provider,
      acpxAgent: agent.adapterConfig.acpxAgent, binding: binding.data });
    const quotas = await fetchCompanyQuotaWindows(db, row.companyId, row.responsibleUserId, { connectionId: selected.connection.id, grantId: selected.grant.id });
    const observed = quotas.find(item => item.ok && item.windows.some(window => window.usedPercent !== null));
    return observed ? { ...autopilotCapacity(observed.windows, row.config.reservePercent), known: true }
      : { available: true, known: false, retryAt: null };
  }

  async function tick(projectId: string) {
    const snapshot = await get(projectId);
    if (!snapshot?.enabled) return;
    if (!(await authorized(snapshot))) {
      const state = structuredClone(snapshot.state);
      state.status = "blocked"; recordOnce(state, "La autonomía se ha pausado porque su responsable ya no tiene permiso para dirigir este proyecto");
      await db.update(projectAutopilots).set({ enabled: false, config: { ...snapshot.config, enabled: false }, state,
        revision: snapshot.revision + 1, updatedAt: new Date() }).where(and(eq(projectAutopilots.projectId, projectId), eq(projectAutopilots.revision, snapshot.revision)));
      return;
    }
    const project = await projectSvc.getById(projectId);
    if (!project || project.pausedAt || project.archivedAt || ["completed", "cancelled"].includes(project.status)) return;
    const [company] = await db.select({ status: companies.status }).from(companies).where(eq(companies.id, snapshot.companyId));
    if (company?.status !== "active") return;
    let selectedAgent: typeof agents.$inferSelect | null = null;
    let observation: Awaited<ReturnType<typeof capacity>> = { available: true, known: false, retryAt: null };
    if (!snapshot.state.activeIssueId && snapshot.state.status !== "awaiting_selection" && snapshot.state.status !== "blocked") {
      const phase = snapshot.state.phase;
      const preferred = phase === "planning" ? snapshot.config.plannerAgentId : phase === "implementation" ? snapshot.config.builderAgentId : snapshot.config.reviewerAgentId;
      const candidates = [preferred, ...(phase === "planning" || phase === "implementation" ? [snapshot.config.fallbackAgentId] : [])].filter((id): id is string => !!id);
      for (const id of [...new Set(candidates)]) {
        const [agent] = await db.select().from(agents).where(and(eq(agents.id, id), eq(agents.companyId, snapshot.companyId)));
        if (!agent || !["active", "idle", "running"].includes(agent.status)) continue;
        const allowed = await access.decide({ actor: { type: "agent", agentId: agent.id, companyId: snapshot.companyId,
          ...(snapshot.responsibleUserId !== "local-board" ? { onBehalfOfUserId: snapshot.responsibleUserId } : {}) },
          action: "project:read", resource: { type: "project", companyId: snapshot.companyId, projectId } });
        if (!allowed.allowed) continue;
        try { observation = options.observeCapacity ? await options.observeCapacity(snapshot, agent) : await capacity(snapshot, agent, Object.keys(project.env ?? {}).length > 0); }
        catch { observation = { available: false, known: false, retryAt: null }; continue; }
        if (observation.available) { selectedAgent = agent; break; }
      }
    }
    const wake = await db.transaction(async tx => {
      const [row] = await tx.select().from(projectAutopilots).where(eq(projectAutopilots.projectId, projectId)).for("update");
      if (!row?.enabled || row.revision !== snapshot.revision || row.nextTickAt > new Date()) return null;
      const state = structuredClone(row.state);
      let nextTickAt = new Date(Date.now() + 60_000);
      let created: { id: string; assigneeAgentId: string | null; status: string } | null = null;
      const save = async () => {
        await tx.update(projectAutopilots).set({ state, nextTickAt, revision: row.revision + 1, updatedAt: new Date() }).where(eq(projectAutopilots.projectId, projectId));
      };
      if (state.activeIssueId) {
        const [issue] = await tx.select().from(issues).where(and(eq(issues.id, state.activeIssueId), eq(issues.companyId, row.companyId), eq(issues.projectId, projectId)));
        if (!issue) { state.status = "blocked"; record(state, "La tarea activa ya no está disponible; revisa el proyecto"); await save(); return null; }
        // A submitted result never transfers a still-running workspace to another agent.
        const [live] = await tx.select({ id: heartbeatRuns.id, status: heartbeatRuns.status, agentId: heartbeatRuns.agentId,
          retryAt: heartbeatRuns.scheduledRetryAt, retryReason: heartbeatRuns.scheduledRetryReason, errorCode: heartbeatRuns.errorCode }).from(heartbeatRuns).where(and(eq(heartbeatRuns.companyId, row.companyId),
          sql`coalesce(${heartbeatRuns.nativeIssueId}::text, ${heartbeatRuns.contextSnapshot}->>'issueId') = ${issue.id}`,
          or(inArray(heartbeatRuns.status, ["queued", "running", "scheduled_retry"]), pendingNativeWorkspaceFinalizationCondition(tx as unknown as Db))) ).limit(1);
        if (live || !terminal.has(issue.status)) {
          if (live?.status === "scheduled_retry" && (live.retryReason === "provider_quota" || live.errorCode === "provider_quota")) {
            state.status = "waiting_capacity";
            state.capacity = { agentId: live.agentId, observedAt: new Date().toISOString(), available: false, known: true, retryAt: live.retryAt?.toISOString() ?? null };
            recordOnce(state, "El proveedor ha alcanzado su límite. La tarea y su contexto se conservan para reanudarlos automáticamente.", issue.id);
          } else if (live?.status === "running" && state.status === "waiting_capacity") {
            state.status = phaseStatus[state.phase];
            recordOnce(state, "El agente ha reanudado la tarea", issue.id);
          }
          if (issue.status === "blocked") { state.status = "blocked"; recordOnce(state, "La tarea necesita resolver un bloqueo antes de continuar", issue.id); }
          await save();
          return issue.status === "todo" && !live ? { id: issue.id, assigneeAgentId: issue.assigneeAgentId, status: issue.status } : null;
        }
        if (issue.status !== "done") { state.status = "blocked"; record(state, "La tarea fue cancelada; solicita un nuevo análisis para continuar", issue.id); state.activeIssueId = null; await save(); return null; }
        if (state.phase === "planning") {
          if (state.plans.length !== 3) { state.status = "blocked"; record(state, "El análisis terminó sin entregar los tres planes", issue.id); }
          else {
            const recommended = state.plans.find(plan => plan.id === state.recommendedPlanId);
            const auto = row.config.selectionMode === "automatic" && recommended && recommended.risk !== "high"
              && (recommended.risk === "low" || row.config.automaticMaxRisk === "medium");
            state.status = auto ? "idle" : "awaiting_selection";
            if (auto) { state.selectedPlanId = recommended.id; state.phase = "implementation"; }
            record(state, auto ? `Plan elegido automáticamente: ${recommended!.title}` : "Tres planes preparados: elige cómo avanzar", issue.id);
          }
        } else {
          const report = state.reports.find(item => item.issueId === issue.id);
          if (!report || report.outcome === "blocked") { state.status = "blocked"; record(state, report?.summary ?? "La tarea terminó sin un informe verificable", issue.id); }
          else if (report.outcome === "changes_requested") {
            state.revisionAttempts++;
            state.status = state.revisionAttempts > row.config.maxRevisionAttempts ? "blocked" : "idle";
            state.phase = "implementation";
            record(state, state.status === "blocked" ? "Se alcanzó el límite de correcciones; revisa los hallazgos" : "Correcciones solicitadas; se prepara otra implementación", issue.id);
          } else if (state.phase === "implementation") { state.phase = "review"; state.status = "idle"; record(state, "Implementación terminada; pendiente de revisión independiente", issue.id); }
          else if (state.phase === "review" && row.config.deploymentTargets.length) { state.phase = "verification"; state.status = "idle"; record(state, "Revisión superada; se comprobarán los despliegues", issue.id); }
          else { state.status = "completed"; state.phase = "planning"; record(state, "Ciclo completado con evidencias. El siguiente análisis respetará tus límites.", issue.id); nextTickAt = new Date(Date.now() + row.config.intervalMinutes * 60_000); }
        }
        state.activeIssueId = null;
        await save(); return null;
      }
      if (["blocked", "awaiting_selection"].includes(state.status)) { await save(); return null; }
      if (state.day !== new Date().toISOString().slice(0, 10)) { state.day = new Date().toISOString().slice(0, 10); state.cyclesToday = 0; }
      if (state.phase === "planning" && state.cyclesToday >= row.config.maxCyclesPerDay) {
        nextTickAt = new Date(`${state.day}T00:00:00Z`); nextTickAt.setUTCDate(nextTickAt.getUTCDate() + 1);
        recordOnce(state, "Límite diario alcanzado; el trabajo se reanudará mañana"); await save(); return null;
      }
      if (!selectedAgent) {
        state.status = "waiting_capacity";
        nextTickAt = observation.retryAt ? new Date(observation.retryAt) : new Date(Date.now() + 5 * 60_000);
        recordOnce(state, "Esperando capacidad o disponibilidad de los agentes configurados"); await save(); return null;
      }
      state.capacity = { ...observation, agentId: selectedAgent.id, observedAt: new Date().toISOString() };
      if (state.phase === "planning") {
        state.cycle++; state.cyclesToday++; state.revisionAttempts = 0; state.plans = [];
        state.selectedPlanId = null; state.recommendedPlanId = null;
      }
      const predecessor = [...state.reports].reverse().find(report => report.cycle === state.cycle && report.phase === "implementation");
      created = await issueSvc.create(row.companyId, {
        projectId, goalId: project.goalId, title: `${project.name} · ${phaseStatus[state.phase]} · ${state.cycle}`,
        description: autopilotPrompt({ projectId, projectName: project.name, config: row.config, state, phase: state.phase, workspaces: project.workspaces }),
        status: "todo", priority: "medium", assigneeAgentId: selectedAgent.id,
        responsibleUserId: row.responsibleUserId, trustExplicitResponsibleUserId: true,
        originKind: "autopilot", originId: projectId,
        idempotencyKey: `autopilot:${projectId}:${state.cycle}:${state.phase}:${state.revisionAttempts}`,
        ...(predecessor ? { inheritExecutionWorkspaceFromIssueId: predecessor.issueId } : {}),
      }, tx);
      state.activeIssueId = created.id; state.status = phaseStatus[state.phase];
      record(state, `Trabajo asignado a ${selectedAgent.name}: ${phaseStatus[state.phase]}`, created.id);
      await save(); return created;
    });
    if (wake) {
      await queueIssueAssignmentWakeup({ heartbeat, issue: wake, reason: "issue_assigned", mutation: "create", contextSource: "autopilot.dispatch", requestedByActorType: "system", rethrowOnError: true });
      await logActivity(db, { companyId: snapshot.companyId, actorType: "system", actorId: "project-autopilot", action: "autopilot.dispatched", entityType: "project", entityId: projectId, details: { issueId: wake.id } });
    }
  }

  async function sweep() {
    const rows = await db.select({ projectId: projectAutopilots.projectId }).from(projectAutopilots)
      .where(and(eq(projectAutopilots.enabled, true), lte(projectAutopilots.nextTickAt, new Date())))
      .orderBy(projectAutopilots.nextTickAt).limit(20);
    // Bound concurrency so quota endpoints and task admission cannot flood the host.
    for (let offset = 0; offset < rows.length; offset += 2) await Promise.all(rows.slice(offset, offset + 2).map(row => tick(row.projectId).catch(async err => {
      logger.warn({ err, projectId: row.projectId }, "Project autonomy tick failed; durable state retained");
      const current = await get(row.projectId);
      if (!current) return;
      const state = structuredClone(current.state);
      const needsDecision = err instanceof HttpError && err.status >= 400 && err.status < 500;
      if (needsDecision) state.status = "blocked";
      recordOnce(state, needsDecision ? err.message : "La preparación encontró un error temporal. Se reintentará automáticamente.");
      await db.update(projectAutopilots).set({ state, nextTickAt: new Date(Date.now() + 5 * 60_000),
        revision: current.revision + 1, updatedAt: new Date() }).where(and(eq(projectAutopilots.projectId, row.projectId), eq(projectAutopilots.revision, current.revision)));
    })));
  }
  return { get, configure, submitPlans, submitReport, selectPlan, requestCycle, feedback, tick, sweep };
}

function recordOnce(state: AutopilotState, message: string, issueId?: string) {
  if (state.summary !== message) record(state, message, issueId);
}
