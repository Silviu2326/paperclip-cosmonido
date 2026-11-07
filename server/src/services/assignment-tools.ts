import { z } from "zod";
import { createDeliverableReviewSchema } from "@paperclipai/shared";
import { CAPABILITY_SEMANTIC_TOOL_CATALOG } from "../vendor/paperclip-runner/index.js";
import { badRequest } from "../errors.js";

export const ASSIGNMENT_TOOL_NAMES = ["get_assignment", "submit_deliverable_for_review"];
export function assignmentToolDefinitions(workMode: string) {
  return CAPABILITY_SEMANTIC_TOOL_CATALOG.filter((tool) => ASSIGNMENT_TOOL_NAMES.includes(tool.operationId) && tool.allowedModes.includes(workMode as "standard")).map((tool) => ({ name: tool.operationId, description: tool.description, inputSchema: tool.inputSchema }));
}
export async function callAssignmentTool(input: { name: string; arguments: Record<string, unknown>; apiUrl: string; token: string; companyId: string; issueId: string }) {
  const apiBase = `${input.apiUrl.replace(/\/+$/, "").replace(/\/api$/, "")}/api`;
  let path: string; let method = "GET"; let body: unknown;
  if (input.name === "get_assignment") {
    const { goalId } = z.object({ goalId: z.string().uuid().optional() }).parse(input.arguments);
    const query = goalId ? `?goalId=${encodeURIComponent(goalId)}` : "";
    const assignment = await request(`${apiBase}/issues/${input.issueId}/assignment${query}`, input.token) as Record<string, unknown>;
    let budget: Record<string, unknown>;
    try {
      budget = await request(`${apiBase}/goals/${String(assignment.id)}/cost-summary`, input.token) as Record<string, unknown>;
    } catch (error) {
      budget = { available: false, reason: error instanceof Error ? error.message : "Cost summary unavailable" };
    }
    return { ...assignment, budget, context: { projectId: assignment.projectId, rootIssue: assignment.rootIssue } };
  } else if (input.name === "submit_deliverable_for_review") {
    const parsed = createDeliverableReviewSchema.parse({ ...input.arguments, issueId: input.issueId });
    path = `/companies/${input.companyId}/deliverable-reviews`; method = "POST"; body = parsed;
  } else throw badRequest("Unknown assignment tool");
  return request(`${apiBase}${path}`, input.token, method, body);
}
async function request(url: string, token: string, method = "GET", body?: unknown) {
  const response = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60_000) });
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : `Assignment tool failed (${response.status})`);
  return result;
}
