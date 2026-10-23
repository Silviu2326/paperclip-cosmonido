import { describe, expect, it } from "vitest";
import type { CompanyFile } from "@/api/company-files";
import { readyCompanyVideos } from "./MediaTemplates";

function video(overrides: Partial<CompanyFile> & Pick<CompanyFile, "id">): CompanyFile {
  return {
    companyId: "company-1",
    folderId: null,
    slug: overrides.id,
    folderPath: "",
    name: `${overrides.id}.mp4`,
    createdByName: null,
    updatedByName: null,
    contentType: "video/mp4",
    byteSize: 100,
    audienceKind: "company",
    audienceId: null,
    validUntil: null,
    contextRole: null,
    currentVersionId: null,
    currentVersionNumber: 1,
    versionCount: 1,
    createdByUserId: "user-1",
    updatedByUserId: null,
    contentPath: `/api/company-files/${overrides.id}/content`,
    downloadPath: `/api/company-files/${overrides.id}/content?download=1`,
    usedInIssueCount: 0,
    agentVisible: true,
    thumbnailPath: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("readyCompanyVideos", () => {
  it("keeps non-expiring and not-yet-expired company videos, excluding expired and non-company files", () => {
    const now = new Date("2026-10-22T12:00:00.000Z").getTime();
    expect(readyCompanyVideos([
      video({ id: "no-expiry" }),
      video({ id: "future-expiry", validUntil: new Date("2026-10-23T00:00:00.000Z") }),
      video({ id: "expired", validUntil: new Date("2026-10-22T11:59:59.000Z") }),
      video({ id: "project-video", audienceKind: "project" }),
      video({ id: "image", contentType: "image/png" }),
    ], now).map(file => file.id)).toEqual(["no-expiry", "future-expiry"]);
  });
});
