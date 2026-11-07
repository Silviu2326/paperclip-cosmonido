import { z } from "zod";
import type { ProductizationOpenApiRoute } from "./productization-openapi.js";
import { LPC_CHARACTER_VERSION } from "@paperclipai/shared";

const date = z.union([z.iso.datetime({ offset: true }), z.iso.date()]);
const costRangeQuery = z.object({
  period: z.enum(["all", "month"]).optional(),
  from: date.optional(),
  to: date.optional(),
}).strict();
const contextQuery = z.object({
  query: z.string().trim().max(200).optional(),
  roles: z.string().optional(),
  includeExpired: z.enum(["true", "false", "1", "0"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
}).strict();

/** Core routes that were missing from the operation registry; route auth mirrors each handler. */
export const sprintsOpenApiRoutes: ProductizationOpenApiRoute[] = [
  {
    method: "get",
    path: "/api/companies/{companyId}/context",
    summary: "Search company context files",
    description: "Authenticated company access. Board users search company context; agent runs are restricted to their project/customer scope and visible folders. Query is bounded to 50 results.",
    query: contextQuery,
    auth: "authenticated",
  },
  {
    method: "get",
    path: "/api/companies/{companyId}/context/{fileId}",
    summary: "Read a scoped context file",
    description: "Authenticated company access. Agent runs can read only files visible to the run and scoped to its project/customer context.",
    query: z.object({ includeExpired: z.enum(["true", "false", "1", "0"]).optional() }).strict(),
    auth: "authenticated",
  },
  {
    method: "get",
    path: "/api/assignments/{id}/context-usage",
    summary: "Read context usage for an assignment",
    description: "Board company member only; returns reads from the assignment task tree and its company's files.",
    auth: "board",
  },
  {
    method: "get",
    path: "/api/companies/{companyId}/costs/by-goal",
    summary: "Read costs grouped by goal",
    description: "Company scope and cost-read policy apply to board or authorized agent actors. Optional date range is validated by the server.",
    query: costRangeQuery,
    auth: "authenticated",
  },
  {
    method: "get",
    path: "/api/goals/{id}/cost-summary",
    summary: "Read cost summary for a goal",
    description: "Authenticated actor must be able to read the goal and company cost data; inaccessible goals return the scoped not-found response.",
    auth: "authenticated",
  },
  {
    method: "get",
    path: `/api/agent-avatars/${LPC_CHARACTER_VERSION}/credits`,
    summary: "Read Liberated Pixel Cup attribution credits",
    description: "Anonymous static attribution CSV for the vendored Liberated Pixel Cup artwork.",
    auth: "public",
  },
];
