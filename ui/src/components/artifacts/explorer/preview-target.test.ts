import { describe, expect, it } from "vitest";
import { previewKindFor } from "./preview-target";

describe("previewKindFor", () => {
  it.each([
    ["image/png", "logo.png", "image"],
    ["video/mp4", "clip.mp4", "video"],
    ["application/pdf", "contract.pdf", "pdf"],
    ["text/markdown", "notes.md", "markdown"],
    ["text/html", "report.html", "html"],
    ["text/csv", "prices.csv", "csv"],
    ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "tarifas.xlsx", "sheet"],
    ["application/vnd.ms-excel", "old.xls", "sheet"],
    ["application/json", "config.json", "json"],
    ["text/plain", "readme.txt", "text"],
  ])("maps %s / %s to %s", (contentType, title, expected) => {
    expect(previewKindFor(contentType, title)).toBe(expected);
  });

  it("falls back to the extension when the MIME type is generic", () => {
    expect(previewKindFor("application/octet-stream", "hero.webp")).toBe("image");
    expect(previewKindFor(null, "data.csv")).toBe("csv");
    expect(previewKindFor("application/octet-stream", "tarifas.xlsx")).toBe("sheet");
  });

  it("uses the extension to refine a generic text/plain type", () => {
    expect(previewKindFor("text/plain", "notes.md")).toBe("markdown");
    expect(previewKindFor("text/plain", "plain.dat")).toBe("text");
  });

  it("is case-insensitive on extensions and ignores MIME parameters", () => {
    expect(previewKindFor("text/csv; charset=utf-8", "DATA.CSV")).toBe("csv");
    expect(previewKindFor(null, "PHOTO.JPG")).toBe("image");
  });

  it("returns unsupported for unknown types", () => {
    expect(previewKindFor("application/zip", "bundle.zip")).toBe("unsupported");
    expect(previewKindFor(null, "noextension")).toBe("unsupported");
  });
});
