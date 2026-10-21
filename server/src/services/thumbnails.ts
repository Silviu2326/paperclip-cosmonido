import { Readable } from "node:stream";
import { buffer } from "node:stream/consumers";
import sharp from "sharp";
import { logger } from "../middleware/logger.js";
import type { StorageService } from "../storage/types.js";

// Image thumbnails for company files and attachments. A thumbnail is generated once
// per asset, stored under `thumbnails/{companyId}` keyed by asset id, and served from
// storage afterwards. Asset bytes are immutable per asset, so the cache never goes stale.

export const THUMBNAIL_WIDTH = 320;
export const THUMBNAIL_CONTENT_TYPE = "image/webp";
const THUMBNAIL_MAX_INPUT_PIXELS = 50_000_000;

const THUMBNAILABLE_CONTENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

export function isThumbnailableContentType(contentType: string | null | undefined): boolean {
  return THUMBNAILABLE_CONTENT_TYPES.has((contentType ?? "").toLowerCase());
}

/** Deterministic key for the cached thumbnail. Must start with the company prefix (storage enforces it). */
export function thumbnailObjectKey(companyId: string, assetId: string): string {
  return `${companyId}/thumbnails/${companyId}/${assetId}.webp`;
}

export type ThumbnailResult = {
  stream: Readable;
  contentLength: number;
  contentType: typeof THUMBNAIL_CONTENT_TYPE;
};

/**
 * Returns the cached 320px WebP thumbnail for an asset, generating and caching it on the
 * first request. Returns null for non-image content or bytes sharp cannot decode.
 */
export async function getAssetThumbnail(
  storage: StorageService,
  input: { companyId: string; assetId: string; objectKey: string; contentType: string },
): Promise<ThumbnailResult | null> {
  if (!isThumbnailableContentType(input.contentType)) return null;
  const cacheKey = thumbnailObjectKey(input.companyId, input.assetId);
  const cached = await storage.headObject(input.companyId, cacheKey).catch(() => ({ exists: false as const }));
  if (!cached.exists) {
    const generated = await generateThumbnail(storage, input);
    if (!generated) return null;
    await storage
      .putFile({
        companyId: input.companyId,
        objectKey: cacheKey,
        namespace: `thumbnails/${input.companyId}`,
        originalFilename: `${input.assetId}.webp`,
        contentType: THUMBNAIL_CONTENT_TYPE,
        body: generated,
      })
      .catch((error: unknown) => {
        // The bytes are still valid; a failed cache write only costs a regeneration next time.
        logger.debug({ err: error, assetId: input.assetId }, "thumbnail cache write failed");
      });
    return {
      stream: Readable.from([generated]),
      contentLength: generated.length,
      contentType: THUMBNAIL_CONTENT_TYPE,
    };
  }
  const object = await storage.getObject(input.companyId, cacheKey);
  const contentLength = object.contentLength ?? 0;
  return { stream: object.stream, contentLength, contentType: THUMBNAIL_CONTENT_TYPE };
}

async function generateThumbnail(
  storage: StorageService,
  input: { companyId: string; assetId: string; objectKey: string },
): Promise<Buffer | null> {
  try {
    const source = await storage.getObject(input.companyId, input.objectKey);
    const bytes = await buffer(source.stream);
    return await sharp(bytes, { limitInputPixels: THUMBNAIL_MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: THUMBNAIL_WIDTH })
      .webp({ quality: 80 })
      .toBuffer();
  } catch (error) {
    logger.debug({ err: error, assetId: input.assetId }, "thumbnail generation skipped: image could not be decoded");
    return null;
  }
}
