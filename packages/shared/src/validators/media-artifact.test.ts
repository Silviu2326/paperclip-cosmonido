import { describe, expect, it } from "vitest";
import { mediaArtifactWorkProductMetadataSchema } from "./work-product.js";
const assetId = "00000000-0000-4000-8000-000000000001";
const base = { assetId, contentType: "video/mp4", byteSize: 100, contentPath: `/api/assets/${assetId}/content`, openPath: `/api/assets/${assetId}/content`, downloadPath: `/api/assets/${assetId}/content?download=1` };
describe("media artifact URLs", () => {
  it("allows only same-origin routes for the declared asset", () => {
    expect(mediaArtifactWorkProductMetadataSchema.safeParse(base).success).toBe(true);
    expect(mediaArtifactWorkProductMetadataSchema.safeParse({ ...base, contentPath: "https://example.com/video.mp4" }).success).toBe(false);
    expect(mediaArtifactWorkProductMetadataSchema.safeParse({ ...base, downloadPath: "/api/assets/00000000-0000-4000-8000-000000000002/content?download=1" }).success).toBe(false);
  });
});
