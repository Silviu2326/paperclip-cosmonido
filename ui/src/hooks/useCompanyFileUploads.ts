import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { companyFilesApi, type CompanyFile } from "@/api/company-files";
import { queryKeys } from "@/lib/queryKeys";

export type CompanyFileUploadStatus = "pending" | "uploading" | "done" | "error";

export interface CompanyFileUploadEntry {
  id: string;
  filename: string;
  status: CompanyFileUploadStatus;
  /** Fraction 0..1 while uploading, when the browser reports progress. */
  progress?: number;
  error?: string;
}

/**
 * Upload queue for the company Entrada explorer. Mirrors the contract of
 * `useIssueArtifactUploads` (entries, announcement, upload, retry, dismiss) so
 * the explorer page can swap between the two.
 *
 * Uploads run one at a time in selection order. Successful uploads stay in the
 * list as `done` until dismissed or cleared, and every success invalidates the
 * company's files queries so the list and tree refresh.
 */
export function useCompanyFileUploads(
  companyId: string,
  folderId: string | null = null,
  /** Runs after each upload, before it counts as done (e.g. to set context properties). */
  afterUpload?: (file: CompanyFile) => Promise<unknown>,
) {
  const client = useQueryClient();
  const afterUploadRef = useRef(afterUpload);
  afterUploadRef.current = afterUpload;
  const [entries, setEntries] = useState<CompanyFileUploadEntry[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const files = useRef(new Map<string, File>());
  const queue = useRef<Promise<void>>(Promise.resolve());

  const patchEntry = useCallback((id: string, patch: Partial<CompanyFileUploadEntry>) => {
    setEntries(current => current.map(entry => (entry.id === id ? { ...entry, ...patch } : entry)));
  }, []);

  const enqueue = useCallback((batch: { id: string; file: File }[]) => {
    for (const { id, file } of batch) files.current.set(id, file);
    setEntries(current => [
      ...current.filter(entry => !batch.some(item => item.id === entry.id)),
      ...batch.map(({ id, file }): CompanyFileUploadEntry => ({ id, filename: file.name, status: "pending" })),
    ]);
    // Serialize uploads so the server never sees concurrent writes to the same folder.
    queue.current = queue.current.then(async () => {
      for (const { id, file } of batch) {
        patchEntry(id, { status: "uploading", progress: 0, error: undefined });
        try {
          const created = await companyFilesApi.upload(companyId, file, {
            folderId,
            onProgress: ({ loaded, total }) => {
              if (total > 0) patchEntry(id, { progress: loaded / total });
            },
          });
          // The bytes are stored from here on: a retry would upload a duplicate.
          files.current.delete(id);
          if (afterUploadRef.current) {
            try {
              await afterUploadRef.current(created);
            } catch (error) {
              void client.invalidateQueries({ queryKey: queryKeys.companyFiles.all(companyId) });
              patchEntry(id, {
                status: "error",
                error: error instanceof Error ? error.message : "Uploaded, but its properties could not be applied.",
              });
              continue;
            }
          }
          patchEntry(id, { status: "done", progress: 1 });
          void client.invalidateQueries({ queryKey: queryKeys.companyFiles.all(companyId) });
          setAnnouncement(`${file.name} added to Entrada.`);
        } catch (error) {
          patchEntry(id, {
            status: "error",
            error: error instanceof Error ? error.message : "Upload failed. Try again.",
          });
        }
      }
    });
  }, [client, companyId, folderId, patchEntry]);

  const upload = useCallback(
    (picked: File[]) => enqueue(picked.map(file => ({ id: crypto.randomUUID(), file }))),
    [enqueue],
  );

  const retry = useCallback((id: string) => {
    const file = files.current.get(id);
    if (file) enqueue([{ id, file }]);
  }, [enqueue]);

  const dismiss = useCallback((id: string) => {
    files.current.delete(id);
    setEntries(current => current.filter(entry => entry.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    setEntries(current => current.filter(entry => entry.status !== "done"));
  }, []);

  return { entries, announcement, upload, retry, dismiss, clearCompleted };
}
