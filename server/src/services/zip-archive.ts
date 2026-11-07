import { Readable } from "node:stream";
import type { Response } from "express";
import archiver from "archiver";
import { logger } from "../middleware/logger.js";
import type { StorageService } from "../storage/types.js";

// Streams a zip of company files or artifacts. Entries are read from storage one at a
// time as archiver reaches them, so a whole archive is never buffered in memory.

/** Total uncompressed size cap for one archive download. Larger requests get 413. */
export const ARCHIVE_MAX_TOTAL_BYTES = 500 * 1024 * 1024;

export type ZipEntry = {
  /** Path inside the zip, always "/"-separated and relative. */
  path: string;
  byteSize: number;
} & ({ objectKey: string } | { text: string });

export function archiveTotalBytes(entries: ZipEntry[]) {
  return entries.reduce((sum, entry) => sum + entry.byteSize, 0);
}

/** Makes "a/b" names unique by suffixing "-2", "-3", ... before the extension. */
export function uniqueZipPath(path: string, taken: Set<string>): string {
  if (!taken.has(path)) {
    taken.add(path);
    return path;
  }
  const dot = path.lastIndexOf(".");
  const slash = path.lastIndexOf("/");
  const hasExt = dot > slash + 1;
  const stem = hasExt ? path.slice(0, dot) : path;
  const ext = hasExt ? path.slice(dot) : "";
  for (let i = 2; ; i += 1) {
    const candidate = `${stem}-${i}${ext}`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
}

/** Replaces characters that cannot appear in a path segment on common systems. */
export function safeZipSegment(value: string): string {
  const cleaned = value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").trim();
  return cleaned.length > 0 && cleaned !== "." && cleaned !== ".." ? cleaned.slice(0, 200) : "archivo";
}

/**
 * Writes a zip of `entries` to the response. Headers must be set by the caller.
 * Once bytes are flowing, a storage error aborts the connection; it cannot become a 500.
 */
export function streamZipResponse(
  res: Response,
  input: { storage: StorageService; companyId: string; entries: ZipEntry[] },
): void {
  const archive = archiver("zip", { zlib: { level: 6 } });
  archive.on("warning", (error: Error) => {
    logger.warn({ err: error }, "zip archive warning");
  });
  archive.on("error", (error: Error) => {
    logger.warn({ err: error }, "zip archive failed; aborting response");
    res.destroy(error);
  });
  archive.pipe(res);
  for (const entry of input.entries) {
    if ("text" in entry) {
      archive.append(entry.text, { name: entry.path });
      continue;
    }
    // Lazy: storage is only opened when archiver reaches this entry.
    const objectKey = entry.objectKey;
    const lazy = Readable.from(
      (async function* () {
        const object = await input.storage.getObject(input.companyId, objectKey);
        for await (const chunk of object.stream) yield chunk;
      })(),
    );
    lazy.on("error", (error: Error) => archive.emit("error", error));
    archive.append(lazy, { name: entry.path });
  }
  void archive.finalize();
}
