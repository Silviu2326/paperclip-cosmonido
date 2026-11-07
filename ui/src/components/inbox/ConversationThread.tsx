import type { ConversationMessage } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n";
import { ConversationDeliveryBadge } from "./ConversationDeliveryBadge";

export function ConversationThread({
  messages,
  busy,
  onSend,
  onReconcile,
}: {
  messages: ConversationMessage[];
  busy: boolean;
  onSend: (messageId: string) => void;
  onReconcile: (messageId: string) => void;
}) {
  const { t } = useTranslation();
  if (messages.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("conversations.thread.empty")}</p>;
  }
  return (
    <ol className="space-y-3">
      {messages.map((message) => {
        const outbound = message.direction === "outbound";
        return (
          <li
            key={message.id}
            className={`rounded-md border border-border p-3 ${outbound ? "ml-8 bg-muted/40" : "mr-8"}`}
            data-message-id={message.id}
          >
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {outbound ? t("conversations.thread.outbound") : t("conversations.thread.inbound")}
                {" · "}
                {new Date(message.createdAt).toLocaleString()}
              </span>
              <ConversationDeliveryBadge status={message.deliveryStatus} />
            </div>
            <p className="whitespace-pre-wrap text-sm">{message.body}</p>
            {message.deliveryStatus === "draft" && outbound && (
              <div className="mt-2 flex items-center justify-end gap-2">
                <span className="text-xs text-muted-foreground">{t("conversations.thread.draftLabel")}</span>
                <Button size="sm" disabled={busy} onClick={() => onSend(message.id)}>
                  {t("conversations.composer.send")}
                </Button>
              </div>
            )}
            {message.deliveryStatus === "uncertain" && (
              <div className="mt-2 space-y-1">
                <p className="text-xs text-muted-foreground">{t("conversations.deliveryHint.uncertain")}</p>
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => onReconcile(message.id)}>
                    {t("conversations.reconcile.check")}
                  </Button>
                </div>
              </div>
            )}
            {message.deliveryStatus === "failed" && (
              <p className="mt-2 text-xs text-muted-foreground">{t("conversations.deliveryHint.failed")}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
