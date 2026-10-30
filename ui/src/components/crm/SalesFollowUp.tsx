import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CrmActivityKind } from "@paperclipai/shared";
import { crmApi } from "@/api/crm";
import { useTranslation } from "@/i18n";
import { salesDateValue } from "@/lib/sales";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";

export function SalesFollowUp({ companyId, subjectKind, subjectId, customerId }: {
  companyId: string; subjectKind: "lead" | "opportunity"; subjectId: string; customerId?: string;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [summary, setSummary] = useState("");
  const [kind, setKind] = useState<CrmActivityKind>("note");
  const [activityKey, setActivityKey] = useState(() => crypto.randomUUID());
  const [what, setWhat] = useState("");
  const [who, setWho] = useState<"us" | "them">("us");
  const [due, setDue] = useState("");
  const [commitmentKey, setCommitmentKey] = useState(() => crypto.randomUUID());
  const activity = useMutation({
    mutationFn: () => crmApi.activities.create(companyId, { subjectKind, subjectId, kind, summary: summary.trim(), idempotencyKey: activityKey }),
    onSuccess: () => { setSummary(""); setActivityKey(crypto.randomUUID()); void client.invalidateQueries({ queryKey: ["crm", "activities", companyId, subjectKind, subjectId] }); void client.invalidateQueries({ queryKey: ["leads", "activity", subjectId] }); },
  });
  const commitment = useMutation({
    mutationFn: () => crmApi.commitments.create(companyId, { what: what.trim(), who, dueAt: salesDateValue(due), opportunityId: subjectId, customerId, idempotencyKey: commitmentKey }),
    onSuccess: () => { setWhat(""); setDue(""); setCommitmentKey(crypto.randomUUID()); void client.invalidateQueries({ queryKey: ["crm", "commitments"] }); },
  });
  return <div className="flex flex-col gap-4">
    <form className="flex flex-col gap-2" onSubmit={(event) => { event.preventDefault(); if (summary.trim() && !activity.isPending) activity.mutate(); }}>
      <h3 className="text-sm font-medium">{t("salesWorkspace.recordActivity")}</h3>
      <Label htmlFor="activity-kind">{t("salesWorkspace.activityKind")}</Label><NativeSelect id="activity-kind" value={kind} onChange={(event) => setKind(event.target.value as CrmActivityKind)}>{(["note", "call", "email", "meeting", "task"] as const).map((value) => <option key={value} value={value}>{t(`crm.activities.kinds.${value}`)}</option>)}</NativeSelect>
      <Label htmlFor="activity-summary">{t("salesWorkspace.summary")}</Label><Textarea id="activity-summary" required maxLength={2000} value={summary} onChange={(event) => setSummary(event.target.value)} />
      {activity.error && <p role="alert" className="text-sm text-destructive">{activity.error.message}</p>}
      <Button type="submit" size="sm" disabled={!summary.trim() || activity.isPending}>{t("salesWorkspace.recordActivity")}</Button>
    </form>
    {subjectKind === "opportunity" && <form className="flex flex-col gap-2" onSubmit={(event) => { event.preventDefault(); if (what.trim() && !commitment.isPending) commitment.mutate(); }}>
      <h3 className="text-sm font-medium">{t("salesWorkspace.addCommitment")}</h3>
      <Label htmlFor="commitment-what">{t("salesWorkspace.commitment")}</Label><Input id="commitment-what" required maxLength={1000} value={what} onChange={(event) => setWhat(event.target.value)} />
      <Label htmlFor="commitment-who">{t("salesWorkspace.who")}</Label><NativeSelect id="commitment-who" value={who} onChange={(event) => setWho(event.target.value as "us" | "them")}><option value="us">{t("crm.commitments.who.us")}</option><option value="them">{t("crm.commitments.who.them")}</option></NativeSelect>
      <Label htmlFor="commitment-due">{t("salesWorkspace.dueAt")}</Label><Input id="commitment-due" type="datetime-local" value={due} onChange={(event) => setDue(event.target.value)} />
      {commitment.error && <p role="alert" className="text-sm text-destructive">{commitment.error.message}</p>}
      <Button type="submit" size="sm" disabled={!what.trim() || commitment.isPending}>{t("salesWorkspace.addCommitment")}</Button>
    </form>}
  </div>;
}
