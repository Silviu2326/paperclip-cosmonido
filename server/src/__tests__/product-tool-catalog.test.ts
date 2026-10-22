import { describe, expect, it } from "vitest";
import { CAPABILITY_SEMANTIC_TOOL_CATALOG } from "../vendor/paperclip-runner/index.js";
import { PRODUCT_TOOL_NAMES } from "../services/native-runtime/assigned-mcp-tools.js";
import { projectToolDefinitions } from "../services/project-tools.js";
import { assignmentToolDefinitions } from "../services/assignment-tools.js";
import { mediaToolDefinitions } from "../services/media-tools.js";
import { sprint3ToolDefinitions } from "../services/sprint3-tools.js";

describe("product tool authorization catalog", () => {
  it("advertises each implemented product operation exactly once", () => {
    for (const name of PRODUCT_TOOL_NAMES) expect(CAPABILITY_SEMANTIC_TOOL_CATALOG.filter(tool => tool.operationId === name), name).toHaveLength(1);
    const standard = [...projectToolDefinitions("standard"), ...assignmentToolDefinitions("standard"), ...mediaToolDefinitions("standard"), ...sprint3ToolDefinitions("standard")].map(tool => tool.name);
    for (const name of PRODUCT_TOOL_NAMES) expect(standard, name).toContain(name);
  });
  it.each(["ask", "planning"])("keeps mutation tools unavailable in %s", mode => {
    const available = [...projectToolDefinitions(mode), ...assignmentToolDefinitions(mode), ...mediaToolDefinitions(mode), ...sprint3ToolDefinitions(mode)].map(tool => tool.name);
    for (const name of ["get_assignment", "context_search", "context_get", "media_get_project", "media_get_job"]) expect(available).toContain(name);
    for (const name of ["submit_deliverable_for_review", "media_ingest", "media_transcribe", "media_cut", "media_subtitle", "media_export", "media_dub", "media_stop_motion", "playbook_start", "proposal_send", "handoff_to_delivery", "lead_enrich"]) expect(available).not.toContain(name);
  });
});
