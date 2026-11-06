import { Fragment, useEffect, useRef } from "react";
import type { ConversationMessage } from "@paperclipai/shared";
import { Check, CheckCheck, Clock, AlertTriangle } from "lucide-react";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function attachmentUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value, window.location.origin);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

export function ConversationThread({ messages, busy, onSend, onRetry, onReconcile, pending, windowClosed }: {
  messages: ConversationMessage[]; busy: boolean; pending: string | null; windowClosed: boolean;
  onSend: (id: string) => void; onRetry: (message: ConversationMessage) => void; onReconcile: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const end = useRef<HTMLDivElement>(null);
  const latestId = messages.at(-1)?.id;
  useEffect(() => { end.current?.scrollIntoView?.({ block: "nearest" }); }, [latestId, pending]);
  return <div className="flex flex-col gap-3">
    {!messages.length && <p className="text-sm text-muted-foreground">{t("conversations.thread.empty")}</p>}
    <ol className="flex flex-col gap-3">
      {messages.map((message, index) => {
        const date = new Date(message.createdAt);
        const day = date.toLocaleDateString(i18n?.language);
        const outbound = message.direction === "outbound";
        const status = message.deliveryStatus;
        const Icon = status === "read" || status === "delivered" ? CheckCheck : status === "sent" ? Check : status === "failed" || status === "uncertain" ? AlertTriangle : Clock;
        const reason = message.providerReceipt?.error;
        return <Fragment key={message.id}>
          {(index === 0 || new Date(messages[index - 1].createdAt).toLocaleDateString(i18n?.language) !== day) && <li className="text-center text-xs text-muted-foreground"><time dateTime={message.createdAt}>{day}</time></li>}
          <li data-message-id={message.id} className={cn("flex flex-col gap-2 rounded-lg border border-border p-3 sm:max-w-prose", outbound ? "self-end bg-muted" : "self-start bg-background")}>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{t(`conversationsUx.actor.${message.actorKind ?? (outbound ? "user" : "contact")}`)}</span>
              <time dateTime={message.createdAt} title={date.toLocaleString(i18n?.language)}>{date.toLocaleTimeString(i18n?.language, { hour: "2-digit", minute: "2-digit" })}</time>
            </div>
            <p className="whitespace-pre-wrap break-words text-sm" dir="auto">{message.body}</p>
            {(message.attachments ?? []).map((attachment, attachmentIndex) => {
              const url = attachmentUrl(attachment.url);
              if (!url) return null;
              const name = typeof attachment.name === "string" ? attachment.name : t("conversationsUx.attachment");
              const mime = typeof attachment.mimeType === "string" ? attachment.mimeType : typeof attachment.contentType === "string" ? attachment.contentType : "";
              return <a key={attachmentIndex} href={url} target="_blank" rel="noopener noreferrer" className="flex flex-col gap-1 text-sm underline">
                {mime.startsWith("image/") && <img src={url} alt={name} loading="lazy" referrerPolicy="no-referrer" className="max-h-64 max-w-full rounded-md object-contain" />}
                {name}
              </a>;
            })}
            {outbound && <div className="flex flex-wrap items-center justify-end gap-2">
              <Badge variant={status === "failed" ? "destructive" : status === "read" ? "default" : "outline"} data-delivery-status={status}><Icon aria-hidden="true" className="size-3" />{t(`conversations.delivery.${status}`)}</Badge>
              {status === "draft" && <Button size="sm" disabled={busy || windowClosed} onClick={() => onSend(message.id)}>{t("conversations.composer.send")}</Button>}
              {status === "failed" && <Button size="sm" variant="outline" disabled={busy || windowClosed} onClick={() => onRetry(message)}>{t("conversationsUx.retryMessage")}</Button>}
              {(status === "uncertain" || status === "queued") && <Button size="sm" variant="outline" disabled={busy} onClick={() => onReconcile(message.id)}>{t("conversations.reconcile.check")}</Button>}
            </div>}
            {status === "failed" && <p role="alert" className="break-words text-xs text-destructive">{typeof reason === "string" ? reason : t("conversations.deliveryHint.failed")}</p>}
          </li>
        </Fragment>;
      })}
    </ol>
    {pending && <div role="status" className="flex flex-col gap-1 self-end rounded-lg bg-muted p-3"><p className="whitespace-pre-wrap break-words text-sm">{pending}</p><span className="text-xs text-muted-foreground">{t("conversations.composer.sending")}</span></div>}
    <div ref={end} />
  </div>;
}
