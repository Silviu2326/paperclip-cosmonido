import { api, ApiError } from "./client";
import type {
  CompanyFile,
  CompanyFileFolderNode,
  CompanyFileSortKey,
  CompanyFileUsage,
  CompanyFileVersion,
  CompanyFilesListResponse,
} from "@paperclipai/shared/types/company-file";

export type {
  CompanyFile,
  CompanyFileFolderNode,
  CompanyFileSortKey,
  CompanyFileUsage,
  CompanyFileVersion,
  CompanyFilesListResponse,
} from "@paperclipai/shared/types/company-file";

/**
 * Company files ("Entrada") client.
 *
 * Talks to the company-scoped files endpoints defined in the Artefactos /
 * Buzón plan (section 5). Uploads reuse the shared `api.postForm` helper
 * (the browser sets the multipart boundary); the optional `onProgress` path
 * uses XMLHttpRequest because `fetch` does not report upload progress.
 */

/** A folder row as returned by create/update (no tree counters or children). */
export type CompanyFileFolderRecord = Omit<CompanyFileFolderNode, "fileCount" | "totalByteSize" | "children">;

export interface ListCompanyFilesParams {
  folderId?: string;
  q?: string;
  sort?: CompanyFileSortKey;
  dir?: "asc" | "desc";
  /** `all` ignores the folder and searches the whole Entrada (quick-access views). */
  scope?: "folder" | "all";
  /** Only files uploaded by the current viewer. */
  createdByMe?: boolean;
  /** Only files the current viewer has starred. */
  starred?: boolean;
}

export interface UploadCompanyFileOptions {
  folderId?: string | null;
  /** Upload byte progress (`loaded` / `total`). Switches the request to XMLHttpRequest. */
  onProgress?: (progress: { loaded: number; total: number }) => void;
}

export interface AddCompanyFileVersionOptions {
  note?: string;
}

export interface UpdateCompanyFileInput {
  name?: string;
  /** `null` moves the file back to the root. */
  folderId?: string | null;
  audienceKind?: "company" | "project" | "customer";
  audienceId?: string | null;
  validUntil?: Date | null;
  contextRole?: "offer" | "brand" | "procedure" | "customer" | "other" | null;
}

export interface CreateCompanyFileFolderInput {
  name: string;
  parentId?: string | null;
}

export interface UpdateCompanyFileFolderInput {
  name?: string;
  parentId?: string | null;
  position?: number;
  /** Shows or hides the folder (and its files) from agents. */
  agentVisible?: boolean;
}

export interface CreateCompanyFileFromArtifactInput {
  source: "attachment" | "work_product" | "document";
  id: string;
  folderId?: string | null;
  name?: string;
}

const API_BASE = "/api";

export function buildCompanyFilesQuery(params?: ListCompanyFilesParams): string {
  const search = new URLSearchParams();
  if (params?.folderId) search.set("folderId", params.folderId);
  if (params?.q) search.set("q", params.q);
  if (params?.sort) search.set("sort", params.sort);
  if (params?.dir) search.set("dir", params.dir);
  if (params?.scope) search.set("scope", params.scope);
  if (params?.createdByMe) search.set("createdByMe", "true");
  if (params?.starred) search.set("starred", "true");
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

/** Browser-openable path for a file's bytes, optionally pinned to one version. */
export function companyFileContentPath(fileId: string, version?: number | null): string {
  const search = new URLSearchParams();
  if (version != null) search.set("version", String(version));
  const qs = search.toString();
  return `${API_BASE}/company-files/${fileId}/content${qs ? `?${qs}` : ""}`;
}

/** ZIP of every file under an Entrada folder (board only). */
export function companyFolderArchivePath(folderId: string): string {
  return `${API_BASE}/company-files/folders/${folderId}/archive`;
}

/** Same as `companyFileContentPath` but asks the server for an attachment download. */
export function companyFileDownloadPath(fileId: string, version?: number | null): string {
  const search = new URLSearchParams();
  if (version != null) search.set("version", String(version));
  search.set("download", "1");
  return `${API_BASE}/company-files/${fileId}/content?${search.toString()}`;
}

/** Copy the file into memory so the request body does not depend on a transient clipboard/drag handle. */
async function detachedFile(file: File): Promise<File> {
  const buffer = await file.arrayBuffer();
  return new File([buffer], file.name, { type: file.type });
}

/**
 * Multipart POST with byte-level progress. Mirrors `api.postForm` error handling
 * by throwing `ApiError` with the server's `error` message on non-2xx responses.
 */
function postFormWithProgress<T>(
  path: string,
  form: FormData,
  onProgress: NonNullable<UploadCompanyFileOptions["onProgress"]>,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}${path}`);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress({ loaded: event.loaded, total: event.total });
    };
    xhr.onerror = () => reject(new TypeError("Network error while uploading file"));
    xhr.onabort = () => reject(new DOMException("The operation was aborted.", "AbortError"));
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as T);
        return;
      }
      const message = (body as { error?: string } | null)?.error ?? `Request failed: ${xhr.status}`;
      reject(new ApiError(message, xhr.status, body));
    };
    xhr.send(form);
  });
}

function sendUpload<T>(
  path: string,
  file: File,
  fields: Record<string, string | undefined | null>,
  onProgress?: UploadCompanyFileOptions["onProgress"],
): Promise<T> {
  return detachedFile(file).then((safeFile) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      if (value) form.append(key, value);
    }
    form.append("file", safeFile);
    if (onProgress) return postFormWithProgress<T>(path, form, onProgress);
    return api.postForm<T>(path, form);
  });
}

export const companyFilesApi = {
  list: (companyId: string, params?: ListCompanyFilesParams) =>
    api.get<CompanyFilesListResponse>(`/companies/${companyId}/files${buildCompanyFilesQuery(params)}`),

  tree: (companyId: string) =>
    api.get<CompanyFileFolderNode[]>(`/companies/${companyId}/files/tree`),

  upload: (companyId: string, file: File, options?: UploadCompanyFileOptions) =>
    sendUpload<CompanyFile>(
      `/companies/${companyId}/files`,
      file,
      { folderId: options?.folderId ?? undefined },
      options?.onProgress,
    ),

  addVersion: (fileId: string, file: File, options?: AddCompanyFileVersionOptions) =>
    sendUpload<CompanyFile>(`/company-files/${fileId}/versions`, file, { note: options?.note }),

  update: (fileId: string, input: UpdateCompanyFileInput) =>
    api.patch<CompanyFile>(`/company-files/${fileId}`, input),

  remove: (fileId: string) =>
    api.delete<void>(`/company-files/${fileId}`),

  versions: (fileId: string) =>
    api.get<CompanyFileVersion[]>(`/company-files/${fileId}/versions`),

  usage: (fileId: string) =>
    api.get<CompanyFileUsage[]>(`/company-files/${fileId}/usage`),

  createFolder: (companyId: string, input: CreateCompanyFileFolderInput) =>
    api.post<CompanyFileFolderRecord>(`/companies/${companyId}/files/folders`, input),

  updateFolder: (folderId: string, input: UpdateCompanyFileFolderInput) =>
    api.patch<CompanyFileFolderRecord>(`/company-files/folders/${folderId}`, input),

  removeFolder: (folderId: string) =>
    api.delete<{ deleted: { id: string; name: string } }>(`/company-files/folders/${folderId}`),

  createFromArtifact: (companyId: string, input: CreateCompanyFileFromArtifactInput) =>
    api.post<CompanyFile>(`/companies/${companyId}/files/from-artifact`, input),
};
