import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { SALES_STAGE_KEYS, type Opportunity, type SalesStageKey } from "@paperclipai/shared";
import { useTranslation } from "@/i18n";
import { crmApi } from "@/api/crm";
import { queryKeys } from "@/lib/queryKeys";
import { salesDateInput, salesDateValue, salesOwnerIds, salesOwnerValue } from "@/lib/sales";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SalesCustomerPicker } from "./SalesCustomerPicker";
import { SalesOwnerSelect } from "./SalesOwnerSelect";

export const CUSTOMER_OPPORTUNITIES_KEY = "crm-customer-opportunities";

interface Props {
  open: boolean; onOpenChange: (open: boolean) => void; companyId: string; customerId?: string;
  opportunity?: Opportunity; initialStage?: SalesStageKey; onCreated?: (opportunity: Opportunity) => void;
}

export function OpportunityCreateDialog(props: Props) {
  // A fresh form per open; background query refreshes must not overwrite an unsaved draft.
  if (!props.open) return null;
  return <OpportunityForm key={props.opportunity?.id ?? "new"} {...props} />;
}

function OpportunityForm({ onOpenChange, companyId, customerId, opportunity, initialStage, onCreated }: Props) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [customer, setCustomer] = useState(opportunity?.customerId ?? customerId ?? "");
  const [title, setTitle] = useState(opportunity?.title ?? "");
  const [stage, setStage] = useState<SalesStageKey>(initialStage ?? "new");
  const [amount, setAmount] = useState(opportunity?.amountCents == null ? "" : String(opportunity.amountCents / 100));
  const [currency, setCurrency] = useState(opportunity?.currency ?? "EUR");
  const [probability, setProbability] = useState(opportunity?.probability == null ? "" : String(opportunity.probability));
  const [closeAt, setCloseAt] = useState(salesDateInput(opportunity?.expectedCloseAt, true));
  const [nextAction, setNextAction] = useState(opportunity?.nextAction ?? "");
  const [nextAt, setNextAt] = useState(salesDateInput(opportunity?.nextActionAt));
  const [owner, setOwner] = useState(salesOwnerValue(opportunity?.ownerUserId ?? null, opportunity?.ownerAgentId ?? null));
  const [key] = useState(() => crypto.randomUUID());
  const [expectedVersion] = useState(opportunity?.version);
  const save = useMutation({
    mutationFn: () => {
      const ids = salesOwnerIds(owner);
      const data = {
        customerId: customer, title: title.trim(), amountCents: amount.trim() ? Math.round(Number(amount.replace(",", ".")) * 100) : null,
        currency: currency.trim().toUpperCase(), probability: probability === "" ? null : Number(probability),
        expectedCloseAt: salesDateValue(closeAt), nextAction: nextAction.trim() || null, nextActionAt: salesDateValue(nextAt),
        ownerUserId: ids.userId, ownerAgentId: ids.agentId,
      };
      return opportunity ? crmApi.opportunities.update(opportunity.id, { ...data, expectedVersion: expectedVersion! })
        : crmApi.opportunities.create(companyId, { ...data, stageKey: stage, idempotencyKey: key });
    },
    onSuccess: async (saved) => {
      client.setQueryData(["sales-opportunity", companyId, saved.id], saved);
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.opportunities.list(companyId) }),
        client.invalidateQueries({ queryKey: [CUSTOMER_OPPORTUNITIES_KEY] }),
        client.invalidateQueries({ queryKey: ["crm", "activities", companyId, "opportunity", saved.id] }),
      ]);
      onOpenChange(false);
      onCreated?.(saved);
    },
  });
  return <Dialog open onOpenChange={(open) => !save.isPending && onOpenChange(open)}>
    <DialogContent className="max-h-dvh overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>{t(opportunity ? "salesWorkspace.editOpportunity" : "crm.opportunities.create.title")}</DialogTitle></DialogHeader>
      <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); if (customer && title.trim() && !save.isPending) save.mutate(); }}>
        <div className="flex flex-col gap-1.5"><Label htmlFor="opportunity-title">{t("salesWorkspace.title")}</Label><Input id="opportunity-title" autoFocus required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} /></div>
        {!customerId && <div className="flex flex-col gap-1.5"><Label>{t("salesWorkspace.customer")}</Label><SalesCustomerPicker companyId={companyId} value={customer} onChange={setCustomer} /></div>}
        {!opportunity && <div className="flex flex-col gap-1.5"><Label htmlFor="opportunity-stage">{t("salesWorkspace.stage")}</Label><NativeSelect id="opportunity-stage" value={stage} onChange={(event) => setStage(event.target.value as SalesStageKey)}>{SALES_STAGE_KEYS.filter((value) => value !== "lost").map((value) => <option key={value} value={value}>{t(`crm.opportunities.stages.${value}`)}</option>)}</NativeSelect></div>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5"><Label htmlFor="opportunity-amount">{t("salesWorkspace.amount")}</Label><Input id="opportunity-amount" type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="opportunity-currency">{t("salesWorkspace.currency")}</Label><Input id="opportunity-currency" required minLength={3} maxLength={3} pattern="[A-Za-z]{3}" value={currency} onChange={(event) => setCurrency(event.target.value)} /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="opportunity-probability">{t("salesWorkspace.probability")}</Label><Input id="opportunity-probability" type="number" min="0" max="100" step="1" value={probability} onChange={(event) => setProbability(event.target.value)} /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="opportunity-close">{t("salesWorkspace.expectedClose")}</Label><Input id="opportunity-close" type="date" value={closeAt} onChange={(event) => setCloseAt(event.target.value)} /></div>
        </div>
        <div className="flex flex-col gap-1.5"><Label htmlFor="opportunity-owner">{t("salesWorkspace.owner")}</Label><SalesOwnerSelect id="opportunity-owner" companyId={companyId} value={owner} onChange={setOwner} /></div>
        <div className="flex flex-col gap-1.5"><Label htmlFor="opportunity-next">{t("salesWorkspace.nextAction")}</Label><Input id="opportunity-next" required={!!nextAt} maxLength={500} value={nextAction} onChange={(event) => setNextAction(event.target.value)} /></div>
        <div className="flex flex-col gap-1.5"><Label htmlFor="opportunity-next-at">{t("salesWorkspace.nextActionAt")}</Label><Input id="opportunity-next-at" type="datetime-local" value={nextAt} onChange={(event) => setNextAt(event.target.value)} /></div>
        {save.error && <p role="alert" className="text-sm text-destructive">{save.error.message}</p>}
        {save.error && <p className="text-xs text-muted-foreground">{t("salesWorkspace.conflictHint")}</p>}
        <div className="flex items-center justify-between gap-2"><Button type="button" variant="outline" disabled={save.isPending} onClick={() => onOpenChange(false)}>{t("salesWorkspace.cancel")}</Button><Button type="submit" disabled={!customer || !title.trim() || save.isPending}>{t(opportunity ? "salesWorkspace.save" : "crm.opportunities.create.submit")}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
