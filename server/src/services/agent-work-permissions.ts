import { and, eq } from "drizzle-orm";
import { agents, type Db } from "@paperclipai/db";
import { AGENT_WORK_PERMISSION_KEYS, agentWorkPermissionsSchema, type AgentWorkPermission } from "@paperclipai/shared";
import { forbidden, notFound } from "../errors.js";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** An additional restriction: never substitutes for company, resource, grant or approval checks. */
export function assertAgentWorkPermissions(metadata: unknown, required: readonly AgentWorkPermission[]) {
  const profile = record(record(metadata).profile);
  if (profile.codeAdapterAccess === "read_only" && required.includes("workspaceWrite")) throw forbidden("This agent has read-only workspace access.", { code: "agent_code_read_only" });
  if (!Object.hasOwn(profile, "workPermissions")) return; // Preserve existing agents until an explicit save.
  const parsed = agentWorkPermissionsSchema.safeParse(profile.workPermissions);
  for (const permission of required) {
    if (!parsed.success || !parsed.data[permission]) throw forbidden("This agent is not allowed to perform this operation.", { code: "agent_work_permission_denied", permission });
  }
}

/** Generic agent metadata updates must not remove the operator-owned policy. */
export function assertAgentProfilePolicyUnchanged(before: unknown, after: unknown) {
  const left = record(record(before).profile), right = record(record(after).profile);
  for (const key of ["workPermissions", "codeAdapterAccess"]) {
    if (key === "workPermissions") {
      const a = agentWorkPermissionsSchema.safeParse(left[key]), b = agentWorkPermissionsSchema.safeParse(right[key]);
      if (a.success && b.success && AGENT_WORK_PERMISSION_KEYS.every(permission => a.data[permission] === b.data[permission])) continue;
    }
    if (JSON.stringify(left[key]) !== JSON.stringify(right[key])) throw forbidden("Only a board user may change agent work permissions.", { code: "agent_work_policy_protected" });
  }
}

export async function assertAgentWorkAccess(db: Db, companyId: string, agentId: string, required: readonly AgentWorkPermission[]) {
  if (!required.length) return;
  const [agent] = await db.select({ metadata: agents.metadata }).from(agents).where(and(eq(agents.id, agentId), eq(agents.companyId, companyId))).limit(1);
  if (!agent) throw notFound("Agent not found");
  assertAgentWorkPermissions(agent.metadata, required);
}

export function workPermissionsForTool(name: string, args?: unknown, agentId?: string): AgentWorkPermission[] {
  let input = record(args);
  if (typeof args === "string") try { input = record(JSON.parse(args)); } catch { /* The tool validator rejects invalid JSON. */ }
  if (["create_task", "update_task", "create_assignment"].includes(name)) {
    const agentAssignee = input.assigneeActorId ?? input.assigneeAgentId ?? input.assigneeId ?? input.assignee ?? input.assignee_agent_id;
    const userAssignee = input.assigneeUserId ?? input.assignee_user_id;
    const explicitAssignment = ["assigneeActorId", "assigneeAgentId", "assigneeUserId", "assigneeId", "assignee", "assignee_agent_id", "assignee_user_id"].some(key => Object.hasOwn(input, key));
    if (explicitAssignment && (name === "update_task" || userAssignee || (agentAssignee != null && agentAssignee !== agentId))) return [name === "update_task" ? "tasksUpdate" : "tasksCreate", "tasksAssign"];
  }
  if (name === "register_deliverable") return ["documentsWrite", "workspaceRead"];
  if (name === "submit_deliverable_for_review") return ["documentsWrite", "tasksUpdate"];
  if (["context_search", "context_get"].includes(name)) return ["documentsRead"];
  if (["workspace_list", "workspace_read", "get_workspace", "list_workspaces", "list_project_repositories"].includes(name)) return ["workspaceRead"];
  if (["workspace_write", "prepare_repository", "select_workspace"].includes(name)) return ["workspaceWrite"];
  // Arbitrary commands can themselves read and write. Requiring all three prevents bypasses.
  if (name === "workspace_run") return ["workspaceRead", "workspaceWrite", "workspaceExecute"];
  if (["list_documents", "read_document", "list_document_revisions", "list_task_documents", "read_task_document", "list_company_files", "read_company_file", "list_task_attachments", "read_task_attachment", "list_chat_attachments", "read_chat_attachment"].includes(name)) return ["documentsRead"];
  if (["write_document", "write_task_document", "register_deliverable"].includes(name)) return ["documentsWrite"];
  if (["list_projects", "get_project"].includes(name)) return ["projectsRead"];
  if (["create_project", "update_project", "delete_project"].includes(name)) return ["projectsManage"];
  if (["get_task", "get_task_context", "get_task_history", "search_tasks", "list_tasks", "list_assignments", "get_assignment", "get_approval_context"].includes(name)) return ["tasksRead"];
  if (["create_task", "create_assignment"].includes(name)) return ["tasksCreate"];
  if (["reassign_task", "assign_task"].includes(name)) return ["tasksAssign"];
  if (["report_progress", "set_task_title", "set_task_monitor", "set_dependencies", "comment_on_task", "update_task", "complete_task", "cancel_task", "request_human_input"].includes(name)) return ["tasksUpdate"];
  return [];
}

/** Runs before resource routers, including legacy MCP and arbitrary call_api requests. */
export function workPermissionsForRequest(method: string, path: string, body: unknown, agentId?: string): AgentWorkPermission[] {
  const value = record(body);
  if (path.startsWith("/mcp/") && value.method === "tools/call") return workPermissionsForTool(String(record(value.params).name ?? ""), record(value.params).arguments, agentId);
  const read = ["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
  if (/\/deliverable-reviews(?:\/|$)/.test(path)) return read ? ["documentsRead"] : ["documentsWrite", "tasksUpdate"];
  if (/\/(?:documents|document-revisions|company-files|work-products|attachments|context|assets)(?:\/|$)/.test(path)) return [read ? "documentsRead" : "documentsWrite"];
  if (/\/(?:workspaces|execution-workspaces|workspace|repositories|workspace-runtime)(?:\/|$)/.test(path)) {
    if (!read && /\/(?:workspace-runtime|runtime|runtime-services|runtime-commands|commands|execute|exec|run|services)(?:\/|$)/.test(path)) return ["workspaceRead", "workspaceWrite", "workspaceExecute"];
    return [read ? "workspaceRead" : "workspaceWrite"];
  }
  if (/\/(?:projects)(?:\/|$)/.test(path)) return [read ? "projectsRead" : "projectsManage"];
  if (/\/(?:issues|tasks|assignments)(?:\/|$)/.test(path)) {
    const required: AgentWorkPermission[] = [read ? "tasksRead" : method.toUpperCase() === "POST" && /\/(?:issues|tasks|assignments)\/?$/.test(path) ? "tasksCreate" : "tasksUpdate"];
    const newTask = required[0] === "tasksCreate";
    const assignmentChanged = Object.hasOwn(value, "assigneeAgentId") || Object.hasOwn(value, "assigneeUserId");
    if ((assignmentChanged && (!newTask || value.assigneeUserId || (value.assigneeAgentId != null && value.assigneeAgentId !== agentId))) || /\/(?:assign|reassign)(?:\/|$)/.test(path)) required.push("tasksAssign");
    return required;
  }
  return [];
}
