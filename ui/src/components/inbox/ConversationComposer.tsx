import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/i18n";
import { conversationsApi, type SendOutcome } from "../../api/conversations";

// Reply composer. "Save draft" stores a draft; "Send" stores it and runs the external action gate.
// Each click generates its own idempotency key, so a double click on one press creates one draft.
export function ConversationComposer({
  conversationId,
  onChanged,
}: {
  conversationId: string;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(send: boolean) {
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const draft = await conversationsApi.draft(conversationId, { body: text, attachments: [], idempotencyKey: crypto.randomUUID() });
      if (!send) {
        setNotice(t("conversations.composer.saved"));
      } else {
        const outcome: SendOutcome = await conversationsApi.send(draft.id);
        if (outcome.mode === "draft") setNotice(t("conversations.composer.draftOnlyNote"));
        else if (outcome.mode === "approval") setNotice(t("conversations.composer.approvalNote"));
      }
      setBody("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("conversations.errors.send"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t("conversations.composer.placeholder")}
        rows={4}
        disabled={busy}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          {error ? <span role="alert" className="text-destructive">{error}</span> : notice}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={busy || !body.trim()} onClick={() => run(false)}>
            {t("conversations.composer.saveDraft")}
          </Button>
          <Button disabled={busy || !body.trim()} onClick={() => run(true)}>
            {busy ? t("conversations.composer.sending") : t("conversations.composer.send")}
          </Button>
        </div>
      </div>
    </div>
  );
}
