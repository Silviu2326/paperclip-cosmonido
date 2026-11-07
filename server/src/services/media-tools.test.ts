import { describe, expect, it } from "vitest";
import { mediaToolDefinitions, MEDIA_TOOL_NAMES } from "./media-tools.js";

describe("media tool access", () => {
  it("keeps Ask and Plan mode read-only according to the canonical catalog", () => {
    const readOnly = new Set(["media_get_project", "media_get_job"]);
    for (const mode of ["ask", "plan"]) {
      const names = mediaToolDefinitions(mode).map(tool => tool.name);
      expect(names.every(name => readOnly.has(name))).toBe(true);
    }
  });

  it("exposes only canonical media tool operations in standard mode", () => {
    const names = mediaToolDefinitions("standard").map(tool => tool.name);
    expect(names.length).toBeGreaterThan(0);
    expect(names.every(name => MEDIA_TOOL_NAMES.includes(name))).toBe(true);
  });
});
