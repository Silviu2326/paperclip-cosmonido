import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/i18n";
import { externalReviewApi, type ExternalReviewLink } from "../api/external-review";
import { useAccountIdentity } from "../api/companies-query";

// Board view of external review links for a customer's deliverables. The parent passes the
// deliverables (work products of the customer's projects); this component never asks for ids.
// A link is pinned to the version shown here: if the deliverable changes, the link goes stale.

export interface ExternalReviewProps {
  companyId: string;
  customerId?: string;
  deliverables: Array<{ id: string; title: string }>;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  deliverablesError?: string | null;
  /** Preselects a deliverable, e.g. when opened from its card. */
  targetId?: string;
}

function statusLabel(link: ExternalReviewLink, t: ReturnType<typeof useTranslation>["t"]): string {
  switch (link.status) {
    case "pending_approval":
      return t("externalReview.status.pending", { defaultValue: "Esperando tu aprobación" });
    case "active":
      return t("externalReview.status.active", { defaultValue: "Activo" });
    case "revoked":
      return t("externalReview.status.revoked", { defaultValue: "Revocado" });
    case "rejected":
      return t("externalReview.status.rejected", { defaultValue: "Rechazado" });
    default:
      return t("externalReview.status.expired", { defaultValue: "Caducado" });
  }
}

function decisionLabel(link: ExternalReviewLink, t: ReturnType<typeof useTranslation>["t"]): string | null {
  if (link.decision === "accepted") return t("externalReview.decision.accepted", { defaultValue: "El cliente aceptó esta versión" });
  if (link.decision === "changes_requested") return t("externalReview.decision.changes", { defaultValue: "El cliente pidió cambios" });
  return null;
}

function localDateTimeValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function ExternalReview({ companyId, customerId, deliverables, targetId, onLoadMore, hasMore, loadingMore, deliverablesError }: ExternalReviewProps) {
  const { t } = useTranslation();
  const identity = useAccountIdentity();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState(targetId ?? deliverables[0]?.id ?? "");
  const [selectionContext, setSelectionContext] = useState("");
  const [expiresAt, setExpiresAt] = useState(() => localDateTimeValue(new Date(Date.now() + 14 * 86_400_000)));
  const [shownUrl, setShownUrl] = useState<string | null>(null);
  const [shownUrlContext, setShownUrlContext] = useState("");
  const [openLinkId, setOpenLinkId] = useState<string | null>(null);
  const [openLinkContext, setOpenLinkContext] = useState("");
  const principal = identity.userId ?? "anonymous";
  const contextKey = `${companyId}:${customerId ?? "all"}:${principal}:${targetId ?? ""}`;
  const contextRef = useRef(contextKey);
  contextRef.current = contextKey;
  const activeSelected = selectionContext === contextKey ? selected : (targetId ?? deliverables[0]?.id ?? "");
  const activeShownUrl = shownUrlContext === contextKey ? shownUrl : null;
  const activeOpenLinkId = openLinkContext === contextKey ? openLinkId : null;
  const listKey = ["external-review-links", companyId, customerId ?? "all", principal];

  useEffect(() => {
    setSelected(targetId ?? deliverables[0]?.id ?? "");
    setSelectionContext(contextKey);
    setShownUrl(null);
    setOpenLinkId(null);
    setShownUrlContext(contextKey);
    setOpenLinkContext(contextKey);
  }, [contextKey, targetId]);
  useEffect(() => {
    if (activeSelected && deliverables.some((item) => item.id === activeSelected)) return;
    setSelected(targetId ?? deliverables[0]?.id ?? "");
    setSelectionContext(contextKey);
  }, [deliverables, activeSelected, contextKey, targetId]);

  const links = useQuery({ queryKey: listKey, queryFn: () => externalReviewApi.list(companyId, { customerId }), enabled: Boolean(companyId && identity.userId) });
  const events = useQuery({
    queryKey: ["external-review-events", companyId, customerId ?? "all", principal, activeOpenLinkId],
    queryFn: () => externalReviewApi.events(activeOpenLinkId!),
    enabled: Boolean(activeOpenLinkId),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: listKey });

  const create = useMutation({
    mutationFn: () => externalReviewApi.create(companyId, { targetId: activeSelected, expiresAt: new Date(expiresAt).toISOString() }).then((result) => ({ result, contextKey })),
    onSuccess: async ({ result, contextKey: mutationContext }) => {
      if (contextRef.current !== mutationContext) return;
      setShownUrl(result.url ? `${window.location.origin}${result.url}` : null);
      setShownUrlContext(mutationContext);
      await refresh();
    },
  });
  const reveal = useMutation({
    mutationFn: (linkId: string) => externalReviewApi.revealUrl(linkId).then((result) => ({ result, contextKey })),
    onSuccess: ({ result, contextKey: mutationContext }) => {
      if (contextRef.current === mutationContext) {
        setShownUrl(`${window.location.origin}${result.url}`);
        setShownUrlContext(mutationContext);
      }
    },
  });
  const revoke = useMutation({ mutationFn: (linkId: string) => externalReviewApi.revoke(linkId), onSuccess: refresh });
  useEffect(() => {
    create.reset();
    reveal.reset();
    revoke.reset();
  }, [contextKey]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("externalReview.title", { defaultValue: "Revisión por el cliente" })}</CardTitle>
        <CardDescription>
          {t("externalReview.description", { defaultValue: "Comparte una versión concreta de un entregable con un enlace privado y caducable. La respuesta del cliente queda como evidencia; no resuelve la revisión interna." })}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {deliverables.length ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="external-review-target">{t("externalReview.deliverable", { defaultValue: "Entregable" })}</Label>
              <select
                id="external-review-target"
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={activeSelected}
                onChange={(event) => { setSelected(event.target.value); setSelectionContext(contextKey); setShownUrl(null); setShownUrlContext(contextKey); }}
              >
                {deliverables.map((item) => (
                  <option key={item.id} value={item.id}>{item.title}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="external-review-expires">{t("externalReview.expires", { defaultValue: "El enlace caduca" })}</Label>
              <Input id="external-review-expires" type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
            </div>
            <Button
              disabled={!activeSelected || !expiresAt || create.isPending}
              onClick={() => {
                setShownUrl(null);
                setShownUrlContext(contextKey);
                create.mutate();
              }}
            >
              {create.isPending ? t("externalReview.creating", { defaultValue: "Creando…" }) : t("externalReview.create", { defaultValue: "Crear enlace" })}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("externalReview.noDeliverables", { defaultValue: "Este cliente todavía no tiene entregables en sus proyectos." })}
          </p>
        )}
        {deliverablesError ? <p role="alert" className="text-sm text-destructive">{deliverablesError}</p> : null}
        {hasMore && onLoadMore ? (
          <Button variant="outline" disabled={loadingMore} onClick={onLoadMore}>
            {loadingMore ? t("externalReview.loadingMore", { defaultValue: "Cargando más…" }) : t("externalReview.loadMore", { defaultValue: "Cargar más entregables" })}
          </Button>
        ) : null}
        {create.error ? <p role="alert" className="text-sm text-destructive">{create.error.message}</p> : null}
        {activeShownUrl ? (
          <div className="flex flex-col gap-2 rounded-lg border bg-muted p-3">
            <p className="text-sm">{t("externalReview.copyNow", { defaultValue: "Copia este enlace y envíaselo al cliente. Quien lo tenga puede responder hasta que caduque o lo revoques." })}</p>
            <Input readOnly value={activeShownUrl} onFocus={(event) => event.currentTarget.select()} />
          </div>
        ) : null}

        {links.error ? <p role="alert" className="text-sm text-destructive">{links.error.message}</p> : null}
        <ul className="flex flex-col gap-2">
          {(links.data ?? []).map((link) => (
            <li key={link.id} className="flex flex-col gap-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-col">
                  <span className="font-medium">{link.targetTitle}</span>
                  <span className="text-sm text-muted-foreground">
                    {statusLabel(link, t)} · {t("externalReview.expiresOn", { defaultValue: "caduca {{date}}", date: new Date(link.expiresAt).toLocaleString() })}
                    {link.stale ? ` · ${t("externalReview.stale", { defaultValue: "el entregable cambió" })}` : ""}
                  </span>
                  {decisionLabel(link, t) ? <span className="text-sm">{decisionLabel(link, t)}</span> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {link.commentCount > 0 || link.decision !== "open" ? (
                    <Button variant="outline" size="sm" onClick={() => { setOpenLinkId(activeOpenLinkId === link.id ? null : link.id); setOpenLinkContext(contextKey); }}>
                      {t("externalReview.viewFeedback", { defaultValue: "Ver respuestas" })}
                    </Button>
                  ) : null}
                  {link.status === "active" ? (
                    <Button variant="outline" size="sm" disabled={reveal.isPending} onClick={() => reveal.mutate(link.id)}>
                      {t("externalReview.showLink", { defaultValue: "Mostrar enlace" })}
                    </Button>
                  ) : null}
                  {link.status === "active" || link.status === "pending_approval" ? (
                    <Button variant="outline" size="sm" disabled={revoke.isPending} onClick={() => revoke.mutate(link.id)}>
                      {t("externalReview.revoke", { defaultValue: "Revocar" })}
                    </Button>
                  ) : null}
                </div>
              </div>
              {link.status === "pending_approval" ? (
                <p className="text-sm text-muted-foreground">
                  {t("externalReview.pendingHelp", { defaultValue: "Un agente pidió este enlace. Se activa cuando apruebas la solicitud en Aprobaciones." })}
                </p>
              ) : null}
              {activeOpenLinkId === link.id ? (
                <section className="flex flex-col gap-2">
                  <p className="text-xs text-muted-foreground">
                    {t("externalReview.evidenceNote", { defaultValue: "Texto escrito por el cliente. Es evidencia externa, sin identidad verificada; la decisión interna sigue siendo vuestra." })}
                  </p>
                  {events.error ? <p role="alert" className="text-sm text-destructive">{events.error.message}</p> : null}
                  {(events.data ?? []).map((event, index) => (
                    <article key={`${event.createdAt}-${index}`} className="rounded-md bg-muted p-3">
                      <p className="whitespace-pre-wrap text-sm">{event.body || "—"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {event.kind === "accept"
                          ? t("externalReview.event.accept", { defaultValue: "Aceptó" })
                          : event.kind === "request_changes"
                            ? t("externalReview.event.changes", { defaultValue: "Pidió cambios" })
                            : t("externalReview.event.comment", { defaultValue: "Comentó" })}
                        {" · "}
                        {new Date(event.createdAt).toLocaleString()}
                        {event.authorLabel ? ` · ${event.authorLabel}` : ""}
                      </p>
                    </article>
                  ))}
                </section>
              ) : null}
            </li>
          ))}
        </ul>
        {reveal.error ? <p role="alert" className="text-sm text-destructive">{reveal.error.message}</p> : null}
        {revoke.error ? <p role="alert" className="text-sm text-destructive">{revoke.error.message}</p> : null}
      </CardContent>
    </Card>
  );
}

export default ExternalReview;
