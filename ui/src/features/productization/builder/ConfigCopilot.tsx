import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccountIdentity } from "@/api/companies-query";
import { ApiError } from "@/api/client";
import { useTranslation } from "@/i18n";
import { Link } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { configurationCopilotApi as api } from "./copilot-api";

export function ConfigCopilot({ companyId }: { companyId: string }) {
  const identity = useAccountIdentity();
  if (!identity.settled || !identity.userId) return null;
  return <CopilotForPrincipal key={`${companyId}:${identity.userId}`} companyId={companyId} userId={identity.userId} />;
}

/** This explicit dialog shares the governed builder; ordinary chat never applies configuration implicitly. */
export function ConfigCopilotLauncher({ companyId }: { companyId: string }) {
  const { t } = useTranslation();
  return <Dialog><DialogTrigger asChild><Button type="button" variant="outline" size="sm">{t("configCopilot.launcher")}</Button></DialogTrigger><DialogContent className="max-h-dvh overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>{t("configCopilot.dialogTitle")}</DialogTitle><DialogDescription>{t("configCopilot.dialogDescription")}</DialogDescription></DialogHeader><ConfigCopilot companyId={companyId} /></DialogContent></Dialog>;
}

function CopilotForPrincipal({ companyId, userId }: { companyId: string; userId: string }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const key = ["configuration-copilot", companyId, userId];
  const snapshot = useQuery({ queryKey: [...key, "snapshot"], queryFn: ({ signal }) => api.snapshot(companyId, signal), retry: false });
  const availability = useQuery({ queryKey: [...key, "availability"], queryFn: ({ signal }) => api.availability(companyId, signal), retry: false });
  const [message, setMessage] = useState("");
  const [draftId, setDraftId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [scenario, setScenario] = useState("");
  const [error, setError] = useState("");
  const requestKeys = useRef(new Map<string, string>());
  const requestKey = (kind: string, value: string) => {
    const fingerprint = `${kind}:${value}`;
    let key = requestKeys.current.get(fingerprint);
    if (!key) { key = crypto.randomUUID(); requestKeys.current.set(fingerprint, key); }
    return key;
  };
  const refresh = async () => { await Promise.all([client.invalidateQueries({ queryKey: key }), client.invalidateQueries({ queryKey: ["productization", "builder", companyId] }), client.invalidateQueries({ queryKey: ["routines"] })]); };
  const drafts = snapshot.data?.journey.builderDrafts ?? [];
  const draft = drafts.find(item => item.id === draftId);
  const latest = draft?.versions.at(-1);
  const application = draft?.applications?.at(-1);
  const sandbox = draft?.sandboxRuns?.at(-1);
  const revision = () => { if (!snapshot.data) throw new Error(t("configCopilot.journeyFirst")); return snapshot.data.revision; };
  const fail = (cause: Error) => {
    let message = t("configCopilot.actionError");
    if (cause instanceof ApiError) {
      const body = cause.body && typeof cause.body === "object" ? cause.body as Record<string, unknown> : {};
      const details = body.details && typeof body.details === "object" ? body.details as Record<string, unknown> : {};
      const code = [body.code, details.code].find((value): value is string => typeof value === "string") ?? "";
      if (code.includes("outcome_unknown") || code.includes("request_outcome_unknown") || code.includes("request_in_progress")) message = t("configCopilot.outcomeUnknown");
      else if (cause.status === 403 || /grant|authorization|connection_revoked/.test(code)) message = t("configCopilot.grantRevoked");
      else if (/budget|limit/.test(code) || cause.status === 402 || cause.status === 429) message = t("configCopilot.budgetBlocked");
      else if (/model_unavailable|decision_model/.test(code)) message = t("configCopilot.knownModelUnavailable");
      else if (/revision_conflict|version_conflict|version_not_latest/.test(code)) message = t("configCopilot.versionConflict");
    }
    setError(message);
    void refresh();
  };
  const propose = useMutation({ mutationFn: async () => {
    const result = await api.propose(companyId, { expectedRevision: revision(), idempotencyKey: requestKey("proposal", `${draftId}:${message.trim()}`), ...(draftId ? { draftId, baseVersion: latest?.version } : {}), message: message.trim() });
    if (result.status !== "saved") throw new Error(result.status === "unavailable" ? `${t("configCopilot.modelUnavailable")}.` : t("configCopilot.proposalNotSaved"));
    return result;
  }, onSuccess: async result => { setDraftId(result.draftId); setMessage(""); setError(""); await refresh(); }, onError: fail });
  const plan = useMutation({ mutationFn: () => {
    if (!draft || !latest || !agentId) throw new Error(t("configCopilot.chooseProposalAgent"));
    return api.plan(companyId, { expectedRevision: revision(), idempotencyKey: requestKey("plan", `${draft.id}:${latest.version}:${agentId}`), draftId: draft.id, version: latest.version, assigneeAgentId: agentId, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
  }, onSuccess: async () => { setError(""); await refresh(); }, onError: fail });
  const apply = useMutation({ mutationFn: (changeId: string) => {
    if (!draft || !application) throw new Error(t("configCopilot.preparePlan"));
    return api.apply(companyId, { expectedRevision: revision(), draftId: draft.id, applicationId: application.id, changeId });
  }, onSuccess: async () => { setError(""); await refresh(); }, onError: fail });
  const dryRun = useMutation({ mutationFn: async () => {
    if (!draft || !latest) throw new Error(t("configCopilot.chooseProposalSimulate"));
    const result = await api.sandbox(companyId, { expectedRevision: revision(), idempotencyKey: requestKey("sandbox", `${draft.id}:${latest.version}:${scenario.trim()}`), draftId: draft.id, version: latest.version, scenario: scenario.trim() });
    if (result.status !== "saved") throw new Error(result.status === "unavailable" ? t("configCopilot.modelUnavailable") : t("configCopilot.simulationNoResult"));
    return result;
  }, onSuccess: async () => { setError(""); await refresh(); }, onError: fail });
  const pending = propose.isPending || plan.isPending || apply.isPending || dryRun.isPending;
  const modelAvailable = availability.data?.proposal.available === true;
  return <Card><CardHeader><CardTitle>{t("configCopilot.designTitle")}</CardTitle><CardDescription>{t("configCopilot.designDescription")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
    {snapshot.isPending ? <p role="status">{t("configCopilot.loading")}</p> : null}
    {snapshot.error ? <p role="alert">{snapshot.error.message} <Link to="/productization" className="underline">{t("configCopilot.openSetup")}</Link></p> : null}
    {availability.error ? <p role="alert">{availability.error.message}</p> : availability.data && !modelAvailable ? <p role="status">{t("configCopilot.configureModel")}</p> : null}
    <Label htmlFor="copilot-draft">{t("configCopilot.savedConversation")}</Label><select id="copilot-draft" className="h-9 rounded-md border bg-background px-3 text-sm" value={draftId} onChange={event => { setDraftId(event.target.value); setError(""); }} disabled={pending}><option value="">{t("configCopilot.newProposal")}</option>{drafts.map(item => <option key={item.id} value={item.id}>{item.versions.at(-1)?.selection.role} · v{item.versions.at(-1)?.version}</option>)}</select>
    {draft ? <ol className="flex flex-col gap-3" aria-label={t("configCopilot.proposalHistory")}>{draft.versions.map(version => <li key={version.version} className="rounded-md border p-3"><p className="text-sm">{version.description}</p><p className="mt-2 font-medium">{t("configCopilot.proposalVersion", { version: version.version, role: version.selection.role })}</p><p className="text-sm text-muted-foreground">{t("configCopilot.requestedResources", { skills: version.selection.skillIds.length, connections: version.selection.connectionIds.length, autonomy: version.selection.autonomy, budget: version.selection.monthlyBudgetUsd })}</p>{version.plan?.routines.length ? <p className="text-sm">{t("configCopilot.routines", { items: version.plan.routines.map(item => item.template === "daily_brief" ? t("configCopilot.dailyBriefRoutine") : t("configCopilot.leadAlertRoutine")).join(", ") })}</p> : null}{version.proposal ? <p className="text-xs text-muted-foreground">{t("configCopilot.model")}: {version.proposal.model ?? t("configCopilot.unidentified")} ? {version.proposal.usage.costStatus === "unpriced" ? t("configCopilot.unpriced") : t("configCopilot.cents", { value: version.proposal.usage.costCents ?? "0" })}</p> : null}</li>)}</ol> : null}
    <Label htmlFor="copilot-message">{t("configCopilot.message")}</Label><Textarea id="copilot-message" maxLength={2000} value={message} onChange={event => setMessage(event.target.value)} placeholder={t("configCopilot.prompt")} disabled={pending} /><Button onClick={() => propose.mutate()} disabled={!message.trim() || !snapshot.data || !modelAvailable || pending}>{propose.isPending ? t("configCopilot.preparing") : t("configCopilot.askProposal")}</Button>
    {latest ? <><Label htmlFor="copilot-agent">{t("configCopilot.routineAgent")}</Label><select id="copilot-agent" className="h-9 rounded-md border bg-background px-3 text-sm" value={agentId} onChange={event => setAgentId(event.target.value)} disabled={pending}><option value="">{t("configCopilot.chooseAgent")}</option>{snapshot.data?.availableAgents.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select><Button variant="outline" disabled={!agentId || pending} onClick={() => plan.mutate()}>{t("configCopilot.reviewChanges")}</Button></> : null}
    {application ? <section className="flex flex-col gap-3" aria-label={t("configCopilot.pendingChanges")}>{application.changes.map(change => { const receipt = application.results.find(item => item.changeId === change.changeId && item.outcome !== "failed"); return <div key={change.changeId} className="rounded-md border p-3"><p className="font-medium">{change.summary}</p>{change.diff.map((line, index) => <p key={index} className="text-sm text-muted-foreground">{line}</p>)}{change.blocker ? <p className="text-sm">{change.blocker}</p> : null}{receipt?.routineId ? <Link className="text-sm underline" to={`/routines/${receipt.routineId}`}>{t("configCopilot.openRoutine")}</Link> : change.status === "ready" ? <Button className="mt-2" variant="outline" disabled={pending || application.version !== latest?.version} onClick={() => apply.mutate(change.changeId)}>{t("configCopilot.confirmRoutine")}</Button> : null}</div>; })}</section> : null}
    {latest ? <section className="flex flex-col gap-2"><Label htmlFor="copilot-scenario">{t("configCopilot.rehearsal")}</Label><Textarea id="copilot-scenario" maxLength={1000} value={scenario} onChange={event => setScenario(event.target.value)} disabled={pending} /><p className="text-sm text-muted-foreground">{t("configCopilot.responseBehavior")}</p><Button variant="outline" disabled={!scenario.trim() || pending || availability.data?.sandbox.available !== true} onClick={() => dryRun.mutate()}>{t("configCopilot.rehearse")}</Button>{sandbox ? <p role="status" className="text-sm">{t("configCopilot.firstAction", { action: sandbox.answers.first_action?.type === "choice" ? sandbox.answers.first_action.choice : t("configCopilot.noAnswer"), version: sandbox.version })}</p> : null}</section> : null}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
  </CardContent></Card>;
}
