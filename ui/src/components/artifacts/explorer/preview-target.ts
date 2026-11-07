export interface PreviewTarget {
  id: string;
  box: "in" | "out";
  title: string;
  contentType: string | null;
  /** URL the viewer fetches or embeds the file from. */
  contentPath: string | null;
  /** URL used by the download action. */
  downloadPath: string | null;
  /** Optional URL that opens the file in a new tab (defaults to contentPath). */
  openPath?: string | null;
  byteSize: number | null;
  updatedAt: string;
  /** Inline text content. When set, text-based viewers skip the fetch. */
  previewText?: string | null;
  meta: Array<{ label: string; value: string }>;
  versions?: Array<{ id: string; label: string; date: string; current: boolean; onSelect?: () => void; /** Entrada: uploader of this version. */ by?: string | null }>;
}

export type PreviewKind =
  | "image"
  | "video"
  | "pdf"
  | "markdown"
  | "html"
  | "csv"
  | "sheet"
  | "json"
  | "text"
  | "pr"
  | "unsupported";

const SHEET_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

const EXTENSION_KINDS: Record<string, PreviewKind> = {
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  avif: "image",
  bmp: "image",
  svg: "image",
  mp4: "video",
  webm: "video",
  mov: "video",
  ogv: "video",
  pdf: "pdf",
  md: "markdown",
  markdown: "markdown",
  html: "html",
  htm: "html",
  csv: "csv",
  xlsx: "sheet",
  xls: "sheet",
  json: "json",
  txt: "text",
  log: "text",
  yaml: "text",
  yml: "text",
};

function kindFromMime(mime: string): PreviewKind | null {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime === "application/pdf") return "pdf";
  if (mime === "text/markdown") return "markdown";
  if (mime === "text/html") return "html";
  if (mime === "text/csv") return "csv";
  if (SHEET_MIME_TYPES.has(mime)) return "sheet";
  if (mime === "application/json") return "json";
  return null;
}

/**
 * Chooses the viewer for a file. MIME type wins, then the file extension,
 * then a generic text/* match. Anything else has no inline viewer.
 */
export function previewKindFor(contentType: string | null, title: string): PreviewKind {
  const mime = (contentType ?? "").split(";")[0]!.trim().toLowerCase();
  const fromMime = kindFromMime(mime);
  if (fromMime) return fromMime;

  const dot = title.lastIndexOf(".");
  const extension = dot >= 0 ? title.slice(dot + 1).toLowerCase() : "";
  const fromExtension = EXTENSION_KINDS[extension];
  if (fromExtension) return fromExtension;

  if (mime.startsWith("text/")) return "text";
  return "unsupported";
}
