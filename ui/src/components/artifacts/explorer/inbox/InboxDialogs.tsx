import { type ReactNode, type RefObject, useCallback, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type CompanyFile, companyFilesApi } from "@/api/company-files";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/context/ToastContext";
import { useTranslation } from "@/i18n";
import { queryKeys } from "@/lib/queryKeys";
import { FolderPickerDialog } from "./FolderPickerDialog";

interface FolderRef {
  id: string;
  name: string;
}

interface ArtifactRef {
  source: "attachment" | "work_product" | "document";
  id: string;
  name: string;
}

/** A named file or folder target for rename and delete. */
interface EntryRef {
  kind: "file" | "folder";
  id: string;
  name: string;
}

type ActiveDialog =
  | { kind: "newFolder"; parentId: string | null }
  | { kind: "renameFile"; entry: EntryRef }
  | { kind: "renameFolder"; entry: EntryRef }
  | { kind: "moveFile"; file: CompanyFile }
  | { kind: "deleteFile"; entry: EntryRef }
  | { kind: "deleteFolder"; entry: EntryRef }
  | { kind: "replaceVersion"; file: CompanyFile }
  | { kind: "moveToInbox"; artifact: ArtifactRef };

export interface InboxDialogsApi {
  /** Render once in the page. Null while no dialog is open. */
  dialogs: ReactNode;
  openNewFolder(parentId: string | null): void;
  openRenameFile(file: CompanyFile): void;
  openRenameFolder(folder: FolderRef): void;
  openMoveFile(file: CompanyFile): void;
  openDeleteFile(file: CompanyFile): void;
  openDeleteFolder(folder: FolderRef): void;
  openReplaceVersion(file: CompanyFile): void;
  openMoveToInbox(artifact: ArtifactRef): void;
}

/**
 * Entrada dialogs for the explorer page. Only one dialog is open at a time.
 * Mutations invalidate every company-files query (list and tree) and report
 * failures inside the dialog.
 */
export function useInboxDialogs(companyId: string): InboxDialogsApi {
  const [active, setActive] = useState<ActiveDialog | null>(null);
  const close = useCallback(() => setActive(null), []);

  const openNewFolder = useCallback((parentId: string | null) => setActive({ kind: "newFolder", parentId }), []);
  const openRenameFile = useCallback(
    (file: CompanyFile) => setActive({ kind: "renameFile", entry: { kind: "file", id: file.id, name: file.name } }),
    [],
  );
  const openRenameFolder = useCallback(
    (folder: FolderRef) => setActive({ kind: "renameFolder", entry: { kind: "folder", id: folder.id, name: folder.name } }),
    [],
  );
  const openMoveFile = useCallback((file: CompanyFile) => setActive({ kind: "moveFile", file }), []);
  const openDeleteFile = useCallback(
    (file: CompanyFile) => setActive({ kind: "deleteFile", entry: { kind: "file", id: file.id, name: file.name } }),
    [],
  );
  const openDeleteFolder = useCallback(
    (folder: FolderRef) => setActive({ kind: "deleteFolder", entry: { kind: "folder", id: folder.id, name: folder.name } }),
    [],
  );
  const openReplaceVersion = useCallback((file: CompanyFile) => setActive({ kind: "replaceVersion", file }), []);
  const openMoveToInbox = useCallback((artifact: ArtifactRef) => setActive({ kind: "moveToInbox", artifact }), []);

  const dialogs = active ? (
    <ActiveInboxDialog key={dialogKey(active)} companyId={companyId} dialog={active} onClose={close} />
  ) : null;

  return {
    dialogs,
    openNewFolder,
    openRenameFile,
    openRenameFolder,
    openMoveFile,
    openDeleteFile,
    openDeleteFolder,
    openReplaceVersion,
    openMoveToInbox,
  };
}

function dialogKey(dialog: ActiveDialog): string {
  switch (dialog.kind) {
    case "newFolder":
      return `newFolder:${dialog.parentId ?? "root"}`;
    case "renameFile":
    case "renameFolder":
    case "deleteFile":
    case "deleteFolder":
      return `${dialog.kind}:${dialog.entry.id}`;
    case "moveFile":
    case "replaceVersion":
      return `${dialog.kind}:${dialog.file.id}`;
    case "moveToInbox":
      return `moveToInbox:${dialog.artifact.source}:${dialog.artifact.id}`;
  }
}

function ActiveInboxDialog({
  companyId,
  dialog,
  onClose,
}: {
  companyId: string;
  dialog: ActiveDialog;
  onClose: () => void;
}) {
  switch (dialog.kind) {
    case "newFolder":
      return <NewFolderDialog companyId={companyId} parentId={dialog.parentId} onClose={onClose} />;
    case "renameFile":
    case "renameFolder":
      return <RenameDialog companyId={companyId} entry={dialog.entry} onClose={onClose} />;
    case "moveFile":
      return <MoveFileDialog companyId={companyId} file={dialog.file} onClose={onClose} />;
    case "deleteFile":
    case "deleteFolder":
      return <DeleteDialog companyId={companyId} entry={dialog.entry} onClose={onClose} />;
    case "replaceVersion":
      return <ReplaceVersionDialog companyId={companyId} file={dialog.file} onClose={onClose} />;
    case "moveToInbox":
      return <MoveToInboxDialog companyId={companyId} artifact={dialog.artifact} onClose={onClose} />;
  }
}

function useInvalidateCompanyFiles(companyId: string) {
  const queryClient = useQueryClient();
  // The tree query key lives under the same prefix, so this refreshes lists and tree.
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.companyFiles.all(companyId) }),
    [queryClient, companyId],
  );
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

interface InboxFormDialogProps {
  title: string;
  description?: string;
  submitLabel: string;
  destructive?: boolean;
  pending: boolean;
  error: string | null;
  submitDisabled?: boolean;
  /** Focused and selected when the dialog opens. */
  focusRef?: RefObject<HTMLInputElement | null>;
  onSubmit: () => void;
  onClose: () => void;
  children?: ReactNode;
}

/** Shared shell: form submits on Enter, Cancel left, primary action right. */
function InboxFormDialog({
  title,
  description,
  submitLabel,
  destructive = false,
  pending,
  error,
  submitDisabled = false,
  focusRef,
  onSubmit,
  onClose,
  children,
}: InboxFormDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="sm:max-w-md"
        onOpenAutoFocus={(event) => {
          if (!focusRef?.current) return;
          event.preventDefault();
          focusRef.current.focus();
          focusRef.current.select();
        }}
      >
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!pending && !submitDisabled) onSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className={description ? undefined : "sr-only"}>
              {description ?? title}
            </DialogDescription>
          </DialogHeader>
          {children}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("artifacts.explorer.inbox.cancel")}
            </Button>
            <Button
              type="submit"
              variant={destructive ? "destructive" : "default"}
              disabled={pending || submitDisabled}
            >
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NameField({
  id,
  label,
  value,
  onChange,
  inputRef,
  invalid,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  invalid?: boolean;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        ref={inputRef}
        value={value}
        autoComplete="off"
        aria-invalid={invalid || undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function NewFolderDialog({
  companyId,
  parentId,
  onClose,
}: {
  companyId: string;
  parentId: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { pushToast } = useToast();
  const invalidate = useInvalidateCompanyFiles(companyId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (folderName: string) => companyFilesApi.createFolder(companyId, { name: folderName, parentId }),
    onSuccess: (folder) => {
      void invalidate();
      pushToast({ title: t("artifacts.explorer.inbox.folder.created", { name: folder.name }), tone: "success" });
      onClose();
    },
  });

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(t("artifacts.explorer.inbox.nameRequired"));
      return;
    }
    setNameError(null);
    mutation.mutate(trimmed);
  }

  return (
    <InboxFormDialog
      title={t("artifacts.explorer.inbox.folder.newTitle")}
      description={t("artifacts.explorer.inbox.folder.newDescription")}
      submitLabel={t("artifacts.explorer.inbox.folder.newConfirm")}
      pending={mutation.isPending}
      error={nameError ?? (mutation.error ? errorText(mutation.error, t("artifacts.explorer.inbox.genericError")) : null)}
      focusRef={inputRef}
      onSubmit={submit}
      onClose={onClose}
    >
      <NameField
        id="inbox-new-folder-name"
        label={t("artifacts.explorer.inbox.nameLabel")}
        value={name}
        onChange={setName}
        inputRef={inputRef}
        invalid={nameError !== null}
      />
    </InboxFormDialog>
  );
}

function RenameDialog({
  companyId,
  entry,
  onClose,
}: {
  companyId: string;
  entry: EntryRef;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { pushToast } = useToast();
  const invalidate = useInvalidateCompanyFiles(companyId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(entry.name);
  const [nameError, setNameError] = useState<string | null>(null);
  const isFile = entry.kind === "file";

  const mutation = useMutation({
    mutationFn: async (nextName: string): Promise<{ name: string }> =>
      isFile
        ? companyFilesApi.update(entry.id, { name: nextName })
        : companyFilesApi.updateFolder(entry.id, { name: nextName }),
    onSuccess: (saved) => {
      void invalidate();
      pushToast({
        title: t(isFile ? "artifacts.explorer.inbox.rename.fileRenamed" : "artifacts.explorer.inbox.rename.folderRenamed", {
          name: saved.name,
        }),
        tone: "success",
      });
      onClose();
    },
  });

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(t("artifacts.explorer.inbox.nameRequired"));
      return;
    }
    if (trimmed === entry.name) {
      onClose();
      return;
    }
    setNameError(null);
    mutation.mutate(trimmed);
  }

  return (
    <InboxFormDialog
      title={t(isFile ? "artifacts.explorer.inbox.rename.fileTitle" : "artifacts.explorer.inbox.rename.folderTitle")}
      submitLabel={t("artifacts.explorer.inbox.rename.confirm")}
      pending={mutation.isPending}
      error={nameError ?? (mutation.error ? errorText(mutation.error, t("artifacts.explorer.inbox.genericError")) : null)}
      focusRef={inputRef}
      onSubmit={submit}
      onClose={onClose}
    >
      <NameField
        id="inbox-rename-name"
        label={t("artifacts.explorer.inbox.nameLabel")}
        value={name}
        onChange={setName}
        inputRef={inputRef}
        invalid={nameError !== null}
      />
    </InboxFormDialog>
  );
}

function MoveFileDialog({
  companyId,
  file,
  onClose,
}: {
  companyId: string;
  file: CompanyFile;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { pushToast } = useToast();
  const invalidate = useInvalidateCompanyFiles(companyId);

  const mutation = useMutation({
    mutationFn: (folderId: string | null) => companyFilesApi.update(file.id, { folderId }),
    onSuccess: (saved) => {
      void invalidate();
      pushToast({ title: t("artifacts.explorer.inbox.move.moved", { name: saved.name }), tone: "success" });
      onClose();
    },
  });

  return (
    <FolderPickerDialog
      open
      companyId={companyId}
      title={t("artifacts.explorer.inbox.move.title")}
      confirmLabel={t("artifacts.explorer.inbox.move.confirm")}
      initialFolderId={file.folderId}
      pending={mutation.isPending}
      error={mutation.error ? errorText(mutation.error, t("artifacts.explorer.inbox.genericError")) : null}
      onConfirm={(folderId) => {
        if (folderId === file.folderId) {
          onClose();
          return;
        }
        mutation.mutate(folderId);
      }}
      onClose={onClose}
    />
  );
}

function DeleteDialog({
  companyId,
  entry,
  onClose,
}: {
  companyId: string;
  entry: EntryRef;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { pushToast } = useToast();
  const invalidate = useInvalidateCompanyFiles(companyId);
  const isFile = entry.kind === "file";

  const mutation = useMutation({
    mutationFn: async (): Promise<void> => {
      if (isFile) await companyFilesApi.remove(entry.id);
      else await companyFilesApi.removeFolder(entry.id);
    },
    onSuccess: () => {
      void invalidate();
      pushToast({
        title: t(isFile ? "artifacts.explorer.inbox.delete.fileDeleted" : "artifacts.explorer.inbox.delete.folderDeleted", {
          name: entry.name,
        }),
        tone: "success",
      });
      onClose();
    },
  });

  return (
    <InboxFormDialog
      title={t(isFile ? "artifacts.explorer.inbox.delete.fileTitle" : "artifacts.explorer.inbox.delete.folderTitle")}
      description={t(
        isFile ? "artifacts.explorer.inbox.delete.fileDescription" : "artifacts.explorer.inbox.delete.folderDescription",
        { name: entry.name },
      )}
      submitLabel={t("artifacts.explorer.inbox.delete.confirm")}
      destructive
      pending={mutation.isPending}
      error={mutation.error ? errorText(mutation.error, t("artifacts.explorer.inbox.genericError")) : null}
      onSubmit={() => mutation.mutate()}
      onClose={onClose}
    />
  );
}

function ReplaceVersionDialog({
  companyId,
  file,
  onClose,
}: {
  companyId: string;
  file: CompanyFile;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const invalidate = useInvalidateCompanyFiles(companyId);
  const [picked, setPicked] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (input: { upload: File; note: string }) =>
      companyFilesApi.addVersion(file.id, input.upload, { note: input.note || undefined }),
    onSuccess: (saved) => {
      void invalidate();
      void queryClient.invalidateQueries({ queryKey: queryKeys.companyFiles.versions(file.id) });
      pushToast({
        title: t("artifacts.explorer.inbox.version.added", {
          name: saved.name,
          version: saved.currentVersionNumber ?? "",
        }),
        tone: "success",
      });
      onClose();
    },
  });

  function submit() {
    if (!picked) {
      setFileError(t("artifacts.explorer.inbox.version.noFile"));
      return;
    }
    setFileError(null);
    mutation.mutate({ upload: picked, note: note.trim() });
  }

  return (
    <InboxFormDialog
      title={t("artifacts.explorer.inbox.version.title")}
      description={t("artifacts.explorer.inbox.version.description")}
      submitLabel={t("artifacts.explorer.inbox.version.confirm")}
      pending={mutation.isPending}
      error={fileError ?? (mutation.error ? errorText(mutation.error, t("artifacts.explorer.inbox.genericError")) : null)}
      onSubmit={submit}
      onClose={onClose}
    >
      <div className="grid gap-2">
        <Label htmlFor="inbox-version-file">{t("artifacts.explorer.inbox.version.fileLabel")}</Label>
        <Input
          id="inbox-version-file"
          type="file"
          aria-invalid={fileError !== null || undefined}
          onChange={(event) => {
            setPicked(event.target.files?.[0] ?? null);
            setFileError(null);
          }}
        />
      </div>
      <NameField
        id="inbox-version-note"
        label={t("artifacts.explorer.inbox.version.noteLabel")}
        value={note}
        onChange={setNote}
      />
    </InboxFormDialog>
  );
}

function MoveToInboxDialog({
  companyId,
  artifact,
  onClose,
}: {
  companyId: string;
  artifact: ArtifactRef;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { pushToast } = useToast();
  const invalidate = useInvalidateCompanyFiles(companyId);
  const [name, setName] = useState(artifact.name);

  const mutation = useMutation({
    mutationFn: (input: { folderId: string | null; name: string }) =>
      companyFilesApi.createFromArtifact(companyId, {
        source: artifact.source,
        id: artifact.id,
        folderId: input.folderId,
        name: input.name || undefined,
      }),
    onSuccess: (created) => {
      void invalidate();
      pushToast({ title: t("artifacts.explorer.inbox.toInbox.added", { name: created.name }), tone: "success" });
      onClose();
    },
  });

  return (
    <FolderPickerDialog
      open
      companyId={companyId}
      title={t("artifacts.explorer.inbox.toInbox.title")}
      confirmLabel={t("artifacts.explorer.inbox.toInbox.confirm")}
      initialFolderId={null}
      pending={mutation.isPending}
      error={mutation.error ? errorText(mutation.error, t("artifacts.explorer.inbox.genericError")) : null}
      beforeTree={
        <div className="grid gap-2">
          <p className="text-sm text-muted-foreground">
            {t("artifacts.explorer.inbox.toInbox.description", { name: artifact.name })}
          </p>
          <NameField
            id="inbox-to-inbox-name"
            label={t("artifacts.explorer.inbox.toInbox.nameLabel")}
            value={name}
            onChange={setName}
          />
        </div>
      }
      onConfirm={(folderId) => mutation.mutate({ folderId, name: name.trim() })}
      onClose={onClose}
    />
  );
}
