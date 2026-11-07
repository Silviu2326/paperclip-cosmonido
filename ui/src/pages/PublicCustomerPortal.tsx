import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/i18n";
import { customerPortalApi } from "../api/customer-portal";
import { PublicBusinessBrand } from "@/components/PublicBusinessBrand";

export function PublicCustomerPortal() {
  const { t } = useTranslation();
  const { portalId = "" } = useParams<{ portalId: string }>();
  const [token, setToken] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [comment, setComment] = useState("");
  const [commentIndex, setCommentIndex] = useState<number | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackIndex, setFeedbackIndex] = useState<number | null>(null);
  const queryClient = useQueryClient();
  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const value = fragment.get("token") ?? "";
    if (value) {
      setToken(value);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);
  const portal = useQuery({ queryKey: ["public-customer-portal", portalId], queryFn: () => customerPortalApi.publicGet(portalId, token), enabled: Boolean(portalId && token), retry: false, refetchOnWindowFocus: false });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["public-customer-portal", portalId] });
  const addComment = useMutation({ mutationFn: () => customerPortalApi.publicComment(portalId, token, portal.data!.conversations[commentIndex!].reference, comment.trim()), onSuccess: async () => { setComment(""); setCommentIndex(null); await refresh(); } });
  const accept = useMutation({ mutationFn: (proposalIndex: number) => customerPortalApi.acceptProposal(portalId, token, { proposalReference: portal.data?.proposals[proposalIndex]?.reference ?? "", revision: portal.data?.proposals[proposalIndex]?.revision ?? 0, name: name.trim(), email: email.trim() }), onSuccess: refresh });
  // The key lives with the selected file so a retry after an uncertain outcome is the same upload, never a duplicate.
  const [selected, setSelected] = useState<{ file: File; key: string } | null>(null);
  const upload = useMutation({
    mutationFn: () => customerPortalApi.publicUploadFile(portalId, token, selected!.file, selected!.key),
    onSuccess: async () => { setSelected(null); await refresh(); },
  });
  const download = useMutation({
    mutationFn: async (item: { reference: string; name: string }) => {
      const blob = await customerPortalApi.publicDownloadFile(portalId, token, item.reference);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = item.name;
      link.click();
      URL.revokeObjectURL(url);
    },
  });
  const feedback = useMutation({ mutationFn: ({ index, decision }: { index: number; decision: "accept" | "changes_requested" }) => customerPortalApi.publicDeliverableFeedback(portalId, token, { reference: portal.data?.deliverables[index]?.reference ?? "", decision, comment: feedbackText.trim(), idempotencyKey: crypto.randomUUID() }), onSuccess: async () => { setFeedbackText(""); setFeedbackIndex(null); await refresh(); } });

  if (!token) return <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6"><Card><CardHeader><CardTitle>{t("publicPortal.noTokenTitle", { defaultValue: "Portal del cliente" })}</CardTitle><CardDescription>{t("publicPortal.noTokenDescription", { defaultValue: "Abre el enlace privado que recibiste para ver este portal." })}</CardDescription></CardHeader></Card></main>;
  if (portal.isLoading) return <main className="mx-auto w-full max-w-5xl p-6"><p role="status">{t("publicPortal.loading", { defaultValue: "Cargando tu portal…" })}</p></main>;
  if (portal.error || !portal.data) return <main className="mx-auto w-full max-w-3xl p-6"><Card><CardHeader><CardTitle>{t("publicPortal.unavailableTitle", { defaultValue: "Portal no disponible" })}</CardTitle><CardDescription>{t("publicPortal.unavailableDescription", { defaultValue: "Este enlace puede haber caducado o haber sido revocado. Pide al remitente uno nuevo." })}</CardDescription></CardHeader></Card></main>;
  const data = portal.data;
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      {data.brand ? <PublicBusinessBrand brand={data.brand} /> : null}
      <header className="flex flex-col gap-2"><p className="text-sm text-muted-foreground">{data.companyName ?? ""}</p><h1 className="text-2xl font-semibold">{data.customerName}</h1>{data.contactName ? <p className="text-sm text-muted-foreground">{t("publicPortal.forContact", { defaultValue: "Para {{name}}", name: data.contactName })}</p> : null}</header>
      {data.deliverables.length ? <section className="flex flex-col gap-3"><h2 className="text-xl font-semibold">{t("publicPortal.deliverables", { defaultValue: "Entregables" })}</h2>{data.deliverables.map((item, index) => <Card key={`${item.title}-${index}`}><CardHeader><CardTitle>{item.title}</CardTitle><CardDescription>{t("publicPortal.statusUpdated", { defaultValue: "{{status}} · actualizado {{date}}", status: item.status, date: new Date(item.updatedAt).toLocaleDateString() })}</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">{item.summary ? <p className="text-sm">{item.summary}</p> : null}{data.allowDeliverableFeedback ? <div className="flex flex-col gap-3 rounded-lg border p-3"><p className="text-sm text-muted-foreground">{t("publicPortal.deliverableFeedbackNote", { defaultValue: "Tu respuesta se guarda como comentario externo del cliente para esta versión; no resuelve la revisión interna de la empresa." })}</p><Textarea aria-label={t("publicPortal.feedbackFor", { defaultValue: "Comentario sobre {{title}}", title: item.title })} value={feedbackIndex === index ? feedbackText : ""} onFocus={() => setFeedbackIndex(index)} onChange={(event) => { setFeedbackIndex(index); setFeedbackText(event.target.value); }} placeholder={t("publicPortal.optionalComment", { defaultValue: "Comentario opcional" })} /><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={feedback.isPending} onClick={() => { setFeedbackIndex(index); feedback.mutate({ index, decision: "accept" }); }}>{t("publicPortal.acceptExternally", { defaultValue: "Aceptar externamente" })}</Button><Button variant="outline" disabled={feedback.isPending} onClick={() => { setFeedbackIndex(index); feedback.mutate({ index, decision: "changes_requested" }); }}>{t("publicPortal.requestChanges", { defaultValue: "Solicitar cambios" })}</Button></div>{feedback.error ? <p role="alert" className="text-sm text-destructive">{feedback.error.message}</p> : null}</div> : null}</CardContent></Card>)}</section> : null}
      {data.proposals.length ? <section className="flex flex-col gap-3"><h2 className="text-xl font-semibold">{t("publicPortal.proposals", { defaultValue: "Propuestas" })}</h2>{data.proposals.map((proposal, index) => <Card key={`${proposal.title}-${proposal.revision}`}><CardHeader><CardTitle>{proposal.title}</CardTitle><CardDescription>{t("publicPortal.revisionLine", { defaultValue: "Revisión {{revision}} · {{status}}", revision: proposal.revision, status: proposal.status })}</CardDescription></CardHeader><CardContent className="flex flex-col gap-4"><ul className="flex flex-col gap-2">{proposal.scope.map((item, itemIndex) => <li key={`${item.title}-${itemIndex}`} className="rounded-md border p-3"><p className="font-medium">{item.title}</p>{item.description ? <p className="text-sm text-muted-foreground">{item.description}</p> : null}</li>)}</ul>{proposal.terms ? <p className="whitespace-pre-wrap text-sm">{proposal.terms}</p> : null}<p className="font-medium">{new Intl.NumberFormat(undefined, { style: "currency", currency: proposal.currency }).format(proposal.priceCents / 100)}</p>{proposal.paymentUrl ? <Button asChild variant="outline"><a href={proposal.paymentUrl} target="_blank" rel="noreferrer">{t("publicPortal.continuePayment", { defaultValue: "Continuar al pago" })}</a></Button> : null}{proposal.status === "sent" || proposal.status === "viewed" ? <div className="flex flex-col gap-3 rounded-lg border p-3"><p className="font-medium">{t("publicPortal.acceptTitle", { defaultValue: "Acepta esta propuesta" })}</p><div className="grid gap-3 sm:grid-cols-2"><div className="flex flex-col gap-2"><Label htmlFor={`portal-name-${index}`}>{t("publicPortal.yourName", { defaultValue: "Tu nombre" })}</Label><Input id={`portal-name-${index}`} value={name} onChange={(event) => setName(event.target.value)} /></div><div className="flex flex-col gap-2"><Label htmlFor={`portal-email-${index}`}>{t("publicPortal.email", { defaultValue: "Correo electrónico" })}</Label><Input id={`portal-email-${index}`} type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div></div><Button disabled={!name.trim() || !email.trim() || accept.isPending} onClick={() => accept.mutate(index)}>{accept.isPending ? t("publicPortal.submitting", { defaultValue: "Enviando…" }) : t("publicPortal.acceptButton", { defaultValue: "Aceptar propuesta" })}</Button>{accept.error ? <p role="alert" className="text-sm text-destructive">{accept.error.message}</p> : null}</div> : null}</CardContent></Card>)}</section> : null}
      {data.meetings.length ? <section className="flex flex-col gap-3"><h2 className="text-xl font-semibold">{t("publicPortal.meetings", { defaultValue: "Reuniones" })}</h2>{data.meetings.map((meeting, index) => <Card key={`${meeting.startsAt}-${index}`}><CardHeader><CardTitle>{meeting.title}</CardTitle><CardDescription>{t("publicPortal.meetingLine", { defaultValue: "{{date}} · {{status}}", date: new Date(meeting.startsAt).toLocaleString(), status: meeting.status })}</CardDescription></CardHeader>{meeting.meetingLink ? <CardContent><Button asChild variant="outline"><a href={meeting.meetingLink} target="_blank" rel="noreferrer">{t("publicPortal.joinMeeting", { defaultValue: "Unirse a la reunión" })}</a></Button></CardContent> : null}</Card>)}</section> : null}
      {data.conversations.length ? <section className="flex flex-col gap-3"><h2 className="text-xl font-semibold">{t("publicPortal.conversations", { defaultValue: "Conversaciones" })}</h2>{data.conversations.map((conversation, index) => <Card key={`${conversation.subject}-${index}`}><CardHeader><CardTitle>{conversation.subject || t("publicPortal.conversationFallback", { defaultValue: "Conversación" })}</CardTitle><CardDescription>{conversation.status}</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">{conversation.messages.map((message, messageIndex) => <article key={`${message.createdAt}-${messageIndex}`} className="rounded-md bg-muted p-3"><p className="whitespace-pre-wrap text-sm">{message.body}</p><p className="mt-2 text-xs text-muted-foreground">{t("publicPortal.messageMeta", { defaultValue: "{{actor}} · {{date}}", actor: message.actorKind, date: new Date(message.createdAt).toLocaleString() })}</p></article>)}<Textarea aria-label={t("publicPortal.addComment", { defaultValue: "Añade un comentario" })} value={commentIndex === index ? comment : ""} onFocus={() => setCommentIndex(index)} onChange={(event) => { setCommentIndex(index); setComment(event.target.value); }} placeholder={t("publicPortal.writeMessage", { defaultValue: "Escribe un mensaje" })} /><Button variant="outline" disabled={!comment.trim() || addComment.isPending} onClick={() => { setCommentIndex(index); addComment.mutate(); }}>{addComment.isPending ? t("publicPortal.sending", { defaultValue: "Enviando…" }) : t("publicPortal.sendMessage", { defaultValue: "Enviar mensaje" })}</Button>{addComment.error ? <p role="alert" className="text-sm text-destructive">{addComment.error.message}</p> : null}</CardContent></Card>)}</section> : null}
      {data.commitments.length ? <section className="flex flex-col gap-3"><h2 className="text-xl font-semibold">{t("publicPortal.commitments", { defaultValue: "Compromisos" })}</h2>{data.commitments.map((item, index) => <Card key={`${item.what}-${index}`}><CardContent className="flex flex-col gap-1 pt-6"><p>{item.what}</p><p className="text-sm text-muted-foreground">{item.dueAt ? t("publicPortal.commitmentDue", { defaultValue: "{{who}} · {{status}} · vence {{date}}", who: item.who === "them" ? t("publicPortal.commitmentCustomer", { defaultValue: "Cliente" }) : t("publicPortal.commitmentCompany", { defaultValue: "Empresa" }), status: item.status, date: new Date(item.dueAt).toLocaleDateString() }) : t("publicPortal.commitmentLine", { defaultValue: "{{who}} · {{status}}", who: item.who === "them" ? t("publicPortal.commitmentCustomer", { defaultValue: "Cliente" }) : t("publicPortal.commitmentCompany", { defaultValue: "Empresa" }), status: item.status })}</p></CardContent></Card>)}</section> : null}
      {data.files ? <section className="flex flex-col gap-3"><h2 className="text-xl font-semibold">{t("publicPortal.files", { defaultValue: "Archivos" })}</h2>
        {data.files.canUpload ? <Card><CardHeader><CardTitle>{t("publicPortal.uploadTitle", { defaultValue: "Enviar un archivo" })}</CardTitle><CardDescription>{t("publicPortal.uploadLimits", { defaultValue: "Hasta {{count}} archivos, de {{size}} MB como máximo.", count: data.files.limits.maxFiles, size: Math.floor(data.files.limits.maxBytes / (1024 * 1024)) })}</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">
          <Label htmlFor="portal-file-input">{t("publicPortal.chooseFile", { defaultValue: "Archivo" })}</Label>
          <Input id="portal-file-input" type="file" accept={data.files.limits.contentTypes.join(",")} disabled={upload.isPending} onChange={(event) => { const file = event.target.files?.[0]; upload.reset(); setSelected(file ? { file, key: crypto.randomUUID() } : null); }} />
          {selected ? <Button disabled={upload.isPending} onClick={() => upload.mutate()}>{upload.isPending ? t("publicPortal.uploading", { defaultValue: "Enviando…" }) : upload.error ? t("publicPortal.retryUpload", { defaultValue: "Reintentar el envío" }) : t("publicPortal.uploadFile", { defaultValue: "Enviar archivo" })}</Button> : null}
          {upload.error ? <p role="alert" className="text-sm text-destructive">{upload.error.message}</p> : null}
        </CardContent></Card> : null}
        {data.files.items.length ? data.files.items.map((item) => <Card key={item.reference}><CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6"><div className="flex flex-col"><p className="font-medium">{item.name}</p><p className="text-sm text-muted-foreground">{item.direction === "inbound" ? t("publicPortal.fileSent", { defaultValue: "Enviado por ti" }) : t("publicPortal.fileShared", { defaultValue: "Compartido por la empresa" })} · {item.state === "stored" ? t("publicPortal.fileStored", { defaultValue: "Recibido" }) : t("publicPortal.filePending", { defaultValue: "Sin confirmar; se comprobará automáticamente" })} · {new Date(item.createdAt).toLocaleString()}</p></div>{item.state === "stored" ? <Button variant="outline" disabled={download.isPending} onClick={() => download.mutate({ reference: item.reference, name: item.name })}>{t("publicPortal.downloadFile", { defaultValue: "Descargar" })}</Button> : null}</CardContent></Card>) : <p className="text-sm text-muted-foreground">{t("publicPortal.noFiles", { defaultValue: "Todavía no hay archivos." })}</p>}
        {download.error ? <p role="alert" className="text-sm text-destructive">{download.error.message}</p> : null}
      </section> : null}
      {!data.files && !data.deliverables.length && !data.proposals.length && !data.meetings.length && !data.conversations.length && !data.commitments.length ?<Card><CardHeader><CardTitle>{t("publicPortal.noSharedTitle", { defaultValue: "Todavía no hay elementos compartidos" })}</CardTitle><CardDescription>{t("publicPortal.noSharedDescription", { defaultValue: "Los elementos nuevos que comparta la empresa aparecerán aquí." })}</CardDescription></CardHeader></Card> : null}
    </main>
  );
}

export default PublicCustomerPortal;
