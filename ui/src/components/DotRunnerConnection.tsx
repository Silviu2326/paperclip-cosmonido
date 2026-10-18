import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useTranslation } from "@/i18n";
import { Button } from "./ui/button";
import { buildDotSetupPrompt } from "../lib/dot-setup-prompt";
import { AgentSetupPrompt } from "./AgentSetupPrompt";

interface Connection {
  enabled: boolean;
  resourceUrl: string | null;
  binding: { id: string; status: string; connected: boolean; subscriptionVerified: boolean; hasPendingChallenge: boolean;
    assignment?: { status: string; attentionRequired: boolean } | null } | null;
}

/** Pairing codes stay in component memory and expire; never save them in config. */
export function DotRunnerConnection({ companyId, agentId, bindingId, onBinding }: {
  companyId?: string; agentId?: string; bindingId?: string; onBinding: (id: string) => void;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [pairing, setPairing] = useState<{ pairingCode: string; expiresAt: string } | null>(null);
  const path = `/companies/${companyId}/agents/${agentId}/dot-binding`;
  const key = ["dot-binding", companyId, agentId];
  const state = useQuery({ queryKey: key, enabled: !!companyId && !!agentId,
    queryFn: () => api.get<Connection>(path),
    refetchInterval: query => query.state.data?.binding?.status === "pairing" ||
      (query.state.data?.binding?.connected && !query.state.data.binding.subscriptionVerified) ||
      query.state.data?.binding?.hasPendingChallenge || query.state.data?.binding?.assignment ? 5000 : false });
  const pair = useMutation({ mutationFn: () => api.post<{ bindingId: string; pairingCode: string; expiresAt: string }>(path, {}),
    onSuccess: result => { setPairing(result); onBinding(result.bindingId); void client.invalidateQueries({ queryKey: key }); } });
  const test = useMutation({ mutationFn: () => api.post(path + "/event-test", {}),
    onSuccess: () => { void client.invalidateQueries({ queryKey: key }); } });
  const revoke = useMutation({ mutationFn: () => api.delete(path),
    onSuccess: async () => {
      await client.cancelQueries({ queryKey: key });
      client.setQueryData<Connection>(key, previous => previous ? { ...previous, binding: null } : previous);
      setPairing(null); onBinding("");
      await client.invalidateQueries({ queryKey: key });
    } });
  useEffect(() => {
    if (!pairing) return;
    const timer = window.setTimeout(() => setPairing(null), Math.max(0, Date.parse(pairing.expiresAt) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [pairing]);
  const existingBindingId = state.data?.binding?.id;
  useEffect(() => {
    if (existingBindingId && existingBindingId !== bindingId && !revoke.isPending) onBinding(existingBindingId);
  }, [existingBindingId, bindingId, onBinding, revoke.isPending]);
  if (!agentId) return <p className="text-sm text-muted-foreground">{t("dotRunnerConnection.saveFirst")}</p>;
  const error = state.error ?? pair.error ?? test.error ?? revoke.error;
  const b = state.data?.binding;
  const setupPrompt = pairing && state.data?.resourceUrl && companyId && agentId
    ? buildDotSetupPrompt({ companyId, agentId, resourceUrl: state.data.resourceUrl, ...pairing })
    : "";
  return <div className="space-y-3">
    <p className="text-sm text-muted-foreground">{t("dotRunnerConnection.overview")}</p>
    {state.data && !state.data.enabled && <p className="text-sm text-muted-foreground">{t("dotRunnerConnection.enableExperimental")}</p>}
    {state.data?.resourceUrl && <p className="text-sm break-all">{t("dotRunnerConnection.mcpUrlLabel")} <code>{state.data.resourceUrl}</code></p>}
    {b && <p className="text-sm">{t("dotRunnerConnection.connectionStatus", { status: b.status })} {t("dotRunnerConnection.eventSubscription", { value: b.subscriptionVerified ? t("dotRunnerConnection.verified") : t("dotRunnerConnection.required") })}</p>}
    {b?.assignment && <p className="text-sm">{t("dotRunnerConnection.assignment", { value: b.assignment.status === "offered" ? t("dotRunnerConnection.waitingAccept") : t("dotRunnerConnection.acceptedByDot") })}</p>}
    {b?.assignment?.attentionRequired && <p className="text-sm text-destructive" role="alert">{t("dotRunnerConnection.inactiveWarning")}</p>}
    {pairing && setupPrompt && b?.status === "pairing" && <div className="space-y-2">
      <AgentSetupPrompt
        prompt={setupPrompt}
        label={t("dotRunnerConnection.setupLabel")}
        agent={{ name: "Dot", src: "/brands/adapters/openai-dot.svg" }}
        title={t("dotRunnerConnection.setupTitle")}
        description={t("dotRunnerConnection.setupDescription")}
        side="bottom"
      />
      <p className="text-xs text-muted-foreground">{t("dotRunnerConnection.setupExpires", { time: new Date(pairing.expiresAt).toLocaleTimeString() })}</p>
    </div>}
    {!pairing && b?.status === "pairing" && <p className="text-sm text-muted-foreground">{t("dotRunnerConnection.revokeAndPairAgain")}</p>}
    <div className="flex flex-wrap items-center gap-2">
      {!b && <Button type="button" variant="outline" disabled={!state.data?.enabled || !state.data?.resourceUrl || pair.isPending} onClick={() => pair.mutate()}>{t("dotRunnerConnection.pairDot")}</Button>}
      {b?.subscriptionVerified && <Button type="button" variant="outline" disabled={test.isPending || b.hasPendingChallenge} onClick={() => test.mutate()}>{t("dotRunnerConnection.testEvent")}</Button>}
      <Button type="button" variant="outline" onClick={() => { void state.refetch(); }}>{t("dotRunnerConnection.refresh")}</Button>
      {b && <Button type="button" variant="outline" disabled={revoke.isPending} onClick={() => revoke.mutate()}>{t("dotRunnerConnection.revoke")}</Button>}
    </div>
    {b?.hasPendingChallenge && <p className="text-sm text-muted-foreground">{t("dotRunnerConnection.pendingChallenge")}</p>}
    {error && <p className="text-sm text-destructive" role="alert">{error instanceof Error ? error.message : t("dotRunnerConnection.connectionFailed")}</p>}
  </div>;
}
