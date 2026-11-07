import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { crmMemoryApi, type CustomerMemoryNote } from "@/api/crm-memory";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/i18n";

const memoryQueryKey = (customerId: string) => ["crm-memory", customerId] as const;

function formatWhen(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function CustomerMemory({ customerId }: { customerId: string }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [key, setKey] = useState("");
  const [content, setContent] = useState("");

  const notesQuery = useQuery({
    queryKey: memoryQueryKey(customerId),
    queryFn: () => crmMemoryApi.list(customerId),
    enabled: Boolean(customerId),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: memoryQueryKey(customerId) });

  const appendMutation = useMutation({
    mutationFn: (input: { key: string; content: string }) =>
      crmMemoryApi.append(customerId, { key: input.key, content: input.content, source: "user" }),
    onSuccess: () => {
      setKey("");
      setContent("");
      void refresh();
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (noteId: string) => crmMemoryApi.archive(noteId),
    onSuccess: () => void refresh(),
  });

  // Notes arrive ordered by key and date; group them for display without reordering.
  const groups = useMemo(() => {
    const map = new Map<string, CustomerMemoryNote[]>();
    for (const note of notesQuery.data ?? []) {
      const list = map.get(note.key) ?? [];
      list.push(note);
      map.set(note.key, list);
    }
    return Array.from(map.entries());
  }, [notesQuery.data]);

  const canSubmit = key.trim().length > 0 && content.trim().length > 0 && !appendMutation.isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    appendMutation.mutate({ key: key.trim(), content: content.trim() });
  }

  function errorMessage(error: unknown) {
    if (error instanceof ApiError && error.message) return error.message;
    return t("crm.memory.error");
  }

  return (
    <section className="space-y-4" aria-labelledby="crm-memory-title">
      <div className="space-y-1">
        <h2 id="crm-memory-title" className="text-sm font-semibold text-foreground">
          {t("crm.memory.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("crm.memory.description")}</p>
      </div>

      {notesQuery.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t("crm.memory.loading")}
        </p>
      ) : notesQuery.isError ? (
        <div role="alert" className="space-y-2">
          <p className="text-sm text-destructive">{errorMessage(notesQuery.error)}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void notesQuery.refetch()}>
            {t("crm.memory.retry")}
          </Button>
        </div>
      ) : groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("crm.memory.empty")}</p>
      ) : (
        <div className="space-y-4">
          {groups.map(([groupKey, notes]) => (
            <div key={groupKey} className="space-y-2">
              <h3 className="text-sm font-medium text-foreground">{groupKey}</h3>
              <ul className="space-y-2">
                {notes.map((note) => (
                  <li key={note.id} className="rounded-md border border-border bg-card p-3 space-y-2">
                    <p className="whitespace-pre-wrap text-sm text-foreground">{note.content}</p>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline">{t(`crm.memory.source.${note.source}`)}</Badge>
                        <time dateTime={note.createdAt}>{formatWhen(note.createdAt, i18n.language)}</time>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={archiveMutation.isPending}
                        onClick={() => archiveMutation.mutate(note.id)}
                      >
                        {archiveMutation.isPending && archiveMutation.variables === note.id
                          ? t("crm.memory.archiving")
                          : t("crm.memory.archive")}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {archiveMutation.isError ? (
        <p role="alert" className="text-sm text-destructive">{errorMessage(archiveMutation.error)}</p>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-3 border-t border-border pt-4">
        <h3 className="text-sm font-medium text-foreground">{t("crm.memory.addTitle")}</h3>
        <div className="space-y-1">
          <label htmlFor="crm-memory-key" className="text-sm text-muted-foreground">
            {t("crm.memory.keyLabel")}
          </label>
          <Input
            id="crm-memory-key"
            value={key}
            maxLength={120}
            placeholder={t("crm.memory.keyPlaceholder")}
            onChange={(event) => setKey(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="crm-memory-content" className="text-sm text-muted-foreground">
            {t("crm.memory.contentLabel")}
          </label>
          <Textarea
            id="crm-memory-content"
            value={content}
            maxLength={4000}
            placeholder={t("crm.memory.contentPlaceholder")}
            onChange={(event) => setContent(event.target.value)}
          />
        </div>
        {appendMutation.isError ? (
          <p role="alert" className="text-sm text-destructive">{errorMessage(appendMutation.error)}</p>
        ) : null}
        <div className="flex justify-end">
          <Button type="submit" disabled={!canSubmit}>
            {appendMutation.isPending ? t("crm.memory.adding") : t("crm.memory.add")}
          </Button>
        </div>
      </form>
    </section>
  );
}
