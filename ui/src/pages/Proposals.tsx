import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import type { Proposal, ProposalScopeItem, ProposalStatus } from "@paperclipai/shared";
import { Link, useParams } from "@/lib/router";
import { useTranslation } from "@/i18n";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { proposalsApi } from "@/api/proposals";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [status, setStatus] = useState<ProposalStatus>();
  useEffect(() => { setBreadcrumbs([{ label: t("nav.proposals", { defaultValue: "Propuestas" }) }]); }, [setBreadcrumbs, t]);
  const query = useQuery({
    queryKey: ["proposals", selectedCompanyId, status],
    queryFn: () => proposalsApi.list(selectedCompanyId!, { status }),
    enabled: !!selectedCompanyId,
  });
  if (!selectedCompanyId) return <EmptyState icon={FileText} message={t("goals.selectOrg")} />;
  if (query.isLoading) return <PageSkeleton variant="list" />;
  if (query.error) return <p role="alert" className="text-sm text-destructive">{query.error.message}</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
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
      </div>
      {!query.data?.length ? (
        <EmptyState icon={FileText} message={status
          ? t("proposals.noStatusResults", { defaultValue: "No hay propuestas con este estado." })
          : t("proposals.empty", { defaultValue: "Aún no hay propuestas." })} />
      ) : query.data.map((proposal) => (
        <Card key={proposal.id}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-4">
              <Link to={`/proposals/${proposal.id}`}>{proposal.title}</Link>
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
    </div>
  );
}

export function ProposalDetail() {
  const { id = "" } = useParams();
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const query = useQuery({ queryKey: ["proposal", id], queryFn: () => proposalsApi.get(id), enabled: !!id });
  const revisions = useQuery({ queryKey: ["proposal-revisions", id], queryFn: () => proposalsApi.revisions(id), enabled: !!id });
  useEffect(() => {
    setBreadcrumbs([
      { label: t("nav.proposals", { defaultValue: "Propuestas" }), href: "/proposals" },
      { label: query.data?.title ?? "…" },
    ]);
  }, [setBreadcrumbs, query.data?.title, t]);
  if (query.isLoading) return <PageSkeleton variant="detail" />;
  if (query.error || !query.data) return <p role="alert" className="text-sm text-destructive">{query.error?.message ?? t("proposals.notFound", { defaultValue: "Propuesta no encontrada" })}</p>;
  const proposal = query.data;
  const canRevise = proposal.status !== "accepted" && proposal.status !== "rejected";
  return (
    <div className="flex flex-col gap-4">
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
            {canRevise && <ReviseDialog proposal={proposal} />}
            <PublicLinkButton proposal={proposal} />
          </div>
        </CardContent>
      </Card>
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
                    <Link to={`/proposals/${revision.id}`}>{t("proposals.revisionNumber", { defaultValue: "Revisión {{n}}", n: revision.revision })}</Link>
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

/** One line per scope item: "Título | precio unitario en euros". */
function parseScopeLines(text: string): ProposalScopeItem[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [title = "", price = ""] = line.split("|").map((part) => part.trim());
      const unit = Number(price.replace(",", "."));
      return {
        title,
        unitPriceCents: price && Number.isFinite(unit) ? Math.round(unit * 100) : null,
      };
    });
}

function ReviseDialog({ proposal }: { proposal: Proposal }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const initialScope = proposal.scope.map((item) => `${item.title}${item.unitPriceCents != null ? ` | ${(item.unitPriceCents / 100).toFixed(2)}` : ""}`).join("\n");
  const revise = useMutation({
    mutationFn: (input: Parameters<typeof proposalsApi.revise>[1]) => proposalsApi.revise(proposal.id, input),
    onSuccess: async (next) => {
      await qc.invalidateQueries({ queryKey: ["proposals"] });
      await qc.invalidateQueries({ queryKey: ["proposal-revisions"] });
      setOpen(false);
      window.location.assign(`/proposals/${next.id}`);
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>{t("proposals.revise", { defaultValue: "Nueva revisión" })}</Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("proposals.reviseTitle", { defaultValue: "Nueva revisión" })}</DialogTitle>
          <DialogDescription>{t("proposals.reviseDescription", { defaultValue: "Si la propuesta ya se envió, se crea una revisión nueva y la enviada no cambia." })}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const title = String(form.get("title") ?? "").trim();
            const scopeText = String(form.get("scope") ?? "");
            const scope = parseScopeLines(scopeText);
            const price = Number(String(form.get("price") ?? "0").replace(",", "."));
            const deposit = String(form.get("deposit") ?? "").trim();
            const validUntil = String(form.get("validUntil") ?? "").trim();
            const terms = String(form.get("terms") ?? "");
            revise.mutate({
              title: title || undefined,
              scope: scope.length ? scope : undefined,
              priceCents: Math.round(price * 100),
              depositCents: deposit ? Math.round(Number(deposit.replace(",", ".")) * 100) : null,
              validUntil: validUntil ? new Date(validUntil) : null,
              terms: terms.trim() ? terms : null,
              currency: proposal.currency,
            });
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="revise-title">{t("common.title", { defaultValue: "Título" })}</Label>
            <Input id="revise-title" name="title" defaultValue={proposal.title} maxLength={300} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="revise-scope">{t("proposals.scopeLines", { defaultValue: "Alcance (una línea por concepto: título | precio unitario)" })}</Label>
            <Textarea id="revise-scope" name="scope" defaultValue={initialScope} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="revise-price">{t("proposals.priceAmount", { defaultValue: "Precio total" })} ({proposal.currency})</Label>
            <Input id="revise-price" name="price" type="number" min="0" step="0.01" defaultValue={(proposal.priceCents / 100).toFixed(2)} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="revise-deposit">{t("proposals.depositAmount", { defaultValue: "Señal (opcional)" })} ({proposal.currency})</Label>
            <Input id="revise-deposit" name="deposit" type="number" min="0" step="0.01" defaultValue={proposal.depositCents ? (proposal.depositCents / 100).toFixed(2) : ""} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="revise-valid">{t("proposals.validUntil", { defaultValue: "Válida hasta" })}</Label>
            <Input id="revise-valid" name="validUntil" type="date" defaultValue={proposal.validUntil ? String(proposal.validUntil).slice(0, 10) : ""} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="revise-terms">{t("proposals.terms", { defaultValue: "Condiciones" })}</Label>
            <Textarea id="revise-terms" name="terms" defaultValue={proposal.terms ?? ""} />
          </div>
          {revise.error && <p role="alert" className="text-sm text-destructive">{revise.error.message}</p>}
          <DialogFooter className="flex-row justify-between sm:justify-between">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t("common.cancel", { defaultValue: "Cancelar" })}</Button>
            <Button type="submit" disabled={revise.isPending}>{t("proposals.createRevision", { defaultValue: "Crear revisión" })}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
