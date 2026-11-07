import { useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Opportunity, Proposal, ProposalScopeItem } from "@paperclipai/shared";
import { crmApi } from "@/api/crm";
import { proposalsApi } from "@/api/proposals";
import { useTranslation } from "@/i18n";
import { salesDateInput } from "@/lib/sales";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SalesCustomerPicker } from "./SalesCustomerPicker";

export function ProposalEditorDialog({ companyId, opportunity, proposal, customerId, onClose, onSaved }: {
  companyId: string; opportunity?: Opportunity; proposal?: Proposal; customerId?: string;
  onClose: () => void; onSaved: (proposal: Proposal) => void;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [key] = useState(() => crypto.randomUUID());
  const [selectedOpportunity, setSelectedOpportunity] = useState(opportunity);
  const [customer, setCustomer] = useState(proposal?.customerId ?? opportunity?.customerId ?? customerId ?? "");
  const [search, setSearch] = useState("");
  const [title, setTitle] = useState(proposal?.title ?? opportunity?.title ?? "");
  const [scope, setScope] = useState<Array<ProposalScopeItem & { rowKey: string }>>(() => (proposal?.scope ?? [{ title: opportunity?.title ?? "", quantity: 1, unitPriceCents: opportunity?.amountCents ?? 0 }]).map((row) => ({ ...row, rowKey: crypto.randomUUID() })));
  const [price, setPrice] = useState(String((proposal?.priceCents ?? opportunity?.amountCents ?? 0) / 100));
  const [currency, setCurrency] = useState(proposal?.currency ?? opportunity?.currency ?? "EUR");
  const [deposit, setDeposit] = useState(proposal?.depositCents == null ? "" : String(proposal.depositCents / 100));
  const [terms, setTerms] = useState(proposal?.terms ?? "");
  const [validUntil, setValidUntil] = useState(salesDateInput(proposal?.validUntil, true));
  const options = useInfiniteQuery({
    queryKey: ["sales-proposal-opportunities", companyId, search, customerId],
    queryFn: ({ pageParam }) => crmApi.opportunities.list(companyId, { q: search.trim() || undefined, customerId, cursor: pageParam, limit: 50 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !opportunity && !proposal,
  });
  const items = options.data?.pages.flatMap((page) => page.items) ?? [];
  const priceCents = Math.round(Number(price) * 100);
  const depositCents = deposit === "" ? null : Math.round(Number(deposit) * 100);
  const valid = title.trim() && customer && scope.length > 0 && scope.every((row) => row.title.trim()) && Number.isFinite(priceCents) && priceCents >= 0 && (depositCents === null || (Number.isFinite(depositCents) && depositCents >= 0 && depositCents <= priceCents));
  const save = useMutation({
    mutationFn: () => {
      const data = { title: title.trim(), scope: scope.map(({ rowKey: _rowKey, ...row }) => row), priceCents, depositCents,
        currency: currency.trim().toUpperCase(), terms: terms.trim() || null, validUntil: validUntil ? new Date(`${validUntil}T23:59:59`) : null };
      return proposal ? proposalsApi.revise(proposal.id, data)
        : proposalsApi.create(companyId, { ...data, customerId: customer, opportunityId: selectedOpportunity?.id ?? null, idempotencyKey: key });
    },
    onSuccess: async (saved) => {
      await Promise.all([client.invalidateQueries({ queryKey: ["proposals"] }), client.invalidateQueries({ queryKey: ["proposal-revisions"] }), client.invalidateQueries({ queryKey: ["proposal", saved.id] })]);
      onSaved(saved);
      onClose();
    },
  });
  const updateScope = (index: number, patch: Partial<ProposalScopeItem>) => {
    const next = scope.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row);
    setScope(next);
    if (patch.quantity !== undefined || patch.unitPriceCents !== undefined) setPrice(String(next.reduce((sum, row) => sum + (row.quantity ?? 1) * (row.unitPriceCents ?? 0), 0) / 100));
  };
  return <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
    <DialogContent className="max-h-dvh overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>{t(proposal ? "salesWorkspace.editProposal" : "salesWorkspace.newProposal")}</DialogTitle><DialogDescription>{t("salesWorkspace.proposalDescription")}</DialogDescription></DialogHeader>
      <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); if (valid && !save.isPending) save.mutate(); }}>
        {!opportunity && !proposal && <div className="flex flex-col gap-2">
          <Label htmlFor="proposal-opportunity">{t("salesWorkspace.opportunityOptional")}</Label>
          <Input aria-label={t("salesWorkspace.searchOpportunities")} placeholder={t("salesWorkspace.searchOpportunities")} value={search} onChange={(event) => setSearch(event.target.value)} />
          <NativeSelect id="proposal-opportunity" value={selectedOpportunity?.id ?? ""} onChange={(event) => {
            const item = items.find((item) => item.id === event.target.value);
            setSelectedOpportunity(item);
            if (item) { setCustomer(item.customerId); setTitle(item.title); setPrice(String((item.amountCents ?? 0) / 100)); setCurrency(item.currency ?? "EUR"); setScope([{ rowKey: crypto.randomUUID(), title: item.title, quantity: 1, unitPriceCents: item.amountCents ?? 0 }]); }
          }}>
            <option value="">{t("salesWorkspace.noOpportunity")}</option>
            {selectedOpportunity && !items.some((item) => item.id === selectedOpportunity.id) && <option value={selectedOpportunity.id}>{selectedOpportunity.title}</option>}
            {items.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </NativeSelect>
          {options.hasNextPage && <Button type="button" variant="outline" disabled={options.isFetchingNextPage} onClick={() => void options.fetchNextPage()}>{t("salesWorkspace.loadMore")}</Button>}
          {options.error && <p role="alert" className="text-sm text-destructive">{options.error.message}</p>}
        </div>}
        {!proposal && !selectedOpportunity && <SalesCustomerPicker companyId={companyId} value={customer} onChange={setCustomer} />}
        <div className="flex flex-col gap-1.5"><Label htmlFor="proposal-title">{t("salesWorkspace.title")}</Label><Input id="proposal-title" required maxLength={300} value={title} onChange={(event) => setTitle(event.target.value)} /></div>
        <fieldset className="flex flex-col gap-3"><legend className="text-sm font-medium">{t("salesWorkspace.scope")}</legend>
          {scope.map((row, index) => <div key={row.rowKey} className="flex flex-col gap-2 rounded-md border border-border p-3">
            <Label htmlFor={`scope-title-${row.rowKey}`}>{t("salesWorkspace.concept")}</Label><Input id={`scope-title-${row.rowKey}`} required maxLength={300} value={row.title} onChange={(event) => updateScope(index, { title: event.target.value })} />
            <Label htmlFor={`scope-description-${row.rowKey}`}>{t("salesWorkspace.description")}</Label><Textarea id={`scope-description-${row.rowKey}`} maxLength={5000} value={row.description ?? ""} onChange={(event) => updateScope(index, { description: event.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5"><Label htmlFor={`scope-qty-${row.rowKey}`}>{t("salesWorkspace.quantity")}</Label><Input id={`scope-qty-${row.rowKey}`} type="number" min="0" step="any" required value={row.quantity ?? 1} onChange={(event) => updateScope(index, { quantity: Number(event.target.value) })} /></div>
              <div className="flex flex-col gap-1.5"><Label htmlFor={`scope-price-${row.rowKey}`}>{t("salesWorkspace.unitPrice")}</Label><Input id={`scope-price-${row.rowKey}`} type="number" min="0" step="0.01" required value={(row.unitPriceCents ?? 0) / 100} onChange={(event) => updateScope(index, { unitPriceCents: Math.round(Number(event.target.value) * 100) })} /></div>
            </div>
            <Button type="button" size="sm" variant="outline" disabled={scope.length === 1} onClick={() => { const next = scope.filter((_, rowIndex) => rowIndex !== index); setScope(next); setPrice(String(next.reduce((sum, item) => sum + (item.quantity ?? 1) * (item.unitPriceCents ?? 0), 0) / 100)); }}>{t("salesWorkspace.removeLine")}</Button>
          </div>)}
          <Button type="button" variant="outline" disabled={scope.length >= 100} onClick={() => setScope([...scope, { rowKey: crypto.randomUUID(), title: "", quantity: 1, unitPriceCents: 0 }])}>{t("salesWorkspace.addLine")}</Button>
        </fieldset>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5"><Label htmlFor="proposal-total">{t("salesWorkspace.total")}</Label><Input id="proposal-total" type="number" required min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="proposal-currency">{t("salesWorkspace.currency")}</Label><Input id="proposal-currency" required minLength={3} maxLength={3} pattern="[A-Za-z]{3}" value={currency} onChange={(event) => setCurrency(event.target.value)} /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="proposal-deposit">{t("salesWorkspace.deposit")}</Label><Input id="proposal-deposit" type="number" min="0" max={price || "0"} step="0.01" value={deposit} onChange={(event) => setDeposit(event.target.value)} /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="proposal-valid">{t("salesWorkspace.validUntil")}</Label><Input id="proposal-valid" type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} /></div>
        </div>
        <div className="flex flex-col gap-1.5"><Label htmlFor="proposal-terms">{t("salesWorkspace.terms")}</Label><Textarea id="proposal-terms" maxLength={20000} value={terms} onChange={(event) => setTerms(event.target.value)} /></div>
        {save.error && <p role="alert" className="text-sm text-destructive">{save.error.message}</p>}
        <div className="flex items-center justify-between gap-2"><Button type="button" variant="outline" disabled={save.isPending} onClick={onClose}>{t("salesWorkspace.cancel")}</Button><Button type="submit" disabled={!valid || save.isPending}>{t(proposal ? "salesWorkspace.save" : "salesWorkspace.createDraft")}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
