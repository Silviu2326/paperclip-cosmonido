import type { CompanyArtifact, CompanyArtifactGroup, CompanyArtifactTreeNode } from "@/api/artifacts";
import { companyArtifactsArchivePath } from "@/api/artifacts";
import {
  companyFileContentPath,
  companyFileDownloadPath,
  companyFolderArchivePath,
  type CompanyFileFolderNode,
  type CompanyFile,
  type CompanyFileVersion,
} from "@/api/company-files";
import type { ExplorerStarTarget } from "@/api/resourceMemberships";
import type { ResourceMemberships } from "@paperclipai/shared";
import { t } from "@/i18n";
import type { PreviewTarget } from "./preview-target";

export type ExplorerBox = "in" | "out";
export type ExplorerView = "list" | "icons";
export type ExplorerSortKey = "name" | "type" | "size" | "date" | "by" | "folder" | "task" | "used";
export type ExplorerSortDir = "asc" | "desc";

export const EXPLORER_SORT_KEYS: readonly ExplorerSortKey[] = ["name", "type", "size", "date", "by", "folder", "task", "used"];

export type ExplorerRaw =
  | CompanyFile
  | CompanyFileFolderNode
  | CompanyArtifact
  | CompanyArtifactTreeNode
  | CompanyArtifactGroup;

/** One row of the explorer, the same shape for Entrada and Salida. */
export interface ExplorerItem {
  /** Stable id used by the `sel` URL parameter. */
  id: string;
  box: ExplorerBox;
  kind: "folder" | "file";
  name: string;
  typeLabel: string;
  contentType: string | null;
  byteSize: number | null;
  /** Folders: number of direct children ("N elementos"). */
  childCount: number | null;
  /** ISO date shown in the Fecha column. */
  date: string | null;
  /** Entrada: uploader. Salida: agent name. */
  by: string | null;
  /** Entrada: folder path shown in quick views ("Carpeta" column). */
  folderPath: string | null;
  /** Salida: task identifier (COS-412). */
  task: string | null;
  /** Entrada: number of tasks that used the file. */
  usedBy: number | null;
  version: number;
  /** Entrada: folder id. Salida: tree node id. */
  nodeId: string | null;
  /** Salida: group key when the folder is a `groupBy` group. */
  groupKey: string | null;
  contentPath: string | null;
  downloadPath: string | null;
  openPath: string | null;
  /** Files only: the viewer has starred it (see `explorerItemStarred`). */
  starred: boolean;
  raw: ExplorerRaw;
}

const collator = new Intl.Collator("es", { numeric: true, sensitivity: "base" });
const shortDate = new Intl.DateTimeFormat("es", { day: "numeric", month: "short" });
const VERSION_PATTERN = /-v(\d+)(\.[^.]+)?$/i;

export function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.toISOString();
}

/** "12 oct" style date used in the list and the version list. */
export function formatExplorerDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : shortDate.format(date);
}

/** File type label derived from MIME type first, then extension. */
export function fileTypeLabel(contentType: string | null, name: string): string {
  const mime = (contentType ?? "").split(";")[0]!.trim().toLowerCase();
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"].includes(ext)) {
    return t("artifacts.explorer.type.image");
  }
  if (mime.startsWith("video/") || ["mp4", "webm", "mov"].includes(ext)) return t("artifacts.explorer.type.video");
  if (mime === "application/pdf" || ext === "pdf") return t("artifacts.explorer.type.pdf");
  if (["xlsx", "xls"].includes(ext) || mime.includes("spreadsheetml") || mime === "application/vnd.ms-excel") {
    return t("artifacts.explorer.type.sheet");
  }
  if (mime === "text/csv" || ext === "csv") return t("artifacts.explorer.type.csv");
  if (mime === "text/markdown" || ["md", "markdown"].includes(ext)) return t("artifacts.explorer.type.markdown");
  if (mime === "text/html" || ["html", "htm"].includes(ext)) return t("artifacts.explorer.type.html");
  if (["docx", "doc"].includes(ext) || mime.includes("wordprocessingml")) return t("artifacts.explorer.type.word");
  if (mime === "application/json" || ext === "json") return t("artifacts.explorer.type.json");
  if (mime.startsWith("text/") || ["txt", "log", "yaml", "yml"].includes(ext)) return t("artifacts.explorer.type.text");
  return ext ? ext.toUpperCase() : t("artifacts.explorer.type.file");
}

/** Version number encoded in the name (`propuesta-v3.pdf` -> 3). Salida has no real versions. */
export function versionFromName(name: string): number {
  const match = name.match(VERSION_PATTERN);
  return match ? Number(match[1]) : 1;
}

function stemOf(name: string): string {
  return name.replace(/-v\d+(\.[^.]+)?$/i, "$1");
}

export function entryFolderItem(folder: CompanyFileFolderNode): ExplorerItem {
  return {
    id: `folder:${folder.id}`,
    box: "in",
    kind: "folder",
    name: folder.name,
    typeLabel: t("artifacts.explorer.type.folder"),
    contentType: null,
    byteSize: folder.totalByteSize,
    childCount: folder.fileCount,
    date: null,
    by: null,
    folderPath: null,
    task: null,
    usedBy: null,
    version: 1,
    nodeId: folder.id,
    groupKey: null,
    contentPath: null,
    downloadPath: null,
    openPath: null,
    starred: false,
    raw: folder,
  };
}

export function entryFileItem(file: CompanyFile): ExplorerItem {
  return {
    id: `file:${file.id}`,
    box: "in",
    kind: "file",
    name: file.name,
    typeLabel: fileTypeLabel(file.contentType, file.name),
    contentType: file.contentType,
    byteSize: file.byteSize,
    childCount: null,
    date: toIsoString(file.updatedAt),
    by: file.createdByName ?? null,
    folderPath: file.folderPath || null,
    task: null,
    usedBy: file.usedInIssueCount,
    version: file.currentVersionNumber ?? 1,
    nodeId: file.folderId,
    groupKey: null,
    contentPath: file.contentPath,
    downloadPath: file.downloadPath,
    openPath: file.contentPath,
    starred: false,
    raw: file,
  };
}

export function outNodeItem(node: CompanyArtifactTreeNode): ExplorerItem {
  return {
    id: `node:${node.id}`,
    box: "out",
    kind: "folder",
    name: node.label,
    typeLabel: node.kind === "issue" ? t("artifacts.explorer.type.task") : t("artifacts.explorer.type.folder"),
    contentType: null,
    byteSize: node.totalByteSize,
    childCount: node.count,
    date: node.updatedAt,
    by: null,
    folderPath: null,
    task: node.issueIdentifier,
    usedBy: null,
    version: 1,
    nodeId: node.id,
    groupKey: null,
    contentPath: null,
    downloadPath: null,
    openPath: null,
    starred: false,
    raw: node,
  };
}

export function outGroupItem(group: CompanyArtifactGroup): ExplorerItem {
  return {
    id: `group:${group.key}`,
    box: "out",
    kind: "folder",
    name: group.label,
    typeLabel: t("artifacts.explorer.type.folder"),
    contentType: null,
    byteSize: null,
    childCount: group.count,
    date: group.updatedAt,
    by: null,
    folderPath: null,
    task: null,
    usedBy: null,
    version: 1,
    nodeId: null,
    groupKey: group.key,
    contentPath: null,
    downloadPath: null,
    openPath: null,
    starred: false,
    raw: group,
  };
}

export function outFileItem(artifact: CompanyArtifact): ExplorerItem {
  return {
    id: `out:${artifact.id}`,
    box: "out",
    kind: "file",
    name: artifact.title,
    typeLabel: fileTypeLabel(artifact.contentType, artifact.title),
    contentType: artifact.contentType,
    byteSize: artifact.byteSize,
    childCount: null,
    date: artifact.createdAt,
    by: artifact.createdByAgent?.name ?? null,
    folderPath: null,
    task: artifact.issue.identifier || null,
    usedBy: null,
    version: versionFromName(artifact.title),
    nodeId: null,
    groupKey: null,
    contentPath: artifact.contentPath,
    downloadPath: artifact.downloadPath,
    openPath: artifact.openPath ?? artifact.contentPath,
    starred: false,
    raw: artifact,
  };
}

/** Folders first always; the sort direction applies to the key only. */
export function compareExplorerItems(
  a: ExplorerItem,
  b: ExplorerItem,
  key: ExplorerSortKey,
  dir: ExplorerSortDir,
): number {
  if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
  let result = 0;
  switch (key) {
    case "name":
      result = collator.compare(a.name, b.name);
      break;
    case "type":
      result = collator.compare(a.typeLabel, b.typeLabel);
      break;
    case "size":
      result = (a.byteSize ?? -1) - (b.byteSize ?? -1);
      break;
    case "date":
      result = (a.date ?? "").localeCompare(b.date ?? "");
      break;
    case "by":
      result = collator.compare(a.by ?? "", b.by ?? "");
      break;
    case "folder":
      result = collator.compare(a.folderPath ?? "", b.folderPath ?? "");
      break;
    case "task":
      result = collator.compare(a.task ?? "", b.task ?? "");
      break;
    case "used":
      result = (a.usedBy ?? -1) - (b.usedBy ?? -1);
      break;
  }
  if (result === 0 && key !== "name") result = collator.compare(a.name, b.name);
  return dir === "asc" ? result : -result;
}

export function sortExplorerItems(items: ExplorerItem[], key: ExplorerSortKey, dir: ExplorerSortDir): ExplorerItem[] {
  return [...items].sort((a, b) => compareExplorerItems(a, b, key, dir));
}

export interface ExplorerColumn {
  key: ExplorerSortKey;
  label: string;
}

/**
 * Columns differ per box: Entrada shows uploader and usage, Salida shows agent and task.
 * Entrada quick views replace usage with the file's folder.
 */
export function explorerColumns(box: ExplorerBox, options: { folderColumn?: boolean } = {}): ExplorerColumn[] {
  if (box === "in") {
    return [
      { key: "name", label: t("artifacts.explorer.list.name") },
      { key: "type", label: t("artifacts.explorer.list.type") },
      { key: "size", label: t("artifacts.explorer.list.size") },
      { key: "date", label: t("artifacts.explorer.list.date") },
      { key: "by", label: t("artifacts.explorer.list.uploadedBy") },
      options.folderColumn
        ? { key: "folder", label: t("artifacts.explorer.meta.folder") }
        : { key: "used", label: t("artifacts.explorer.list.usedBy") },
    ];
  }
  return [
    { key: "name", label: t("artifacts.explorer.list.name") },
    { key: "type", label: t("artifacts.explorer.list.type") },
    { key: "size", label: t("artifacts.explorer.list.size") },
    { key: "date", label: t("artifacts.explorer.list.date") },
    { key: "by", label: t("artifacts.explorer.list.agent") },
    { key: "task", label: t("artifacts.explorer.list.task") },
  ];
}

/** Other versions of the same Salida file (same task, name differs only in `-vN`). */
export function siblingVersions(
  item: ExplorerItem,
  visible: ExplorerItem[],
  onSelectItem: (id: string) => void,
): PreviewTarget["versions"] {
  if (item.box !== "out" || item.kind !== "file") return undefined;
  const stem = stemOf(item.name);
  const family = visible.filter(
    (candidate) =>
      candidate.box === "out" &&
      candidate.kind === "file" &&
      candidate.task === item.task &&
      stemOf(candidate.name) === stem &&
      VERSION_PATTERN.test(candidate.name),
  );
  if (family.length < 2) return undefined;
  return [...family]
    .sort((a, b) => b.version - a.version)
    .map((version) => ({
      id: version.id,
      label: `v${version.version} · ${version.name}`,
      date: formatExplorerDate(version.date),
      current: version.id === item.id,
      onSelect: version.id === item.id ? undefined : () => onSelectItem(version.id),
    }));
}

/** Entrada version history from the versions endpoint. */
export function entryVersionEntries(
  versions: CompanyFileVersion[],
  current: number,
  onSelectVersion: (versionNumber: number) => void,
): PreviewTarget["versions"] {
  return [...versions]
    .sort((a, b) => b.versionNumber - a.versionNumber)
    .map((version) => ({
      id: version.id,
      label: `v${version.versionNumber}`,
      date: formatExplorerDate(toIsoString(version.createdAt)),
      by: version.uploadedByName ?? null,
      current: version.versionNumber === current,
      onSelect: () => onSelectVersion(version.versionNumber),
    }));
}

/** Star sets from the memberships snapshot, keyed the way each box stores them. */
export interface ExplorerStarSets {
  files: Set<string>;
  documents: Set<string>;
  /** `<source>:<id>` for attachments and work products. */
  refs: Set<string>;
}

export function explorerStarSets(memberships: ResourceMemberships | undefined): ExplorerStarSets {
  return {
    files: new Set(memberships?.starredCompanyFileIds ?? []),
    documents: new Set(memberships?.starredDocumentIds ?? []),
    refs: new Set(memberships?.starredArtifactRefs ?? []),
  };
}

/** Salida artifact ids are `<source>:<id>`; documents star by bare id. */
function splitArtifactId(artifactId: string): { source: string; id: string } {
  const separator = artifactId.indexOf(":");
  return separator < 0 ? { source: "", id: artifactId } : { source: artifactId.slice(0, separator), id: artifactId.slice(separator + 1) };
}

export function explorerItemStarred(item: ExplorerItem, sets: ExplorerStarSets): boolean {
  if (item.kind !== "file") return false;
  if (item.box === "in") return sets.files.has((item.raw as CompanyFile).id);
  const { source, id } = splitArtifactId((item.raw as { id: string }).id);
  return source === "document" ? sets.documents.has(id) : sets.refs.has((item.raw as { id: string }).id);
}

/** What toggling the star of this file writes to the memberships API. Folders cannot be starred. */
export function explorerStarTarget(item: ExplorerItem): ExplorerStarTarget | null {
  if (item.kind !== "file") return null;
  if (item.box === "in") return { kind: "company-file", fileId: (item.raw as CompanyFile).id };
  const { source, id } = splitArtifactId((item.raw as { id: string }).id);
  if (source === "document") return { kind: "document", documentId: id };
  if (source === "attachment" || source === "work_product") return { kind: "artifact", source, artifactId: id };
  return null;
}

/** Thumbnail the server generated for an Entrada file or a Salida artifact (null when none). */
export function itemThumbnailPath(item: ExplorerItem): string | null {
  return (item.raw as { thumbnailPath?: string | null }).thumbnailPath ?? null;
}

/** Entrada folder or file that agents cannot see. Salida is never hidden. */
export function isHiddenFromAgents(item: ExplorerItem): boolean {
  return item.box === "in" && (item.raw as { agentVisible?: boolean }).agentVisible === false;
}

/**
 * ZIP download for a folder: any Entrada folder, or a Salida project/issue node.
 * Null when the folder cannot be archived (Salida root, groups, quick views).
 */
export function folderArchivePath(item: ExplorerItem, companyId: string): string | null {
  if (item.kind !== "folder" || !item.nodeId) return null;
  if (item.box === "in") return companyFolderArchivePath(item.nodeId);
  if (item.nodeId.startsWith("issue:") || item.nodeId.startsWith("project:")) {
    return companyArtifactsArchivePath(companyId, item.nodeId);
  }
  return null;
}

/** Preview meta row for an Entrada file's effective visibility to agents (only when the server sends it). */
function agentVisibilityMeta(item: ExplorerItem): Array<{ label: string; value: string }> {
  const visible = (item.raw as { agentVisible?: boolean }).agentVisible;
  if (typeof visible !== "boolean") return [];
  return [
    {
      label: t("artifacts.explorer.visibility.metaLabel"),
      value: visible ? t("artifacts.explorer.visibility.visible") : t("artifacts.explorer.visibility.hidden"),
    },
  ];
}

/** Builds the preview pane target for a file. Folders have no preview. */
export function toPreviewTarget(
  item: ExplorerItem,
  options: {
    folderPath: string;
    versions?: PreviewTarget["versions"];
    /** Entrada only: show this historical version instead of the current one. */
    versionNumber?: number | null;
    /** Entrada quick view: the folder comes from the file, not from the crumbs. */
    quickView?: boolean;
  },
): PreviewTarget | null {
  if (item.kind !== "file") return null;
  const isIn = item.box === "in";
  const fileId = isIn ? (item.raw as CompanyFile).id : null;
  const pinned = isIn && options.versionNumber != null ? options.versionNumber : null;
  const contentPath = fileId && pinned != null ? companyFileContentPath(fileId, pinned) : item.contentPath;
  const downloadPath = fileId && pinned != null ? companyFileDownloadPath(fileId, pinned) : item.downloadPath;
  const folderPath = options.folderPath || t("artifacts.explorer.box.in");
  const meta = isIn
    ? [
        { label: t("artifacts.explorer.meta.uploadedBy"), value: item.by ?? "—" },
        {
          label: t("artifacts.explorer.meta.folder"),
          value: options.quickView ? item.folderPath || t("artifacts.explorer.box.in") : folderPath,
        },
        { label: t("artifacts.explorer.meta.visibleTo"), value: t("artifacts.explorer.meta.allCompany") },
        ...agentVisibilityMeta(item),
      ]
    : [
        { label: t("artifacts.explorer.meta.agent"), value: item.by ?? "—" },
        { label: t("artifacts.explorer.meta.task"), value: item.task ?? "—" },
        { label: t("artifacts.explorer.meta.folder"), value: folderPath },
        { label: t("artifacts.explorer.meta.origin"), value: t("artifacts.explorer.meta.originRun") },
      ];
  return {
    id: pinned != null ? `${item.id}:v${pinned}` : item.id,
    box: item.box,
    title: item.name,
    contentType: item.contentType,
    contentPath,
    downloadPath,
    openPath: item.openPath,
    byteSize: item.byteSize,
    updatedAt: item.date ?? new Date(0).toISOString(),
    previewText: item.box === "out" ? (item.raw as CompanyArtifact).previewText : null,
    meta,
    versions: options.versions,
  };
}
