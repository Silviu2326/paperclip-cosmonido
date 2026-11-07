import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/i18n";
import { externalReviewApi, type ExternalReviewResponseKind } from "../api/external-review";
import { useAccountIdentity } from "../api/companies-query";
import { createUuid } from "../lib/uuid";

// Public page for one review link: /review/:companyId/:linkId#token=...
// The token is read from the fragment, moved to memory and removed from the address bar.
// Without an account: the visitor can comment, accept or ask for changes on the pinned version.

export function PublicReview() {
  const { t } = useTranslation();
  const identity = useAccountIdentity();
  const { companyId = "", linkId = "" } = useParams<{ companyId: string; linkId: string }>();
  const [tokenEntry, setTokenEntry] = useState<{ contextKey: string; value: string } | null>(null);
  const [body, setBody] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [tokenEpoch, setTokenEpoch] = useState(0);
  const [pageInstance] = useState(createUuid);
  // One key per attempt: retrying the same answer after a network error replays it instead of duplicating.
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  const queryClient = useQueryClient();
  const identityReady = identity.settled || identity.failed;
  const contextKey = `${companyId}:${linkId}:${identityReady ? identity.userId ?? "anonymous" : "unresolved"}`;
  const contextRef = useRef(contextKey);
  contextRef.current = contextKey;
  const token = tokenEntry?.contextKey === contextKey ? tokenEntry.value : "";

  useEffect(() => {
    // Keep the fragment until the initial account lookup settles; otherwise a
    // signed-in visitor could lose the token when the pending identity resolves.
    if (!identityReady) return;
    setTokenEntry(null);
    setBody("");
    setAuthorName("");
    attempt.current = null;
    setTokenEpoch((epoch) => epoch + 1);
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const value = fragment.get("token") ?? "";
    if (value) {
      setTokenEntry({ contextKey, value });
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
  }, [contextKey, identityReady]);

  const queryKey = ["public-external-review", companyId, linkId, identity.userId ?? "anonymous", pageInstance, tokenEpoch];
  const review = useQuery({
    queryKey,
    queryFn: () => externalReviewApi.publicGet(companyId, linkId, token),
    enabled: identityReady && Boolean(companyId && linkId && token),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const respond = useMutation({
    mutationFn: (kind: ExternalReviewResponseKind) => {
      const data = review.data!;
      const signature = JSON.stringify([kind, body.trim(), authorName.trim(), data.version, data.revision]);
      if (attempt.current?.signature !== signature) attempt.current = { signature, key: crypto.randomUUID() };
      return externalReviewApi.publicRespond(companyId, linkId, token, {
        kind,
        body: body.trim(),
        authorName: authorName.trim() || null,
        targetVersion: data.version,
        expectedRevision: data.revision,
        idempotencyKey: attempt.current.key,
      }).then((result) => ({ result, contextKey }));
    },
    onSuccess: ({ result, contextKey: mutationContext }) => {
      if (contextRef.current !== mutationContext) return;
      attempt.current = null;
      setBody("");
      queryClient.setQueryData(queryKey, result);
    },
    onError: () => {
      // A conflict means the review moved on (new comment, decision or version): show the latest state.
      void queryClient.invalidateQueries({ queryKey });
    },
  });
  const responseBytes = (kind: ExternalReviewResponseKind) => {
    if (!review.data) return 0;
    const payload = {
      kind,
      body: body.trim(),
      authorName: authorName.trim() || null,
      targetVersion: review.data.version,
      expectedRevision: review.data.revision,
      idempotencyKey: "00000000-0000-4000-8000-000000000000",
    };
    return new TextEncoder().encode(JSON.stringify(payload)).length;
  };
  useEffect(() => {
    respond.reset();
  }, [contextKey]);

  if (!token) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("publicReview.noTokenTitle", { defaultValue: "Revisión de entregable" })}</CardTitle>
            <CardDescription>{t("publicReview.noTokenDescription", { defaultValue: "Abre el enlace privado que recibiste para ver este entregable." })}</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }
  if (review.isLoading) {
    return (
      <main className="mx-auto w-full max-w-3xl p-6">
        <p role="status">{t("publicReview.loading", { defaultValue: "Cargando el entregable…" })}</p>
      </main>
    );
  }
  if (review.error || !review.data) {
    return (
      <main className="mx-auto w-full max-w-3xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("publicReview.unavailableTitle", { defaultValue: "Enlace no disponible" })}</CardTitle>
            <CardDescription>{t("publicReview.unavailableDescription", { defaultValue: "Este enlace puede haber caducado o haber sido revocado. Pide al remitente uno nuevo." })}</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  const data = review.data;
  const decided = data.decision !== "open";
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">{data.companyName}</p>
        <h1 className="text-2xl font-semibold">{data.title}</h1>
        <p className="text-sm text-muted-foreground">
          {t("publicReview.versionLine", { defaultValue: "Versión del {{date}} · para {{customer}}", date: new Date(data.version).toLocaleString(), customer: data.customerName })}
        </p>
      </header>

      {data.stale ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("publicReview.staleTitle", { defaultValue: "Esta versión ya no es la actual" })}</CardTitle>
            <CardDescription>{t("publicReview.staleDescription", { defaultValue: "El entregable cambió después de enviarte este enlace. Pide el enlace de la nueva versión; aquí ya no se puede responder." })}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-3 pt-6">
            {data.summary ? <p className="whitespace-pre-wrap text-sm">{data.summary}</p> : null}
            {data.url ? (
              <Button asChild variant="outline">
                <a href={data.url} target="_blank" rel="noreferrer noopener">{t("publicReview.open", { defaultValue: "Abrir el entregable" })}</a>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      )}

      {decided ? (
        <p role="status" className="rounded-lg border p-3 text-sm">
          {data.decision === "accepted"
            ? t("publicReview.accepted", { defaultValue: "Aceptaste esta versión. Gracias." })
            : t("publicReview.changesRequested", { defaultValue: "Pediste cambios para esta versión. Te enviarán una nueva." })}
        </p>
      ) : null}

      {data.events.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">{t("publicReview.history", { defaultValue: "Tus respuestas" })}</h2>
          {data.events.map((event, index) => (
            <article key={`${event.createdAt}-${index}`} className="rounded-md bg-muted p-3">
              <p className="whitespace-pre-wrap text-sm">{event.body || (event.kind === "accept" ? t("publicReview.acceptedEvent", { defaultValue: "Aceptado" }) : "")}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(event.createdAt).toLocaleString()}
                {event.authorLabel ? ` · ${event.authorLabel}` : ""}
              </p>
            </article>
          ))}
        </section>
      ) : null}

      {data.canComment ? (
        <section className="flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="review-author">{t("publicReview.yourName", { defaultValue: "Tu nombre (opcional)" })}</Label>
            <Input id="review-author" value={authorName} maxLength={120} onChange={(event) => setAuthorName(event.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="review-body">{t("publicReview.comment", { defaultValue: "Comentario" })}</Label>
            <Textarea id="review-body" value={body} maxLength={3500} onChange={(event) => setBody(event.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={!body.trim() || responseBytes("comment") > 4096 || respond.isPending} onClick={() => respond.mutate("comment")}>
              {t("publicReview.send", { defaultValue: "Enviar comentario" })}
            </Button>
            {data.canDecide ? (
              <>
                <Button variant="outline" disabled={!body.trim() || responseBytes("request_changes") > 4096 || respond.isPending} onClick={() => respond.mutate("request_changes")}>
                  {t("publicReview.requestChanges", { defaultValue: "Pedir cambios" })}
                </Button>
                <Button disabled={responseBytes("accept") > 4096 || respond.isPending} onClick={() => respond.mutate("accept")}>
                  {t("publicReview.accept", { defaultValue: "Aceptar esta versión" })}
                </Button>
              </>
            ) : null}
          </div>
          {respond.error ? <p role="alert" className="text-sm text-destructive">{respond.error.message}</p> : null}
        </section>
      ) : null}
    </main>
  );
}

export default PublicReview;
