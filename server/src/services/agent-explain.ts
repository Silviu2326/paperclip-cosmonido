import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  agents,
  autonomyPolicies,
  companyFileReads,
  companyFiles,
  decisions,
  heartbeatRunEvents,
  heartbeatRuns,
  issues,
  playbookRuns,
  playbooks,
  proposals,
  toolActionRequests,
  toolInvocations,
} from "@paperclipai/db";
import type { AgentActionExplanation, AgentActionKind, AgentExplainTimelineEntry } from "@paperclipai/shared";
import { notFound } from "../errors.js";

/**
 * Sprint 3 WP12 "Por qué hizo esto". Read-only composition over existing tables.
 * Never writes and never touches the heartbeat run-log append path.
 */

/** Run-log event types that represent a tool invocation (see doc/run-log-events.md and the adapters). */
const RUN_TOOL_EVENT_TYPES = ["tool_call", "tool.call", "tool.execution.started"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RunRow = typeof heartbeatRuns.$inferSelect;
type PolicyRow = typeof autonomyPolicies.$inferSelect;
type Explanation = AgentActionExplanation;
type TimelineLink = AgentExplainTimelineEntry["link"];
type ResultRow = NonNullable<Explanation["result"]>;

interface ActionTarget {
  title: string;
  at: Date | null;
  agentId: string | null;
  runId: string | null;
  run: RunRow | null;
  issueId: string | null;
  result: Explanation["result"];
  humanDecision: Explanation["humanDecision"];
  gateActionType: string | null;
  link: TimelineLink;
}

interface ToolCallEntry {
  name: string;
  at: Date;
  status: string | null;
  source: "run_log" | "tool_action";
  link: TimelineLink;
}

interface ContextEntry {
  fileId: string;
  name: string;
  contextRole: string | null;
  readAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function addMissing(missing: string[], key: string) {
  if (!missing.includes(key)) missing.push(key);
}

/**
 * Runs one section. A failing source (for example a table that a sibling sprint has not migrated yet)
 * is recorded in `missing` instead of failing the whole explanation.
 */
async function safe<T>(missing: string[], key: string, load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load();
  } catch {
    addMissing(missing, key);
    return fallback;
  }
}

function runSummary(run: RunRow): string {
  const summary = isRecord(run.resultJson) ? str(run.resultJson.summary) : null;
  const base = `Estado: ${run.status}`;
  return summary ? `${base} · ${summary.slice(0, 200)}` : base;
}

function resultLink(result: ResultRow): TimelineLink {
  switch (result.kind) {
    case "proposal":
      return { type: "proposal", id: result.id };
    case "decision":
      return { type: "decision", id: result.id };
    case "playbook_run":
      return { type: "playbook_run", id: result.id };
    case "run":
      return { type: "run", id: result.id };
    default:
      return null;
  }
}

export function agentExplainService(db: Db) {
  async function loadRun(companyId: string, runId: string): Promise<RunRow | null> {
    const [row] = await db
      .select()
      .from(heartbeatRuns)
      .where(and(eq(heartbeatRuns.id, runId), eq(heartbeatRuns.companyId, companyId)))
      .limit(1);
    return row ?? null;
  }

  /** Best effort for proposals: the agent's latest run that started at or before `at`. */
  async function latestRunOfAgentBefore(companyId: string, agentId: string, at: Date): Promise<string | null> {
    const [row] = await db
      .select({ id: heartbeatRuns.id })
      .from(heartbeatRuns)
      .where(and(
        eq(heartbeatRuns.companyId, companyId),
        eq(heartbeatRuns.agentId, agentId),
        lte(heartbeatRuns.startedAt, at),
      ))
      .orderBy(desc(heartbeatRuns.startedAt))
      .limit(1);
    return row?.id ?? null;
  }

  async function resolveTarget(companyId: string, kind: AgentActionKind, actionId: string): Promise<ActionTarget> {
    const missingAction = () => notFound("Agent action not found");

    if (kind === "run") {
      const run = await loadRun(companyId, actionId);
      if (!run) throw missingAction();
      return {
        title: "Ejecución del agente",
        at: run.startedAt ?? run.createdAt,
        agentId: run.agentId,
        runId: run.id,
        run,
        issueId: run.issueId,
        result: { kind: "run", id: run.id, summary: runSummary(run) },
        humanDecision: null,
        gateActionType: null,
        link: { type: "run", id: run.id },
      };
    }

    if (kind === "decision") {
      const [row] = await db
        .select()
        .from(decisions)
        .where(and(eq(decisions.id, actionId), eq(decisions.companyId, companyId)))
        .limit(1);
      if (!row) throw missingAction();
      const commercial = isRecord(row.metadata) && isRecord(row.metadata.commercial) ? row.metadata.commercial : null;
      const commercialLabel = [str(commercial?.type), str(commercial?.subject)].filter(Boolean).join(": ");
      const runId = row.originRunId ?? null;
      const run = runId ? await loadRun(companyId, runId) : null;
      return {
        title: commercialLabel ? `${row.title} · ${commercialLabel}` : row.title,
        at: row.createdAt,
        agentId: row.originAgentId,
        runId,
        run,
        issueId: row.originIssueId,
        result: {
          kind: "decision",
          id: row.id,
          summary: [row.status, row.chosenOptionId ? `opción ${row.chosenOptionId}` : null, commercialLabel || null]
            .filter(Boolean)
            .join(" · "),
        },
        humanDecision: {
          decisionId: row.id,
          status: row.status,
          chosenOptionId: row.chosenOptionId ?? null,
          decidedByUserId: row.decidedByUserId ?? null,
          decidedAt: iso(row.decidedAt),
        },
        gateActionType: str(commercial?.shadowActionType),
        link: { type: "decision", id: row.id },
      };
    }

    if (kind === "tool_action") {
      const [req] = await db
        .select()
        .from(toolActionRequests)
        .where(and(eq(toolActionRequests.id, actionId), eq(toolActionRequests.companyId, companyId)))
        .limit(1);
      if (!req) throw missingAction();
      const [invocation] = await db
        .select()
        .from(toolInvocations)
        .where(eq(toolInvocations.id, req.invocationId))
        .limit(1);
      const issueId = req.issueId ?? invocation?.issueId ?? null;
      const agentId = req.requestedByAgentId ?? invocation?.agentId ?? null;
      // The request row has no run column: use the invocation's run, otherwise the issue's latest run by the same agent before the request.
      let runId = invocation?.runId ?? null;
      if (!runId && issueId && agentId) {
        const [candidate] = await db
          .select({ id: heartbeatRuns.id })
          .from(heartbeatRuns)
          .where(and(
            eq(heartbeatRuns.companyId, companyId),
            eq(heartbeatRuns.agentId, agentId),
            eq(heartbeatRuns.issueId, issueId),
            lte(heartbeatRuns.createdAt, req.createdAt),
          ))
          .orderBy(desc(heartbeatRuns.createdAt))
          .limit(1);
        runId = candidate?.id ?? null;
      }
      const run = runId ? await loadRun(companyId, runId) : null;
      return {
        title: `Herramienta: ${invocation?.toolName ?? "desconocida"}`,
        at: req.createdAt,
        agentId,
        runId,
        run,
        issueId,
        result: { kind: "tool_action", id: req.id, summary: `Estado: ${req.status}` },
        humanDecision: null,
        gateActionType: null,
        link: null,
      };
    }

    if (kind === "proposal") {
      const [proposal] = await db
        .select()
        .from(proposals)
        .where(and(eq(proposals.id, actionId), eq(proposals.companyId, companyId)))
        .limit(1);
      if (!proposal) throw missingAction();
      const runId = proposal.createdByAgentId
        ? await latestRunOfAgentBefore(companyId, proposal.createdByAgentId, proposal.createdAt)
        : null;
      const run = runId ? await loadRun(companyId, runId) : null;
      return {
        title: `Propuesta: ${proposal.title}`,
        at: proposal.createdAt,
        agentId: proposal.createdByAgentId ?? null,
        runId,
        run,
        issueId: null,
        result: { kind: "proposal", id: proposal.id, summary: `${proposal.status} · revision ${proposal.revision}` },
        humanDecision: null,
        gateActionType: "proposal",
        link: { type: "proposal", id: proposal.id },
      };
    }

    // playbook_run
    const [playbookRun] = await db
      .select()
      .from(playbookRuns)
      .where(and(eq(playbookRuns.id, actionId), eq(playbookRuns.companyId, companyId)))
      .limit(1);
    if (!playbookRun) throw missingAction();
    const [playbook] = await db
      .select({ name: playbooks.name })
      .from(playbooks)
      .where(eq(playbooks.id, playbookRun.playbookId))
      .limit(1);
    const runId = playbookRun.lastRunId ?? null;
    const run = runId ? await loadRun(companyId, runId) : null;
    return {
      title: `Playbook: ${playbook?.name ?? playbookRun.playbookId}`,
      at: playbookRun.lastActionAt ?? playbookRun.createdAt,
      agentId: playbookRun.agentId ?? null,
      runId,
      run,
      issueId: null,
      result: {
        kind: "playbook_run",
        id: playbookRun.id,
        summary: `${playbookRun.status} · paso ${playbookRun.currentStepIndex + 1}`,
      },
      humanDecision: null,
      gateActionType: null,
      link: { type: "playbook_run", id: playbookRun.id },
    };
  }

  async function loadContext(companyId: string, runId: string | null, issueId: string | null): Promise<ContextEntry[]> {
    if (!runId && !issueId) return [];
    // Reads attributed to the run, plus reads of the run's issue that carry no run attribution.
    const scope = runId && issueId
      ? or(eq(companyFileReads.runId, runId), and(isNull(companyFileReads.runId), eq(companyFileReads.issueId, issueId)))
      : runId
        ? eq(companyFileReads.runId, runId)
        : eq(companyFileReads.issueId, issueId as string);
    const rows = await db
      .select({
        fileId: companyFileReads.fileId,
        name: companyFiles.name,
        contextRole: companyFiles.contextRole,
        readAt: companyFileReads.createdAt,
      })
      .from(companyFileReads)
      .innerJoin(companyFiles, eq(companyFiles.id, companyFileReads.fileId))
      .where(and(eq(companyFileReads.companyId, companyId), scope))
      .orderBy(asc(companyFileReads.createdAt))
      .limit(100);
    return rows.map((row) => ({
      fileId: row.fileId,
      name: row.name,
      contextRole: row.contextRole ?? null,
      readAt: row.readAt.toISOString(),
    }));
  }

  async function loadRunToolEvents(companyId: string, runId: string): Promise<ToolCallEntry[]> {
    const rows = await db
      .select({
        seq: heartbeatRunEvents.seq,
        message: heartbeatRunEvents.message,
        payload: heartbeatRunEvents.payload,
        eventType: heartbeatRunEvents.eventType,
        createdAt: heartbeatRunEvents.createdAt,
      })
      .from(heartbeatRunEvents)
      .where(and(
        eq(heartbeatRunEvents.companyId, companyId),
        eq(heartbeatRunEvents.runId, runId),
        inArray(heartbeatRunEvents.eventType, RUN_TOOL_EVENT_TYPES),
      ))
      .orderBy(asc(heartbeatRunEvents.seq))
      .limit(200);
    return rows.map((row) => {
      const payload = isRecord(row.payload) ? row.payload : {};
      const name = str(payload.toolName) ?? str(payload.name) ?? str(payload.tool) ?? str(row.message) ?? row.eventType;
      return {
        name,
        at: row.createdAt,
        status: str(payload.status),
        source: "run_log",
        link: { type: "run", id: runId },
      };
    });
  }

  async function loadToolActions(
    companyId: string,
    scope: { runId: string | null; issueId: string | null; agentId: string | null; actionId: string | null },
  ): Promise<ToolCallEntry[]> {
    if (!scope.runId && !scope.issueId && !scope.actionId) return [];
    const runScope = scope.runId ? eq(toolInvocations.runId, scope.runId) : undefined;
    const issueScope = scope.issueId
      ? and(
          eq(toolActionRequests.issueId, scope.issueId),
          scope.agentId ? eq(toolActionRequests.requestedByAgentId, scope.agentId) : undefined,
          isNull(toolInvocations.runId),
        )
      : undefined;
    const actionScope = scope.actionId ? eq(toolActionRequests.id, scope.actionId) : undefined;
    const rows = await db
      .select({
        status: toolActionRequests.status,
        createdAt: toolActionRequests.createdAt,
        toolName: toolInvocations.toolName,
      })
      .from(toolActionRequests)
      .innerJoin(toolInvocations, eq(toolInvocations.id, toolActionRequests.invocationId))
      .where(and(eq(toolActionRequests.companyId, companyId), or(runScope, issueScope, actionScope)))
      .orderBy(asc(toolActionRequests.createdAt))
      .limit(100);
    return rows.map((row) => ({
      name: row.toolName,
      at: row.createdAt,
      status: row.status,
      source: "tool_action",
      link: null,
    }));
  }

  /**
   * The policy in force at `at`: agent-specific row first, then the company-wide one.
   * With `actionType` null the latest grant of any action type is returned (used when the kind has no gate action).
   */
  async function loadPolicy(
    companyId: string,
    agentId: string | null,
    actionType: string | null,
    at: Date,
  ): Promise<PolicyRow | null> {
    const agentScope = agentId
      ? or(eq(autonomyPolicies.agentId, agentId), isNull(autonomyPolicies.agentId))
      : isNull(autonomyPolicies.agentId);
    const rows = await db
      .select()
      .from(autonomyPolicies)
      .where(and(
        eq(autonomyPolicies.companyId, companyId),
        actionType ? eq(autonomyPolicies.actionType, actionType) : undefined,
        agentScope,
        agentScope,
        lte(autonomyPolicies.grantedAt, at),
        or(isNull(autonomyPolicies.revokedAt), gt(autonomyPolicies.revokedAt, at)),
      ))
      .orderBy(desc(autonomyPolicies.grantedAt));
    const agentRow = agentId ? rows.find((row) => row.agentId === agentId) : undefined;
    return agentRow ?? rows.find((row) => row.agentId === null) ?? null;
  }

  async function loadRunDecision(companyId: string, runId: string): Promise<Explanation["humanDecision"]> {
    const [row] = await db
      .select()
      .from(decisions)
      .where(and(
        eq(decisions.companyId, companyId),
        eq(decisions.originRunId, runId),
        isNotNull(decisions.decidedAt),
      ))
      .orderBy(desc(decisions.decidedAt))
      .limit(1);
    if (!row) return null;
    return {
      decisionId: row.id,
      status: row.status,
      chosenOptionId: row.chosenOptionId ?? null,
      decidedByUserId: row.decidedByUserId ?? null,
      decidedAt: iso(row.decidedAt),
    };
  }

  async function explain(companyId: string, kind: AgentActionKind, actionId: string): Promise<Explanation> {
    if (!UUID_RE.test(actionId)) throw notFound("Agent action not found");
    const target = await resolveTarget(companyId, kind, actionId);
    const missing: string[] = [];
    const actionAt = target.at ?? new Date();
    const runId = target.runId;
    const run = target.run;
    if (!run) addMissing(missing, "run");

    const issueId = target.issueId ?? run?.issueId ?? null;
    const agentId = target.agentId ?? run?.agentId ?? null;

    const agent = agentId
      ? await safe(missing, "agent", async () => {
          const [row] = await db
            .select({ id: agents.id, name: agents.name })
            .from(agents)
            .where(and(eq(agents.id, agentId), eq(agents.companyId, companyId)))
            .limit(1);
          if (!row) throw new Error("agent not found");
          return row;
        }, null)
      : null;

    const issue = issueId
      ? await safe(missing, "issue", async () => {
          const [row] = await db
            .select({ id: issues.id, title: issues.title })
            .from(issues)
            .where(and(eq(issues.id, issueId), eq(issues.companyId, companyId)))
            .limit(1);
          return row ?? null;
        }, null)
      : null;

    const contextUsed = await safe(missing, "context", () => loadContext(companyId, runId, issueId), [] as ContextEntry[]);

    const runTools = run
      ? await safe(missing, "tools", () => loadRunToolEvents(companyId, run.id), [] as ToolCallEntry[])
      : [];
    const actionTools = await safe(
      missing,
      "tools",
      () => loadToolActions(companyId, {
        runId,
        issueId,
        agentId,
        actionId: kind === "tool_action" ? actionId : null,
      }),
      [] as ToolCallEntry[],
    );
    const toolsCalled = [...runTools, ...actionTools].sort((a, b) => a.at.getTime() - b.at.getTime());

    let gate: Explanation["gate"] = { applied: false, actionType: null, levelAtTheTime: null, policyId: null };
    let policy: PolicyRow | null = null;
    if (target.gateActionType) {
      const actionType = target.gateActionType;
      policy = await safe(missing, "autonomy", () => loadPolicy(companyId, agentId, actionType, actionAt), null);
      gate = {
        applied: policy !== null,
        actionType,
        levelAtTheTime: policy?.level ?? null,
        policyId: policy?.id ?? null,
      };
    } else if (agentId) {
      // No action-specific gate for this kind: report the autonomy the agent operated under at that time, without claiming a gate was applied.
      policy = await safe(missing, "autonomy", () => loadPolicy(companyId, agentId, null, actionAt), null);
      gate = {
        applied: false,
        actionType: policy?.actionType ?? null,
        levelAtTheTime: policy?.level ?? null,
        policyId: policy?.id ?? null,
      };
    }

    let humanDecision = target.humanDecision;
    if (!humanDecision && runId) {
      humanDecision = await safe(missing, "decision", () => loadRunDecision(companyId, runId), null);
    }

    const result: Explanation["result"] = target.result;

    const timeline: AgentExplainTimelineEntry[] = [];
    timeline.push({
      at: actionAt.toISOString(),
      kind: "note",
      title: target.title,
      detail: null,
      link: target.link,
    });
    if (run?.startedAt) {
      timeline.push({
        at: run.startedAt.toISOString(),
        kind: "run_event",
        title: "Ejecución iniciada",
        detail: `Estado: ${run.status}`,
        link: { type: "run", id: run.id },
      });
    }
    if (issue) {
      timeline.push({
        at: (run?.startedAt ?? actionAt).toISOString(),
        kind: "note",
        title: `Encargo: ${issue.title}`,
        detail: null,
        link: { type: "issue", id: issue.id },
      });
    }
    for (const row of contextUsed) {
      timeline.push({
        at: row.readAt,
        kind: "context_read",
        title: `Leyó: ${row.name}`,
        detail: row.contextRole,
        link: { type: "company_file", id: row.fileId },
      });
    }
    for (const call of toolsCalled) {
      timeline.push({
        at: call.at.toISOString(),
        kind: "tool_call",
        title: `Herramienta: ${call.name}`,
        detail: call.status,
        link: call.link,
      });
    }
    timeline.push({
      at: actionAt.toISOString(),
      kind: "gate",
      title: gate.applied && gate.actionType ? `Gate: ${gate.actionType}` : "Sin gate de autonomía",
      detail: gate.levelAtTheTime ? `Nivel: ${gate.levelAtTheTime}` : null,
      link: null,
    });
    if (policy) {
      timeline.push({
        at: actionAt.toISOString(),
        kind: "autonomy",
        title: `Autonomía vigente: ${policy.level}`,
        detail: `${policy.actionType} · concedida ${policy.grantedAt.toISOString()}`,
        link: null,
      });
    }
    if (humanDecision) {
      timeline.push({
        at: humanDecision.decidedAt ?? actionAt.toISOString(),
        kind: "decision",
        title: `Decisión humana: ${humanDecision.status}`,
        detail: humanDecision.chosenOptionId ? `Opción: ${humanDecision.chosenOptionId}` : null,
        link: { type: "decision", id: humanDecision.decisionId },
      });
    }
    if (result) {
      timeline.push({
        at: (run?.finishedAt ?? actionAt).toISOString(),
        kind: "result",
        title: result.summary,
        detail: result.kind,
        link: resultLink(result),
      });
    }
    timeline.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

    return {
      companyId,
      action: { kind, id: actionId, title: target.title, at: iso(target.at) },
      agent: agent ? { id: agent.id, name: agent.name } : null,
      run: run
        ? {
            id: run.id,
            issueId: run.issueId ?? null,
            status: run.status,
            startedAt: iso(run.startedAt),
            finishedAt: iso(run.finishedAt),
          }
        : null,
      contextUsed,
      toolsCalled: toolsCalled.map((call) => ({
        name: call.name,
        at: call.at.toISOString(),
        status: call.status,
        source: call.source,
      })),
      gate,
      humanDecision,
      result,
      timeline,
      missing,
    };
  }

  return { explain };
}
