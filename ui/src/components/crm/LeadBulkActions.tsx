import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Lead } from "@paperclipai/shared";
import { leadsApi } from "@/api/leads";
import { useTranslation } from "@/i18n";
import { queryKeys } from "@/lib/queryKeys";
import { salesOwnerIds } from "@/lib/sales";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SalesOwnerSelect } from "./SalesOwnerSelect";

export interface LeadBulkResult { failedIds: string[]; succeeded: number; errors: string[] }

export function LeadBulkActions({ companyId, leads, onComplete }: { companyId: string; leads: Lead[]; onComplete: (result: LeadBulkResult) => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [owner, setOwner] = useState("");
  const [discarding, setDiscarding] = useState(false);
  const [reason, setReason] = useState("");
  const bulk = useMutation({
    mutationFn: async (action: "assign" | "triage" | "discard") => {
      const eligible = leads.filter((lead) => action === "assign" || (action === "triage" ? lead.status === "new" : lead.status !== "converted" && lead.status !== "discarded"));
      const result: LeadBulkResult = { failedIds: [], succeeded: 0, errors: [] };
      const ids = salesOwnerIds(owner);
      // Keep request concurrency bounded even when several loaded pages are selected.
      for (let start = 0; start < eligible.length; start += 4) {
        const batch = eligible.slice(start, start + 4);
        const outcomes = await Promise.allSettled(batch.map((lead) => action === "assign"
          ? leadsApi.update(lead.id, { assignedUserId: ids.userId, assignedAgentId: ids.agentId })
          : action === "triage" ? leadsApi.triage(lead.id, {}) : leadsApi.discard(lead.id, reason.trim())));
        outcomes.forEach((outcome, index) => {
          if (outcome.status === "fulfilled") { result.succeeded++; void client.invalidateQueries({ queryKey: queryKeys.leads.detail(batch[index].id) }); }
          else { result.failedIds.push(batch[index].id); result.errors.push(`${String(batch[index].payload.name ?? batch[index].payload.email ?? batch[index].id)}: ${outcome.reason instanceof Error ? outcome.reason.message : t("salesWorkspace.actionFailed")}`); }
        });
      }
      return result;
    },
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: queryKeys.leads.list(companyId) });
      setDiscarding(false); setReason(""); onComplete(result);
    },
  });
  return <div className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3">
    <span className="text-sm">{t("salesWorkspace.selectedCount", { count: leads.length })}</span>
    <SalesOwnerSelect companyId={companyId} value={owner} onChange={setOwner} />
    <Button size="sm" variant="outline" disabled={bulk.isPending} onClick={() => bulk.mutate("assign")}>{t(owner ? "salesWorkspace.assignSelected" : "salesWorkspace.unassignSelected")}</Button>
    <Button size="sm" variant="outline" disabled={bulk.isPending || !leads.some((lead) => lead.status === "new")} onClick={() => bulk.mutate("triage")}>{t("salesWorkspace.triageSelected")}</Button>
    <Button size="sm" variant="outline" disabled={bulk.isPending || !leads.some((lead) => lead.status !== "converted" && lead.status !== "discarded")} onClick={() => setDiscarding(true)}>{t("salesWorkspace.discardSelected")}</Button>
    <Dialog open={discarding} onOpenChange={(open) => !bulk.isPending && setDiscarding(open)}><DialogContent><DialogHeader><DialogTitle>{t("salesWorkspace.discardSelected")}</DialogTitle></DialogHeader><form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); if (reason.trim() && !bulk.isPending) bulk.mutate("discard"); }}><Label htmlFor="bulk-discard-reason">{t("crm.leads.discard.reasonLabel")}</Label><Input id="bulk-discard-reason" required maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /><div className="flex items-center justify-between gap-2"><Button type="button" variant="outline" disabled={bulk.isPending} onClick={() => setDiscarding(false)}>{t("salesWorkspace.cancel")}</Button><Button type="submit" variant="destructive" disabled={!reason.trim() || bulk.isPending}>{t("salesWorkspace.discardSelected")}</Button></div></form></DialogContent></Dialog>
  </div>;
}
