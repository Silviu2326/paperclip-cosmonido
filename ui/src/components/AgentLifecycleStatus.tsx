import { useQuery } from "@tanstack/react-query";
import { agentsApi } from "../api/agents";
import { queryKeys } from "../lib/queryKeys";
import type { Agent, AgentLifecycleState } from "@paperclipai/shared";
import { Loader2 } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { t, useTranslation } from "@/i18n";

function getPhases() {
  return {
  preparing: [t("agentLifecycleStatus.phase.preparing.title"), t("agentLifecycleStatus.phase.preparing.description")],
  verifying: [t("agentLifecycleStatus.phase.verifying.title"), t("agentLifecycleStatus.phase.verifying.description")],
  pausing: [t("agentLifecycleStatus.phase.pausing.title"), t("agentLifecycleStatus.phase.pausing.description")],
  resuming: [t("agentLifecycleStatus.phase.resuming.title"), t("agentLifecycleStatus.phase.resuming.description")],
  terminating: [t("agentLifecycleStatus.phase.terminating.title"), t("agentLifecycleStatus.phase.terminating.description")],
  cleaning_up: [t("agentLifecycleStatus.phase.cleaningUp.title"), t("agentLifecycleStatus.phase.cleaningUp.description")],
  } satisfies Partial<Record<AgentLifecycleState, [string, string]>>;
}

function getFailedPhases() {
  return {
  preparing: t("agentLifecycleStatus.failed.preparing"), verifying: t("agentLifecycleStatus.failed.verifying"),
  pausing: t("agentLifecycleStatus.failed.pausing"), resuming: t("agentLifecycleStatus.failed.resuming"),
  terminating: t("agentLifecycleStatus.failed.terminating"), cleaning_up: t("agentLifecycleStatus.failed.cleaningUp"),
  };
}

function pendingPhase(state?: AgentLifecycleState) {
  const phases = getPhases();
  return state && state in phases ? phases[state as keyof typeof phases] : undefined;
}

export function agentLifecycleRefetchInterval(state?: AgentLifecycleState) {
  return pendingPhase(state) ? 2_000 : 30_000;
}

/** Poll lifecycle fields without refreshing the record used by editable forms. */
export function useAgentLifecycleStatus(agent?: Agent) {
  return useQuery({
    queryKey: [...queryKeys.agents.detail(agent?.id ?? ""), "lifecycle", agent?.companyId],
    queryFn: () => agentsApi.get(agent!.id, agent!.companyId),
    enabled: Boolean(agent),
    select: current => ({ status: current.status, lifecycleState: current.lifecycleState,
      lifecycleVersion: current.lifecycleVersion, lifecycleError: current.lifecycleError }),
    refetchInterval: query => agentLifecycleRefetchInterval(query.state.data?.lifecycleState ?? agent?.lifecycleState),
  });
}

export function AgentLifecycleStatus({ agent, onRetry, retryPending, refreshError = false }: {
  agent: Pick<Agent, "lifecycleState" | "lifecycleError">;
  onRetry: () => void;
  retryPending: boolean;
  refreshError?: boolean;
}) {
  const { t } = useTranslation();
  const failedPhases = getFailedPhases();
  const phase = pendingPhase(agent.lifecycleState);
  if (!phase && !refreshError) return null;
  return <div role="status" aria-live="polite" className="space-y-2 text-sm">
    {refreshError && <p className="text-destructive">{t("agentLifecycleStatus.refreshError")}</p>}
    {phase && <div className="flex flex-wrap items-center gap-2">
      <Badge variant={agent.lifecycleError ? "destructive" : "secondary"}>
        {!agent.lifecycleError && <Loader2 aria-hidden="true" className="mr-1 size-3 animate-spin motion-reduce:animate-none" />}
        {agent.lifecycleError ? failedPhases[agent.lifecycleState as keyof typeof failedPhases] : phase[0]}
      </Badge>
      {!agent.lifecycleError && <span className="text-muted-foreground">{phase[1]}</span>}
    </div>}
    {phase && agent.lifecycleError && <div className="flex flex-wrap items-center gap-2 text-destructive">
      <span>{agent.lifecycleError}</span>
      <Button variant="outline" size="sm" disabled={retryPending} onClick={onRetry}>
        {retryPending ? t("agentLifecycleStatus.retrying") : t("agentLifecycleStatus.retryNow")}
      </Button>
    </div>}
    {phase && agent.lifecycleError && <p className="text-muted-foreground">{t("agentLifecycleStatus.autoRetry")}</p>}
  </div>;
}
