import { assignmentToolDefinitions, callAssignmentTool, ASSIGNMENT_TOOL_NAMES } from "../services/assignment-tools.js";
import { mediaToolDefinitions, callMediaTool, MEDIA_TOOL_NAMES } from "../services/media-tools.js";
import { sprint3ToolDefinitions, dispatchSprint3Tool } from "../services/sprint3-tools.js";
import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { projectToolContext } from "../services/project-tool-context.js";
import { callProjectTool, projectToolDefinitions } from "../services/project-tools.js";
import { assertCompanyAccess } from "./authz.js";
import { forbidden } from "../errors.js";
import { agentMediaActionForTool, assertAgentMediaAction, hasAgentMediaAction, type AgentMediaAction } from "../services/external-action-gate.js";

/** Mounted after actor middleware; connection-scoped tokens cannot authenticate here. */
export function projectToolRoutes(db: Db) {
  const router = Router();
  router.post("/mcp/project-tools", async (req, res) => {
    const context = await projectToolContext(db, req.actor);
    assertCompanyAccess(req, context.run.companyId);
    const { id = null, method, params } = req.body;
    const send = (result: unknown) => res.json({ jsonrpc: "2.0", id, result });
    if (method === "initialize") return send({ protocolVersion: "2025-03-26", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "paperclip-project-tools", version: "1" } });
    if (method === "notifications/initialized") return res.status(202).end();
    const mediaActions: Record<AgentMediaAction, boolean> = context.run.agentId
      ? Object.fromEntries(await Promise.all(([
          "analyze", "edit", "createVideo",
        ] as const).map(async (action) => [action, await hasAgentMediaAction(db, {
          companyId: context.run.companyId,
          agentId: context.run.agentId!,
          action,
        })]))) as Record<AgentMediaAction, boolean>
      : { analyze: true, edit: true, createVideo: true };
    const mediaDefinitions = mediaToolDefinitions(context.issue.workMode).filter((tool) => {
      const action = agentMediaActionForTool(tool.name);
      return action === null || (action !== undefined && mediaActions[action]);
    });
    const definitions = [...projectToolDefinitions(context.issue.workMode, true), ...assignmentToolDefinitions(context.issue.workMode), ...mediaDefinitions, ...sprint3ToolDefinitions(context.issue.workMode)];
    if (method === "tools/list") return send({ tools: definitions });
    if (method !== "tools/call") return res.json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
    try {
      if (MEDIA_TOOL_NAMES.includes(params?.name)) {
        const action = agentMediaActionForTool(params.name);
        if (action === undefined) throw forbidden("Media tool has no action capability mapping");
        if (context.run.agentId && action !== null) {
          await assertAgentMediaAction(db, { companyId: context.run.companyId, agentId: context.run.agentId, action });
        }
      }
      if (!definitions.some(tool => tool.name === params?.name)) throw forbidden("Tool is unavailable in this mode");
      const apiUrl = process.env.PAPERCLIP_API_URL;
      if (!apiUrl) throw new Error("Paperclip API origin is unavailable");
      const dispatch = ASSIGNMENT_TOOL_NAMES.includes(params.name) ? callAssignmentTool : MEDIA_TOOL_NAMES.includes(params.name) ? callMediaTool : dispatchSprint3Tool(params.name) ?? callProjectTool;
      const result = await dispatch({
        name: params.name, arguments: params.arguments ?? {}, apiUrl,
        token: req.header("authorization")!.replace(/^Bearer\s+/i, ""),
        companyId: context.run.companyId, issueId: context.issue.id, agentId: context.run.agentId,
        conversation: Boolean(context.issue.conversationAgentId),
      });
      return send({ content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result });
    } catch (error) {
      return send({ isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : "Project tool failed" }] });
    }
  });
  return router;
}
