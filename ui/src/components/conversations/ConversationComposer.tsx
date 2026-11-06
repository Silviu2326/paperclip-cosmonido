import { useRef, useState } from "react";
import type { Conversation, ConversationMessage } from "@paperclipai/shared";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { conversationsApi } from "@/api/conversations";

export function whatsappWindowRemaining(conversation: Pick<Conversation, "lastInboundAt">, messages: ConversationMessage[], now: number) {
  const timestamp = conversation.lastInboundAt || messages.filter((message) => message.direction === "inbound").at(-1)?.createdAt;
  const inbound = timestamp ? new Date(timestamp).getTime() : NaN;
  return Number.isFinite(inbound) ? Math.min(24 * 60 * 60 * 1000, Math.max(0, 24 * 60 * 60 * 1000 - (now - inbound))) : 0;
}

export function ConversationComposer({ conversation, windowClosed, onChanged, onPending }: {
  conversation: Conversation; windowClosed: boolean;
  onChanged: () => Promise<void>; onPending: (body: string | null) => void;
}) {
  const { t } = useTranslation();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const request = useRef<{ body: string; key: string; draft?: ConversationMessage } | null>(null);
  const lock = useRef(false);
  const limit = conversation.channel === "whatsapp" ? 4096 : conversation.channel === "telegram" ? 4096 : conversation.channel === "messenger" ? 2000 : conversation.channel === "instagram" ? 1000 : 100000;
  const tooLong = body.length > limit;

  async function run(send: boolean) {
    const text = body.trim();
    if (!text || lock.current || tooLong || send && windowClosed) return;
    lock.current = true;
    setBusy(true); setError(null); setNotice(null);
    if (send) onPending(text);
    let attempt = request.current;
    if (!attempt || attempt.body !== text) {
      attempt = { body: text, key: crypto.randomUUID() };
      request.current = attempt;
    }
    try {
      const draft = attempt.draft ?? await conversationsApi.draft(conversation.id, { body: text, attachments: [], idempotencyKey: attempt.key });
      attempt.draft = draft;
      if (send) {
        const result = await conversationsApi.send(draft.id);
        if (result.mode === "draft") setNotice(t("conversations.composer.draftOnlyNote"));
        if (result.mode === "approval") setNotice(t("conversations.composer.approvalNote"));
      } else setNotice(t("conversations.composer.saved"));
      setBody(""); request.current = null;
    } catch (err) {
      setError(err instanceof Error ? err.message : t("conversations.errors.send"));
    } finally {
      try { await onChanged(); }
      catch (err) { setError(err instanceof Error ? err.message : t("conversations.errors.generic")); }
      finally { onPending(null); setBusy(false); lock.current = false; }
    }
  }

  return <div className="flex flex-col gap-2">
    {windowClosed && <p id="window-hint" className="text-sm text-muted-foreground">{t("conversationsUx.templateOnly")}</p>}
    <label htmlFor="conversation-reply" className="text-sm font-medium">{t("conversationsUx.reply")}</label>
    <Textarea id="conversation-reply" value={body} onChange={(event) => setBody(event.target.value)} rows={3} disabled={busy}
      placeholder={t("conversations.composer.placeholder")} aria-invalid={tooLong} aria-describedby={windowClosed ? "composer-hint window-hint" : "composer-hint"}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void run(true); }
      }} />
    <div id="composer-hint" className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span>{t("conversationsUx.keyboardHint")}</span><span className={tooLong ? "font-mono text-destructive" : "font-mono"}>{body.length.toLocaleString()} / {limit.toLocaleString()}</span></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    <div className="flex items-center justify-between gap-2">
      <Button variant="outline" disabled={busy || !body.trim() || tooLong} onClick={() => void run(false)}>{t("conversations.composer.saveDraft")}</Button>
      <Button disabled={busy || !body.trim() || tooLong || windowClosed} onClick={() => void run(true)}>{t(busy ? "conversations.composer.sending" : "conversations.composer.send")}</Button>
    </div>
  </div>;
}
