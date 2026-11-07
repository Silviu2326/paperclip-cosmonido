import { useEffect, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import type { Proposal, ProposalScopeItem, ProposalStatus } from "@paperclipai/shared";
import { Link, useLocation, useNavigate, useParams } from "@/lib/router";
import { useTranslation } from "@/i18n";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { proposalsApi } from "@/api/proposals";
import { crmApi } from "@/api/crm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { ProposalEditorDialog } from "@/components/crm/ProposalEditorDialog";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/EmptyState";
import { PageSkeleton } from "@/components/PageSkeleton";
import { WhyDidTheAgentDoThis } from "@/components/WhyDidTheAgentDoThis";
import { formatCents } from "@/lib/utils";

const STATUSES: ProposalStatus[] = ["draft", "sent", "viewed", "accepted", "rejected", "expired"];
const statusLabels: Record<ProposalStatus, string> = {
  draft: "Borrador",
  sent: "Enviada",
  viewed: "Vista",
  accepted: "Aceptada",
  rejected: "Rechazada",
  expired: "Caducada",
};
const paymentLabels: Record<string, string> = {
  none: "Sin señal",
  link_created: "Enlace de pago creado",
  paid: "Señal pagada",
  failed: "Pago fallido",
};

function publicUrlFor(proposal: Proposal) {
  if (!proposal.publicToken) return null;
  return `${window.location.origin}/api/public/proposals/${proposal.publicToken}/view`;
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("es-ES");
}

function StatusBadge({ status }: { status: ProposalStatus }) {
  const { t } = useTranslation();
  return <Badge variant="secondary">{t(`proposals.status.${status}`, { defaultValue: statusLabels[status] })}</Badge>;
}

export function Proposals() {
  const { selectedCompanyId } = useCompany();
  return <ProposalList key={selectedCompanyId ?? "none"} companyId={selectedCompanyId ?? ""} />;
}

function ProposalList({ companyId }: { companyId: string }) {
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const location = useLocation();
  const navigate = useNavigate();
  const customerId = new URLSearchParams(location.search).get("customerId");
  const opportunityId = new URLSearchParams(location.search).get("opportunityId");
  const [status, setStatus] = useState<ProposalStatus>();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [creating, setCreating] = useState(false);
  const linkedOpportunity = useQuery({ queryKey: ["sales-opportunity", companyId, opportunityId], queryFn: () => crmApi.opportunities.get(opportunityId!), enabled: !!companyId && !!opportunityId });
  useEffect(() => { setBreadcrumbs([{ label: t("uxCrm.proposals", { defaultValue: "Proposals" }) }]); }, [setBreadcrumbs, t]);
  const query = useInfiniteQuery({
    queryKey: ["proposals", companyId, status, customerId, opportunityId, search],
    queryFn: ({ pageParam }) => proposalsApi.page(companyId, { status, customerId: customerId ?? undefined, opportunityId: opportunityId ?? undefined, q: search.trim() || undefined, cursor: pageParam, limit: 50 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!companyId,
  });
  if (!companyId) return <EmptyState icon={FileText} message={t("goals.selectOrg")} />;
  const proposals = query.data?.pages.flatMap((page) => page.items) ?? [];
  if (sort === "name") proposals.sort((a, b) => a.title.localeCompare(b.title));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input className="w-full sm:w-56" placeholder={t("salesWorkspace.searchProposals")} aria-label={t("salesWorkspace.searchProposals")} value={search} onChange={(event) => setSearch(event.target.value)} />
        <NativeSelect aria-label={t("salesWorkspace.sortLoaded")} value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">{t("salesWorkspace.newest")}</option><option value="name">{t("salesWorkspace.byName")}</option></NativeSelect>
        <Select value={status ?? "all"} onValueChange={(value) => setStatus(value === "all" ? undefined : (value as ProposalStatus))}>
          <SelectTrigger className="w-full sm:w-auto">
            <SelectValue placeholder={t("proposals.filterStatus", { defaultValue: "Filtrar por estado" })} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("proposals.allStatuses", { defaultValue: "Todos los estados" })}</SelectItem>
            {STATUSES.map((value) => (
              <SelectItem key={value} value={value}>{t(`proposals.status.${value}`, { defaultValue: statusLabels[value] })}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => setCreating(true)}>{t("salesWorkspace.newProposal")}</Button>
      </div>
      {(customerId || opportunityId) && <div className="flex flex-wrap gap-2">{opportunityId && <Button variant="outline" asChild><Link to={`/sales/opportunities?opportunityId=${opportunityId}`}>{t("salesWorkspace.openOpportunity")}</Link></Button>}<Button variant="ghost" asChild><Link to="/sales/proposals">{t("salesWorkspace.allProposals")}</Link></Button></div>}
      {query.isLoading ? <PageSkeleton variant="list" /> : query.error ? <div className="flex flex-col gap-2"><p role="alert" className="text-sm text-destructive">{query.error.message}</p><Button variant="outline" onClick={() => void query.refetch()}>{t("salesWorkspace.retry")}</Button></div> : !proposals.length ? (
        <EmptyState icon={FileText} message={status
          ? t("proposals.noStatusResults", { defaultValue: "No hay propuestas con este estado." })
          : customerId
            ? t("uxCrm.noCustomerProposals", { defaultValue: "This customer has no proposals yet." })
            : t("proposals.empty", { defaultValue: "Aún no hay propuestas." })} />
      ) : proposals.map((proposal) => (
        <Card key={proposal.id}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-4">
              <Link to={`/sales/proposals/${proposal.id}`}>{proposal.title}</Link>
              <StatusBadge status={proposal.status} />
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            <p>{t("proposals.revision", { defaultValue: "Revisión" })}: {proposal.revision}</p>
            <p>{t("proposals.price", { defaultValue: "Precio" })}: {formatCents(proposal.priceCents)} {proposal.currency}</p>
            <p>{t("proposals.payment", { defaultValue: "Señal" })}: {t(`proposals.paymentStatus.${proposal.paymentStatus}`, { defaultValue: paymentLabels[proposal.paymentStatus] ?? proposal.paymentStatus })}</p>
            <p>{t("proposals.validUntil", { defaultValue: "Válida hasta" })}: {formatDate(proposal.validUntil)}</p>
          </CardContent>
        </Card>
      ))}
      {query.hasNextPage && <Button variant="outline" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{t("salesWorkspace.loadMore")}</Button>}
      {proposals.length > 0 && <p className="text-xs text-muted-foreground">{t(query.hasNextPage ? "salesWorkspace.partialResults" : "salesWorkspace.resultCount", { count: proposals.length })}</p>}
      {creating && opportunityId && linkedOpportunity.isLoading && <PageSkeleton variant="detail" />}
      {creating && opportunityId && (linkedOpportunity.error || (linkedOpportunity.data && linkedOpportunity.data.companyId !== companyId)) && <p role="alert" className="text-sm text-destructive">{linkedOpportunity.error?.message ?? t("salesWorkspace.notFound")}</p>}
      {creating && (!opportunityId || linkedOpportunity.data?.companyId === companyId) && <ProposalEditorDialog companyId={companyId} customerId={customerId ?? undefined} opportunity={linkedOpportunity.data} onClose={() => setCreating(false)} onSaved={(proposal) => navigate(`/sales/proposals/${proposal.id}`)} />}
    </div>
  );
}

export function ProposalDetail() {
  const { id = "" } = useParams();
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { selectedCompanyId } = useCompany();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const query = useQuery({ queryKey: ["proposal", id], queryFn: () => proposalsApi.get(id), enabled: !!id });
  const revisions = useQuery({ queryKey: ["proposal-revisions", id], queryFn: () => proposalsApi.revisions(id), enabled: !!id });
  useEffect(() => {
    setBreadcrumbs([
      { label: t("uxCrm.proposals", { defaultValue: "Proposals" }), href: "/sales/proposals" },
      { label: query.data?.title ?? "…" },
    ]);
  }, [setBreadcrumbs, query.data?.title, t]);
  if (query.isLoading) return <PageSkeleton variant="detail" />;
  if (query.error || !query.data || query.data.companyId !== selectedCompanyId) return <p role="alert" className="text-sm text-destructive">{query.error?.message ?? t("proposals.notFound", { defaultValue: "Propuesta no encontrada" })}</p>;
  const proposal = query.data;
  const canRevise = proposal.status !== "accepted" && proposal.status !== "rejected";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">{proposal.opportunityId && <Button variant="outline" asChild><Link to={`/sales/opportunities?opportunityId=${proposal.opportunityId}`}>{t("salesWorkspace.openOpportunity")}</Link></Button>}{proposal.customerId && <Button variant="outline" asChild><Link to={`/customers/${proposal.customerId}`}>{t("salesWorkspace.customer")}</Link></Button>}</div>
      <WhyDidTheAgentDoThis companyId={proposal.companyId} kind="proposal" actionId={proposal.id} />
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-4">
            <span>{proposal.title}</span>
            <StatusBadge status={proposal.status} />
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {t("proposals.revision", { defaultValue: "Revisión" })} {proposal.revision} · {t("proposals.validUntil", { defaultValue: "Válida hasta" })}: {formatDate(proposal.validUntil)}
          </p>
          <section className="flex flex-col gap-2">
            <h2 className="font-medium">{t("proposals.scope", { defaultValue: "Alcance" })}</h2>
            <ScopeTable scope={proposal.scope} currency={proposal.currency} />
          </section>
          <section className="flex flex-col gap-1 text-sm">
            <h2 className="font-medium">{t("proposals.price", { defaultValue: "Precio" })}</h2>
            <p>{t("proposals.total", { defaultValue: "Total" })}: {formatCents(proposal.priceCents)} {proposal.currency}</p>
            <p>{t("proposals.deposit", { defaultValue: "Señal" })}: {proposal.depositCents ? `${formatCents(proposal.depositCents)} ${proposal.currency}` : "—"}</p>
          </section>
          {proposal.terms && (
            <section className="flex flex-col gap-2">
              <h2 className="font-medium">{t("proposals.terms", { defaultValue: "Condiciones" })}</h2>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{proposal.terms}</p>
            </section>
          )}
          <PaymentBlock proposal={proposal} />
          <AcceptanceBlock proposal={proposal} />
          <div className="flex flex-wrap gap-2">
            {proposal.status === "draft" && <SendDialog proposal={proposal} />}
            {canRevise && <Button variant="outline" onClick={() => setEditing(true)}>{t("salesWorkspace.editProposal")}</Button>}
            <PublicLinkButton proposal={proposal} />
          </div>
        </CardContent>
      </Card>
      {editing && <ProposalEditorDialog key={proposal.id} companyId={proposal.companyId} proposal={proposal} onClose={() => setEditing(false)} onSaved={(saved) => navigate(`/sales/proposals/${saved.id}`)} />}
      <Card>
        <CardHeader>
          <CardTitle>{t("proposals.revisions", { defaultValue: "Revisiones" })}</CardTitle>
        </CardHeader>
        <CardContent>
          {revisions.error ? (
            <p role="alert" className="text-sm text-destructive">{revisions.error.message}</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {(revisions.data ?? []).map((revision) => (
                <li key={revision.id} className="flex items-center justify-between gap-3">
                  {revision.id === proposal.id ? (
                    <span>{t("proposals.revisionNumber", { defaultValue: "Revisión {{n}}", n: revision.revision })}</span>
                  ) : (
                    <Link to={`/sales/proposals/${revision.id}`}>{t("proposals.revisionNumber", { defaultValue: "Revisión {{n}}", n: revision.revision })}</Link>
                  )}
                  <span className="flex items-center gap-2 text-muted-foreground">
                    {formatDate(revision.sentAt ?? revision.createdAt)} <StatusBadge status={revision.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ScopeTable({ scope, currency }: { scope: ProposalScopeItem[]; currency: string }) {
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-2 pr-4 font-medium">{t("proposals.concept", { defaultValue: "Concepto" })}</th>
            <th className="py-2 pr-4 font-medium">{t("proposals.quantity", { defaultValue: "Cantidad" })}</th>
            <th className="py-2 font-medium">{t("proposals.unitPrice", { defaultValue: "Precio unitario" })}</th>
          </tr>
        </thead>
        <tbody>
          {scope.map((item, index) => (
            <tr key={index} className="align-top">
              <td className="py-2 pr-4">
                <span className="font-medium">{item.title}</span>
                {item.description && <span className="block text-muted-foreground">{item.description}</span>}
              </td>
              <td className="py-2 pr-4">{item.quantity ?? "—"}</td>
              <td className="py-2">{item.unitPriceCents == null ? "—" : `${formatCents(item.unitPriceCents)} ${currency}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PaymentBlock({ proposal }: { proposal: Proposal }) {
  const { t } = useTranslation();
  if (!proposal.depositCents) return null;
  return (
    <section className="flex flex-col gap-1 text-sm">
      <h2 className="font-medium">{t("proposals.paymentBlock", { defaultValue: "Pago de la señal" })}</h2>
      <p>{t(`proposals.paymentStatus.${proposal.paymentStatus}`, { defaultValue: paymentLabels[proposal.paymentStatus] ?? proposal.paymentStatus })}</p>
      {proposal.paidAt && <p className="text-muted-foreground">{t("proposals.paidAt", { defaultValue: "Pagada el" })} {formatDate(proposal.paidAt)}</p>}
      {proposal.stripePaymentLinkUrl && (
        <a className="underline" href={proposal.stripePaymentLinkUrl} target="_blank" rel="noreferrer">
          {t("proposals.paymentLink", { defaultValue: "Enlace de pago" })}
        </a>
      )}
    </section>
  );
}

function AcceptanceBlock({ proposal }: { proposal: Proposal }) {
  const { t } = useTranslation();
  const evidence = proposal.acceptanceEvidence;
  if (!evidence) {
    if (proposal.status === "rejected") return <p className="text-sm text-muted-foreground">{t("proposals.rejectedAt", { defaultValue: "Rechazada el" })} {formatDate(proposal.rejectedAt)}</p>;
    return null;
  }
  return (
    <section className="flex flex-col gap-1 text-sm">
      <h2 className="font-medium">{t("proposals.acceptance", { defaultValue: "Aceptación" })}</h2>
      <p>{evidence.name} · {evidence.email}</p>
      <p className="text-muted-foreground">
        {t("proposals.acceptedAt", { defaultValue: "Aceptada el" })} {formatDate(evidence.acceptedAt)} · {t("proposals.revision", { defaultValue: "Revisión" })} {evidence.revision}
      </p>
      <p className="text-muted-foreground">IP: {evidence.ip ?? "—"}</p>
    </section>
  );
}

function PublicLinkButton({ proposal }: { proposal: Proposal }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const url = publicUrlFor(proposal);
  if (!url) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      }}
    >
      {copied ? t("proposals.copied", { defaultValue: "Enlace copiado" }) : t("proposals.copyPublicUrl", { defaultValue: "Copiar enlace público" })}
    </Button>
  );
}

function SendDialog({ proposal }: { proposal: Proposal }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [via, setVia] = useState<"link" | "message">("link");
  const [recipient, setRecipient] = useState("");
  const [result, setResult] = useState<{ publicUrl: string; paymentUnavailableReason: string | null } | null>(null);
  const send = useMutation({
    mutationFn: () => proposalsApi.send(proposal.id, { via, recipient: recipient.trim() || null }),
    onSuccess: async (data) => {
      setResult({ publicUrl: data.publicUrl, paymentUnavailableReason: data.paymentUnavailableReason });
      await qc.invalidateQueries({ queryKey: ["proposal", proposal.id] });
      await qc.invalidateQueries({ queryKey: ["proposal-revisions", proposal.id] });
      await qc.invalidateQueries({ queryKey: ["proposals"] });
    },
  });
  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setResult(null); }}>
      <Button size="sm" onClick={() => setOpen(true)}>{t("proposals.send", { defaultValue: "Enviar" })}</Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("proposals.sendTitle", { defaultValue: "Enviar propuesta" })}</DialogTitle>
          <DialogDescription>{t("proposals.sendDescription", { defaultValue: "Una propuesta enviada ya no se puede editar; los cambios crean una nueva revisión." })}</DialogDescription>
        </DialogHeader>
        {result ? (
          <div className="flex flex-col gap-3 text-sm">
            <p>{t("proposals.sent", { defaultValue: "Propuesta enviada." })}</p>
            <p className="break-all">{result.publicUrl}</p>
            {result.paymentUnavailableReason && <p className="text-muted-foreground">{result.paymentUnavailableReason}</p>}
            <DialogFooter className="flex-row justify-between sm:justify-between">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t("common.close", { defaultValue: "Cerrar" })}</Button>
            </DialogFooter>
          </div>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); send.mutate(); }}>
            <div className="flex flex-col gap-2">
              <Label>{t("proposals.via", { defaultValue: "Canal" })}</Label>
              <Select value={via} onValueChange={(value) => setVia(value as "link" | "message")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="link">{t("proposals.viaLink", { defaultValue: "Enlace público" })}</SelectItem>
                  <SelectItem value="message">{t("proposals.viaMessage", { defaultValue: "Mensaje" })}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {via === "message" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="proposal-recipient">{t("proposals.recipient", { defaultValue: "Destinatario" })}</Label>
                <Input id="proposal-recipient" value={recipient} onChange={(event) => setRecipient(event.target.value)} maxLength={300} />
              </div>
            )}
            {send.error && <p role="alert" className="text-sm text-destructive">{send.error.message}</p>}
            <DialogFooter className="flex-row justify-between sm:justify-between">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t("common.cancel", { defaultValue: "Cancelar" })}</Button>
              <Button type="submit" disabled={send.isPending}>{t("proposals.send", { defaultValue: "Enviar" })}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
