import { randomUUID } from "node:crypto";
import type { AudioStorage } from "../core/types.js";

export interface ArtifactStorageAdapter {
  upload(bytes: Uint8Array, options: { fileName: string; mimeType: string; metadata?: Record<string, unknown> }): Promise<{ artifactId: string; uri: string }>;
}

/** Adapt a caller-scoped artifact uploader without importing server packages. */
export function artifactAudioStorage(adapter: ArtifactStorageAdapter): AudioStorage {
  return {
    async save(audio, options) {
      const requested = options.fileName ?? `voice-${randomUUID()}.${audio.format.container}`;
      if (!requested.trim() || /[\\/\u0000-\u001f:]/.test(requested) || requested === "." || requested === "..") throw new TypeError("Artifact fileName must be a plain filename.");
      const artifact = await adapter.upload(audio.data, { fileName: requested, mimeType: audio.mimeType, metadata: options.metadata });
      return { uri: artifact.uri };
    },
  };
}
