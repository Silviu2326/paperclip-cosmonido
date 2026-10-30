import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Lead, LeadPriority } from "@paperclipai/shared";
import { leadsApi } from "@/api/leads";
import { useTranslation } from "@/i18n";
import { queryKeys } from "@/lib/queryKeys";
import { salesOwnerIds, salesOwnerValue } from "@/lib/sales";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SalesOwnerSelect } from "./SalesOwnerSelect";

export function LeadEditorDialog({ companyId, lead, onClose, onSaved }: { companyId: string; lead?: Lead; onClose: () => void; onSaved?: (lead: Lead) => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [fields, setFields] = useState(() => Object.fromEntries(["name", "company", "email", "phone", "message"].map((key) => [key, typeof lead?.payload[key] === "string" ? lead.payload[key] as string : ""])));
  const [priority, setPriority] = useState<LeadPriority>(lead?.priority ?? "normal");
  const [language, setLanguage] = useState(lead?.language ?? "");
  const [owner, setOwner] = useState(salesOwnerValue(lead?.assignedUserId ?? null, lead?.assignedAgentId ?? null));
  const [key] = useState(() => crypto.randomUUID());
  const save = useMutation({
    mutationFn: () => {
      const payload = { ...lead?.payload, ...Object.fromEntries(Object.entries(fields).map(([field, value]) => [field, value.trim()])) };
      const ids = salesOwnerIds(owner);
      return lead ? leadsApi.update(lead.id, { payload, priority, language: language.trim() || null, assignedUserId: ids.userId, assignedAgentId: ids.agentId })
        : leadsApi.create(companyId, { source: "manual", payload, priority, language: language.trim() || null, idempotencyKey: key });
    },
    onSuccess: async (saved) => {
      await client.invalidateQueries({ queryKey: queryKeys.leads.list(companyId) });
      client.setQueryData(queryKeys.leads.detail(saved.id), saved);
      void client.invalidateQueries({ queryKey: ["leads", "activity", saved.id] });
      onSaved?.(saved);
      onClose();
    },
  });
  function submit(event: FormEvent) { event.preventDefault(); if (fields.name.trim() && !save.isPending) save.mutate(); }
  return <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
    <DialogContent className="max-h-dvh overflow-y-auto">
      <DialogHeader><DialogTitle>{t(lead ? "salesWorkspace.editLead" : "salesWorkspace.newLead")}</DialogTitle></DialogHeader>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        {Object.entries(fields).map(([field, value]) => <div key={field} className="flex flex-col gap-1.5">
          <Label htmlFor={`lead-${field}`}>{t(`salesWorkspace.${field}`)}</Label>
          {field === "message" ? <Textarea id={`lead-${field}`} maxLength={2000} value={value} onChange={(event) => setFields({ ...fields, [field]: event.target.value })} />
            : <Input id={`lead-${field}`} type={field === "email" ? "email" : field === "phone" ? "tel" : "text"} required={field === "name"} maxLength={320} value={value} onChange={(event) => setFields({ ...fields, [field]: event.target.value })} />}
        </div>)}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5"><Label htmlFor="lead-priority">{t("salesWorkspace.priority")}</Label><NativeSelect id="lead-priority" value={priority} onChange={(event) => setPriority(event.target.value as LeadPriority)}>{(["low", "normal", "high"] as const).map((value) => <option key={value} value={value}>{t(`crm.leads.priority.${value}`)}</option>)}</NativeSelect></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="lead-language">{t("salesWorkspace.language")}</Label><Input id="lead-language" maxLength={10} value={language} onChange={(event) => setLanguage(event.target.value)} /></div>
        </div>
        {lead && <div className="flex flex-col gap-1.5"><Label htmlFor="lead-owner">{t("salesWorkspace.owner")}</Label><SalesOwnerSelect id="lead-owner" companyId={companyId} value={owner} onChange={setOwner} /></div>}
        {save.error && <p role="alert" className="text-sm text-destructive">{save.error.message}</p>}
        <div className="flex items-center justify-between gap-2"><Button type="button" variant="outline" disabled={save.isPending} onClick={onClose}>{t("salesWorkspace.cancel")}</Button><Button type="submit" disabled={!fields.name.trim() || save.isPending}>{t(lead ? "salesWorkspace.save" : "salesWorkspace.newLead")}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
