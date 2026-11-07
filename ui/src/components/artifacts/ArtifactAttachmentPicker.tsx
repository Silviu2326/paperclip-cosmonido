import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AttachIssueArtifact, CompanyArtifact } from "@paperclipai/shared";
import { companyFilesApi, type CompanyFile } from "@/api/company-files";
import { artifactsApi } from "@/api/artifacts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/i18n";

export type SelectedIssueArtifact = AttachIssueArtifact & { title: string };

function selectionKey(item: AttachIssueArtifact) {
  return `${item.source}:${item.id}:${item.versionId ?? "current"}`;
}

function outputSelection(artifact: CompanyArtifact): SelectedIssueArtifact | null {
  const prefix = `${artifact.source}:`;
  const id = artifact.id.startsWith(prefix) ? artifact.id.slice(prefix.length) : artifact.id;
  if (!id) return null;
  return { source: artifact.source, id, title: artifact.title };
}

export function artifactSelectionFromExplorer(item: {
  box: "in" | "out";
  name: string;
  raw: CompanyFile | CompanyArtifact;
}, versionId?: string | null): SelectedIssueArtifact {
  if (item.box === "in") {
    const file = item.raw as CompanyFile;
    return { source: "company_file", id: file.id, versionId: versionId ?? file.currentVersionId ?? undefined, title: file.name };
  }
  const artifact = item.raw as CompanyArtifact;
  return outputSelection(artifact) ?? { source: artifact.source, id: artifact.id, title: item.name };
}

export function ArtifactAttachmentPicker({
  companyId,
  onAdd,
  disabled = false,
}: {
  companyId: string;
  onAdd: (items: SelectedIssueArtifact[]) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<"in" | "out">("in");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Record<string, SelectedIssueArtifact>>({});
  const searching = query.trim().length >= 2;
  const files = useQuery({
    queryKey: ["artifact-attachment-picker", companyId, "in", query.trim()],
    queryFn: () => companyFilesApi.list(companyId, { scope: "all", q: query.trim(), sort: "name", dir: "asc" }),
    enabled: open && box === "in" && searching,
  });
  const artifacts = useQuery({
    queryKey: ["artifact-attachment-picker", companyId, "out", query.trim()],
    queryFn: () => artifactsApi.list(companyId, { q: query.trim(), limit: 50 }),
    enabled: open && box === "out" && searching,
  });
  const rows = useMemo<SelectedIssueArtifact[]>(() => {
    if (!searching) return [];
    if (box === "in") return (files.data?.files ?? []).slice(0, 50).map((file: CompanyFile) => ({
      source: "company_file",
      id: file.id,
      versionId: file.currentVersionId ?? undefined,
      title: file.name,
    }));
    return (artifacts.data?.artifacts ?? []).flatMap((artifact) => {
      const selection = outputSelection(artifact);
      return selection ? [selection] : [];
    });
  }, [artifacts.data?.artifacts, box, files.data?.files, searching]);
  const loading = box === "in" ? files.isLoading : artifacts.isLoading;
  const error = box === "in" ? files.error : artifacts.error;

  const toggle = (item: SelectedIssueArtifact) => {
    const key = selectionKey(item);
    setSelected((current) => {
      if (key in current) {
        const next = { ...current };
        delete next[key];
        return next;
      }
      return { ...current, [key]: item };
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => {
      setOpen(next);
      if (!next) {
        setQuery("");
        setSelected({});
      }
    }}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled}>
          {t("artifactPicker.add")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("artifactPicker.title")}</DialogTitle>
          <DialogDescription>{t("artifactPicker.description")}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant={box === "in" ? "secondary" : "outline"} onClick={() => setBox("in")}>{t("artifactPicker.inbox")}</Button>
          <Button type="button" size="sm" variant={box === "out" ? "secondary" : "outline"} onClick={() => setBox("out")}>{t("artifactPicker.outbox")}</Button>
        </div>
        <Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("artifactPicker.search")} />
        <div className="max-h-72 min-h-24 overflow-y-auto rounded-md border border-border">
          {!searching ? <p className="p-3 text-sm text-muted-foreground">{t("artifactPicker.searchHint")}</p>
            : loading ? <p className="p-3 text-sm text-muted-foreground">{t("common.loading")}</p>
              : error ? <p role="alert" className="p-3 text-sm text-destructive">{error.message}</p>
                : rows.length === 0 ? <p className="p-3 text-sm text-muted-foreground">{t("artifactPicker.empty")}</p>
                  : rows.map((item) => {
                    const key = selectionKey(item);
                    const checked = key in selected;
                    return (
                      <button key={key} type="button" role="checkbox" aria-checked={checked} onClick={() => toggle(item)}
                        className="flex w-full items-center gap-3 border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-accent">
                        <span aria-hidden="true" className="flex size-4 shrink-0 items-center justify-center rounded-sm border border-input text-xs">{checked ? "✓" : ""}</span>
                        <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
                        <span className="text-xs text-muted-foreground">{t(`artifactPicker.source.${item.source}`)}</span>
                      </button>
                    );
                  })}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button type="button" disabled={Object.keys(selected).length === 0} onClick={() => {
            onAdd(Object.values(selected));
            setOpen(false);
          }}>{t("artifactPicker.addSelected", { count: Object.keys(selected).length })}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
