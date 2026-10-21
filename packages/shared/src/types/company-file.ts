export type CompanyFileSortKey = "name" | "type" | "size" | "date" | "uploadedBy" | "usedBy";

export interface CompanyFile {
  id: string;
  companyId: string;
  folderId: string | null;
  /** Slash-joined folder names from the root, e.g. "Marca" or "Clientes/Acme". Empty string at the root. */
  folderPath: string;
  name: string;
  slug: string;
  contentType: string;
  byteSize: number;
  currentVersionId: string | null;
  currentVersionNumber: number | null;
  versionCount: number;
  createdByUserId: string | null;
  createdByName: string | null;
  updatedByUserId: string | null;
  updatedByName: string | null;
  contentPath: string;
  downloadPath: string;
  usedInIssueCount: number;
  /**
   * False when the file or any ancestor folder is hidden from agents (folder.agentVisible = false).
   * Root files are visible. Board users always see the file; this flag tells them what agents see.
   */
  agentVisible: boolean;
  /** Thumbnail URL for image files (320px WebP); null for non-image files. */
  thumbnailPath: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompanyFileVersion {
  id: string;
  fileId: string;
  versionNumber: number;
  assetId: string;
  byteSize: number;
  contentType: string;
  uploadedByUserId: string | null;
  uploadedByName: string | null;
  note: string | null;
  contentPath: string;
  downloadPath: string;
  createdAt: Date;
}

export interface CompanyFileFolderNode {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  systemKey: string | null;
  position: number;
  /** False hides this folder and its descendants from agents. Defaults to true. */
  agentVisible: boolean;
  fileCount: number;
  totalByteSize: number;
  children: CompanyFileFolderNode[];
}

export interface CompanyFilesListResponse {
  folder: CompanyFileFolderNode | null;
  folders: CompanyFileFolderNode[];
  files: CompanyFile[];
}

export interface CompanyFileUsage {
  issueId: string;
  issueIdentifier: string | null;
  issueTitle: string;
  agentId: string | null;
  agentName: string | null;
  lastReadAt: Date;
  readCount: number;
}
