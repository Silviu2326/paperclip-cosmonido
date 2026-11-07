import { useMemo, useRef, useState, type FormEvent } from "react";
import { officePatchSchema, type Agent, type OfficePatch } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslation } from "@/i18n";
import { ApiError } from "../api/client";
import { officeApi, type OfficeHistoryEntry } from "../api/office";
import type { OfficeCatalog } from "./catalog";
import { interpretOfficeMessage, type DesignLanguage } from "./design-chat";
import type { OfficeLayoutController } from "./useOfficeLayout";

export interface OfficeChatProps {
  companyId: string;
  catalog: OfficeCatalog;
  agents: readonly Agent[];
  office: OfficeLayoutController;
  uiLanguage: string;
}

type Message =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "assistant"; text: string; changes: number; rejected: string[]; undoable: boolean }
  | { id: number; role: "assistant"; text: string; error: true };

type MessageDraft =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; changes: number; rejected: string[]; undoable: boolean }
  | { role: "assistant"; text: string; error: true };

const HISTORY_TURNS = 10;

/** Server design-chat first (contract 3); the local interpreter when the company has no AI connection or the call fails at the network. */
async function answer(companyId: string, message: string, office: OfficeLayoutController, catalog: OfficeCatalog, agents: readonly Agent[], history: OfficeHistoryEntry[], language: DesignLanguage): Promise<{ reply: string; patch: OfficePatch }> {
  const layout = office.layout;
  if (!layout) throw new Error("layout not loaded");
  try {
    const response = await officeApi.designChat(companyId, { message, layout, history });
    const parsed = officePatchSchema.safeParse(response.patch);
    if (!parsed.success || typeof response.reply !== "string") throw new Error("invalid design-chat response");
    return { reply: response.reply, patch: parsed.data };
  } catch (error) {
    const serverRefused = error instanceof ApiError && error.status !== 409 && error.status !== 0;
    if (serverRefused) throw error;
    const local = interpretOfficeMessage({ message, layout, catalog, agents, language });
    return { reply: local.reply, patch: local.patch };
  }
}

export function OfficeChat({ companyId, catalog, agents, office, uiLanguage }: OfficeChatProps) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [lastAppliedId, setLastAppliedId] = useState<number | null>(null);
  const nextId = useRef(1);
  const language: DesignLanguage = uiLanguage.startsWith("es") ? "es" : "en";

  const history = useMemo<OfficeHistoryEntry[]>(
    () => messages.flatMap(message => ("error" in message ? [] : [{ role: message.role, content: message.text }])).slice(-HISTORY_TURNS),
    [messages],
  );

  const push = (message: MessageDraft) => {
    const id = nextId.current++;
    setMessages(current => [...current, { ...message, id }]);
    return id;
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = input.trim();
    if (!text || sending || !office.layout) return;
    setInput("");
    push({ role: "user", text });
    setSending(true);
    try {
      const { reply, patch } = await answer(companyId, text, office, catalog, agents, history, language);
      const result = office.applyPatch(patch);
      const id = push({
        role: "assistant",
        text: reply,
        changes: result.changed ? patch.length - result.rejected.length : 0,
        rejected: result.rejected,
        undoable: result.changed,
      });
      if (result.changed) setLastAppliedId(id);
    } catch {
      push({ role: "assistant", text: t("office.chat.error"), error: true });
    } finally {
      setSending(false);
    }
  };

  const undo = (id: number) => {
    office.undo();
    setLastAppliedId(null);
    setMessages(current => current.map(message => (message.id === id && !("error" in message) ? { ...message, undoable: false } : message)));
  };

  const reset = async () => {
    if (sending) return;
    const ok = await office.reset();
    setLastAppliedId(null);
    setMessages(current => [...current, { id: nextId.current++, role: "assistant", text: ok ? t("office.chat.resetDone") : t("office.chat.error"), ...(ok ? { changes: 0, rejected: [], undoable: false } : { error: true }) } as Message]);
  };

  const canUndoLast = lastAppliedId !== null && office.canUndo;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="text-sm text-muted-foreground">{t("office.chat.intro")}</div>
      <ScrollArea className="min-h-0 flex-1 rounded-lg border">
        <ul className="flex flex-col gap-2 p-3" aria-live="polite">
          {messages.map(message => (
            <li key={message.id} className={message.role === "user" ? "ml-auto max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground" : "mr-auto max-w-[85%] rounded-lg bg-muted px-3 py-2 text-sm"}>
              <div className="whitespace-pre-wrap">{message.text}</div>
              {message.role === "assistant" && "changes" in message && message.changes > 0 ? (
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{t("office.chat.changes", { count: message.changes })}</span>
                  {message.undoable && canUndoLast && lastAppliedId === message.id ? (
                    <Button type="button" size="xs" variant="outline" onClick={() => undo(message.id)}>{t("office.chat.undo")}</Button>
                  ) : null}
                </div>
              ) : null}
              {message.role === "assistant" && "rejected" in message && message.rejected.length > 0 ? (
                <div className="mt-1 text-xs text-destructive">{t("office.chat.rejected", { reason: message.rejected.join("; ") })}</div>
              ) : null}
            </li>
          ))}
        </ul>
      </ScrollArea>
      <form className="flex items-center gap-2" onSubmit={submit}>
        <Input
          value={input}
          onChange={event => setInput(event.target.value)}
          placeholder={t("office.chat.placeholder")}
          aria-label={t("office.chat.placeholder")}
          disabled={sending || !office.layout}
        />
        <Button type="submit" disabled={sending || !input.trim() || !office.layout}>
          {sending ? t("office.chat.sending") : t("office.chat.send")}
        </Button>
      </form>
      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={sending || !office.layout}>
          {t("office.chat.reset")}
        </Button>
      </div>
    </div>
  );
}
