import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { SelectPopover } from "@/components/ui/select";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { agentsApi } from "@/api/agents";
import { accessApi } from "@/api/access";
import { conversationDispatchApi, type ConversationDispatchSettings as Settings } from "@/api/conversation-dispatch";
import { useTranslation } from "@/i18n";

const EMPTY: Settings = { enabled: false, agentId: "", responsibleUserId: "" };

export function ConversationDispatchSettings({ companyId, userId, webchatActive }: { companyId: string; userId: string; webchatActive: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const queryKey = ["conversation-agent-dispatch", companyId, userId] as const;
  const [draft, setDraft] = useState<Settings>(EMPTY);
  const [notice, setNotice] = useState<string | null>(null);
  const settingsQuery = useQuery({ queryKey, queryFn: () => conversationDispatchApi.get(companyId), enabled: Boolean(companyId) });
  const agentsQuery = useQuery({ queryKey: ["conversation-agent-dispatch", "agents", companyId, userId], queryFn: () => agentsApi.list(companyId), enabled: Boolean(companyId) });
  const usersQuery = useQuery({ queryKey: ["conversation-agent-dispatch", "users", companyId, userId], queryFn: () => accessApi.listUserDirectory(companyId), enabled: Boolean(companyId) });

  useEffect(() => {
    setDraft(settingsQuery.data ? { ...settingsQuery.data } : EMPTY);
    setNotice(null);
  }, [settingsQuery.data, companyId, userId]);

  const agents = useMemo(() => (agentsQuery.data ?? []).filter((agent) => ["idle", "running", "active"].includes(agent.status)), [agentsQuery.data]);
  const users = usersQuery.data?.users ?? [];
  const current = settingsQuery.data ?? EMPTY;
  const dirty = draft.enabled !== current.enabled || draft.agentId !== current.agentId || draft.responsibleUserId !== current.responsibleUserId;

  const save = useMutation({
    mutationFn: () => conversationDispatchApi.save(companyId, draft),
    onSuccess: async (saved) => {
      queryClient.setQueryData(queryKey, saved);
      setDraft(saved);
      setNotice(t("webchat.dispatchSaved", { defaultValue: "Automatic reply dispatch settings saved." }));
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  const loadError = settingsQuery.error ?? agentsQuery.error ?? usersQuery.error;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("webchat.dispatchTitle", { defaultValue: "Automatic agent replies" })}</CardTitle>
        <CardDescription>{t("webchat.dispatchDescription", { defaultValue: "Choose whether incoming web-chat messages can create a task and wake one approved agent. This is off until you explicitly enable it." })}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {loadError && <p role="alert" className="text-sm text-destructive">{t("webchat.dispatchLoadError", { defaultValue: "Could not load dispatch settings or eligible people." })}</p>}
        {(settingsQuery.isLoading || agentsQuery.isLoading || usersQuery.isLoading) && <p role="status" className="text-sm text-muted-foreground">{t("webchat.dispatchLoading", { defaultValue: "Loading agents and company users..." })}</p>}
        {!loadError && !settingsQuery.isLoading && !agentsQuery.isLoading && !usersQuery.isLoading && <>
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1"><Label htmlFor="conversation-dispatch-enabled">{t("webchat.dispatchEnabled", { defaultValue: "Allow automatic replies" })}</Label><p className="text-sm text-muted-foreground">{t("webchat.dispatchEnabledHelp", { defaultValue: "A new incoming web-chat message may create a task and request a run for the selected agent." })}</p></div>
            <ToggleSwitch id="conversation-dispatch-enabled" checked={draft.enabled} disabled={(!webchatActive && !draft.enabled) || !draft.agentId || !draft.responsibleUserId} onCheckedChange={(enabled) => { setDraft((value) => ({ ...value, enabled })); setNotice(null); }} />
          </div>
          {!webchatActive && <p role="status" className="text-sm text-muted-foreground">{t("webchat.dispatchNeedsWebchat", { defaultValue: "Turn on web chat before enabling automatic replies." })}</p>}
          <div className="flex flex-col gap-2">
            <Label htmlFor="conversation-dispatch-agent">{t("webchat.dispatchAgent", { defaultValue: "Agent" })}</Label>
            <SelectPopover aria-label={t("webchat.dispatchAgent", { defaultValue: "Agent" })} value={draft.agentId} onValueChange={(agentId) => { setDraft((value) => ({ ...value, agentId })); setNotice(null); }} placeholder={t("webchat.dispatchChooseAgent", { defaultValue: "Choose an available agent" })} options={agents.map((agent) => ({ value: agent.id, label: agent.name }))} disabled={agents.length === 0} />
            {!agents.length && <p className="text-sm text-muted-foreground">{t("webchat.dispatchNoAgents", { defaultValue: "No available agents belong to this company." })}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="conversation-dispatch-responsible">{t("webchat.dispatchResponsible", { defaultValue: "Responsible company user" })}</Label>
            <SelectPopover aria-label={t("webchat.dispatchResponsible", { defaultValue: "Responsible company user" })} value={draft.responsibleUserId} onValueChange={(responsibleUserId) => { setDraft((value) => ({ ...value, responsibleUserId })); setNotice(null); }} placeholder={t("webchat.dispatchChooseResponsible", { defaultValue: "Choose who is accountable" })} options={users.map(({ user, principalId }) => ({ value: principalId, label: user?.name?.trim() || user?.email || principalId }))} disabled={users.length === 0} />
            <p className="text-xs text-muted-foreground">{t("webchat.dispatchResponsibleHelp", { defaultValue: "Choose deliberately; no person is preselected. The server confirms this user has an active, write-capable company membership before saving." })}</p>
          </div>
          {save.error instanceof Error && <p role="alert" className="text-sm text-destructive">{t("webchat.dispatchSaveError", { defaultValue: "Could not save dispatch settings." })}</p>}
          {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <button type="button" className="text-sm text-muted-foreground underline underline-offset-2 disabled:opacity-50" onClick={() => setDraft(current)} disabled={!dirty || save.isPending}>{t("webchat.dispatchDiscard", { defaultValue: "Discard" })}</button>
            <button type="button" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50" onClick={() => save.mutate()} disabled={!dirty || !draft.agentId || !draft.responsibleUserId || (draft.enabled && !webchatActive) || save.isPending}>{save.isPending ? t("webchat.dispatchSaving", { defaultValue: "Saving..." }) : t("webchat.dispatchSave", { defaultValue: "Save dispatch settings" })}</button>
          </div>
        </>}
      </CardContent>
    </Card>
  );
}
