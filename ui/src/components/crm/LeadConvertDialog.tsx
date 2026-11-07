import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Lead } from "@paperclipai/shared";
import { leadsApi } from "@/api/leads";
import { useTranslation } from "@/i18n";
import { useNavigate } from "@/lib/router";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function LeadConvertDialog({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [key] = useState(() => crypto.randomUUID());
  const [title, setTitle] = useState(String(lead.payload.company || lead.payload.name || ""));
  const convert = useMutation({
    mutationFn: () => leadsApi.convert(lead.id, { createOpportunity: true, opportunityTitle: title.trim(), idempotencyKey: key }),
    onSuccess: async (saved) => {
      client.setQueryData(queryKeys.leads.detail(saved.id), saved);
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.leads.list(lead.companyId) }),
        client.invalidateQueries({ queryKey: queryKeys.opportunities.list(lead.companyId) }),
        client.invalidateQueries({ queryKey: queryKeys.customers.list(lead.companyId) }),
      ]);
      onClose();
      if (saved.opportunityId) navigate(`/sales/opportunities?opportunityId=${encodeURIComponent(saved.opportunityId)}`);
    },
  });
  return <Dialog open onOpenChange={(open) => !open && !convert.isPending && onClose()}>
    <DialogContent>
      <DialogHeader><DialogTitle>{t("salesWorkspace.convertLead")}</DialogTitle><DialogDescription>{t("salesWorkspace.convertDescription")}</DialogDescription></DialogHeader>
      <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); if (title.trim() && !convert.isPending) convert.mutate(); }}>
        <div className="flex flex-col gap-1.5"><Label htmlFor="convert-title">{t("salesWorkspace.title")}</Label><Input id="convert-title" required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} /></div>
        {convert.error && <p role="alert" className="text-sm text-destructive">{convert.error.message}</p>}
        <div className="flex items-center justify-between gap-2"><Button type="button" variant="outline" disabled={convert.isPending} onClick={onClose}>{t("salesWorkspace.cancel")}</Button><Button type="submit" disabled={!title.trim() || convert.isPending}>{t("salesWorkspace.convertLead")}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
