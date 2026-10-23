import { z } from "zod";
import { mcpAgentModelConfig } from "./agent-config.js";
import {
  updateIssueSchema, upsertIssueDocumentSchema, updateAgentSchema, upsertAgentInstructionsFileSchema,
  aiRuntimeConnectionBindingSchema, createProjectSchema, updateProjectSchema,
  companySkillCreateSchema, companySkillUpdateSchema, companySkillFileUpdateSchema,
  createIssueWorkProductSchema, updateIssueWorkProductSchema,
  createAgentSchema,
} from "@paperclipai/shared";
import { McpApiError, company, task, requestId, pathId, object, pick, rows, taskFields, documentFields, type Capability } from "./contracts.js";

const agent = { ...company, agentId: z.uuid() };
const project = { ...company, projectId: z.uuid() };
const skill = { ...company, skillId: z.uuid() };
const key = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,99}$/);
const skillSource = { ...company, sourceId: z.uuid() };
const skillRepoUrl = z.string().trim().min(1).max(2048).url().refine(value => {
  try { const url = new URL(value); return url.protocol === "https:" && url.hostname === "github.com"; }
  catch { return false; }
}, "Use an HTTPS GitHub repository URL.");
const repoPath = z.string().max(4096).refine(value => !value.startsWith("/") && !value.includes("\\") && !value.split("/").some(part => part === ".." || part === "."), "Use a relative repository path.");
const filePath = z.string().min(1).max(512).refine(v => !v.startsWith("/") && !v.includes("\\") && v.split("/").every(p => p !== ".." && p !== "." && p !== ""), "Use a relative file path without traversal");
const taskChanges = updateIssueSchema.pick({ title: true, description: true, assigneeAgentId: true, assigneeUserId: true, projectId: true, parentId: true, blockedByIssueIds: true, unblockDescriptor: true, status: true, priority: true }).extend({
  title: z.string().trim().min(1).max(240).optional(), description: z.string().max(524288).nullable().optional(),
  assigneeAgentId: z.uuid().nullable().optional(), blockedByIssueIds: z.array(z.uuid()).max(100).optional(),
}).strict();
const agentChanges = updateAgentSchema.pick({ name: true, role: true, title: true, icon: true, reportsTo: true, capabilities: true, desiredSkills: true, budgetMonthlyCents: true }).extend({
  adapterConfig: z.object({ model: z.string().trim().min(1).max(256).optional(), reasoningEffort: z.enum(["minimal", "low", "medium", "high", "xhigh", "max", "ultra"]).optional() }).strict().optional(),
  runtimeConfig: z.object({ aiConnection: aiRuntimeConnectionBindingSchema }).strict().optional(),
}).strict();
const projectFields = { name: true, description: true, status: true, leadAgentId: true, goalIds: true, targetDate: true, color: true, icon: true } as const;
const skillMetadata = companySkillUpdateSchema.unwrap().pick({ description: true, iconUrl: true, color: true, tagline: true, authorName: true, homepageUrl: true, categories: true }).strict();
const deliverableFields = { type: true, provider: true, externalId: true, title: true, url: true, status: true, isPrimary: true, summary: true } as const;
// Approval decisions are not exposed by changing a work product's review state/status.
const deliverableStatus = z.enum(["active", "ready_for_review", "closed", "failed", "archived", "draft"]);
const agentFields = ["id", "companyId", "name", "role", "title", "icon", "status", "reportsTo", "capabilities", "desiredSkills", "budgetMonthlyCents", "adapterType", "defaultEnvironmentId"];
const projectOutputFields = ["id", "companyId", "name", "description", "status", "leadAgentId", "goalIds", "targetDate", "color", "icon", "repositories"];
const workFields = ["id", "issueId", "type", "provider", "externalId", "title", "url", "status", "isPrimary", "summary", "metadata", "updatedAt"];
const skillFields = ["id", "companyId", "name", "slug", "key", "description", "markdown", "versionId", "currentVersionId", "latestVersionId", "categories", "tagline", "iconUrl", "color", "authorName", "homepageUrl", "sharingScope", "updatedAt"];
function agentOutput(value: unknown) {
  const v = object(value);
  return { ...pick(v, agentFields), adapterConfig: mcpAgentModelConfig(String(v.adapterType), object(v.adapterConfig)), runtimeConfig: pick(v.runtimeConfig, ["aiConnection"]) };
}
function projectOutput(value: unknown) {
  const v = object(value);
  return { ...pick(v, projectOutputFields), repositories: rows(v.workspaces).flatMap(raw => {
    const workspace = object(raw);
    if (typeof workspace.repoUrl !== "string") return [];
    let url: string | null = null;
    try {
      const parsed = new URL(workspace.repoUrl);
      if (["https:", "http:", "ssh:"].includes(parsed.protocol)) {
        parsed.username = ""; parsed.password = ""; parsed.search = ""; parsed.hash = "";
        url = parsed.toString();
      }
    } catch { /* Do not disclose opaque legacy remote strings or local paths. */ }
    return [{ id: object(workspace.metadata).githubRepositoryId ?? null, name: workspace.name, url }];
  }) };
}
const skillBase = (a: Record<string, unknown>) => `/companies/${pathId(a.companyId)}/skills`;
const skillPath = (a: Record<string, unknown>) => `${skillBase(a)}/${pathId(a.skillId)}`;
const nonempty = <T extends z.ZodObject>(schema: T) => schema.refine(v => Object.keys(v).length > 0, "Supply at least one change");

export const expandedMcpCapabilities: Capability[] = [
  {
    name: "paperclip_update_task", write: true, destructive: true,
    description: "Edit a task's title, description, priority, project, parent, dependencies, assignment or status as the connected person. Assignment/status changes may schedule agents and spend configured budget. Review decisions must be made in Paperclip. Reuse requestId on retries.",
    schema: z.object({ ...task, requestId, changes: nonempty(taskChanges) }).strict(),
    run: async (p, a, api) => ({ task: pick(await api(p, "PATCH", `/issues/${pathId(a.taskId)}`, a.changes), taskFields) }),
  },
  {
    name: "paperclip_finish_task", write: true, destructive: true,
    description: "Mark a task done as the connected person. This is not an agent run finalization or an approval decision. Review gates and existing execution controls still apply.",
    schema: z.object({ ...task, requestId }).strict(),
    run: async (p, a, api) => ({ task: pick(await api(p, "PATCH", `/issues/${pathId(a.taskId)}`, { status: "done" }), taskFields) }),
  },
  {
    name: "paperclip_block_task", write: true, destructive: true,
    description: "Block a task with an explicit owner and action needed to unblock it. Existing dependency, approval and execution controls apply; this does not impersonate its assigned agent.",
    schema: z.object({ ...task, requestId, unblockDescriptor: taskChanges.shape.unblockDescriptor.unwrap().unwrap() }).strict(),
    run: async (p, a, api) => ({ task: pick(await api(p, "PATCH", `/issues/${pathId(a.taskId)}`, { status: "blocked", unblockDescriptor: a.unblockDescriptor }), taskFields) }),
  },
  {
    name: "paperclip_write_document", write: true, destructive: true,
    description: "Create or update a durable Markdown task document. Read it first and supply latestRevisionId as baseRevisionId; use null only for a new document. A stale revision is rejected. For videos or binary files use paperclip_get_upload_url.",
    schema: z.object({ ...task, requestId, key, document: upsertIssueDocumentSchema.extend({ baseRevisionId: z.uuid().nullable() }).strict() }).strict(),
    run: async (p, a, api) => ({ document: pick(await api(p, "PUT", `/issues/${pathId(a.taskId)}/documents/${pathId(a.key)}`, a.document), documentFields) }),
  },
  {
    name: "paperclip_list_document_revisions", description: "Read a task document's revision history before editing or comparing saved results.",
    schema: z.object({ ...task, key }).strict(),
    run: async (p, a, api) => ({ revisions: await api(p, "GET", `/issues/${pathId(a.taskId)}/documents/${pathId(a.key)}/revisions`) }),
  },
  {
    name: "paperclip_register_deliverable", write: true,
    description: "Register a durable task deliverable. An attachmentId registers an uploaded file owned by this task. No external URL is fetched. This cannot approve a deliverable.",
    schema: z.object({ ...task, requestId, deliverable: createIssueWorkProductSchema.pick(deliverableFields).extend({ status: deliverableStatus.default("active") }).strict(), attachmentId: z.uuid().optional() }).strict(),
    run: async (p, a, api) => ({ deliverable: pick(await api(p, "POST", `/issues/${pathId(a.taskId)}/work-products`, await attachmentDeliverable(p, a, api)), workFields) }),
  },
  {
    name: "paperclip_update_deliverable", write: true, destructive: true,
    description: "Update a task deliverable, or replace its attachment reference with a newly uploaded file. Older attachments remain available. This cannot decide a review.",
    schema: z.object({ ...task, requestId, deliverableId: z.uuid(), deliverable: updateIssueWorkProductSchema.pick(deliverableFields).extend({ status: deliverableStatus.optional() }).strict(), attachmentId: z.uuid().optional() }).strict(),
    run: async (p, a, api) => {
      const owned = rows(await api(p, "GET", `/issues/${pathId(a.taskId)}/work-products`));
      if (!owned.some(v => object(v).id === a.deliverableId)) throw new McpApiError(404);
      return { deliverable: pick(await api(p, "PATCH", `/work-products/${pathId(a.deliverableId)}`, await attachmentDeliverable(p, a, api)), workFields) };
    },
  },
  {
    name: "paperclip_get_agent", description: "Get an agent's identity and non-secret operating configuration. Credentials, environment variables and permission policies are not returned.",
    schema: z.object(agent).strict(), run: async (p, a, api) => ({ agent: agentOutput(await api(p, "GET", `/agents/${pathId(a.agentId)}/configuration`)) }),
  },
  {
    name: "paperclip_diagnose_agent_setup", description: "Check saved, non-secret agent setup fields and identify visible gaps. This does not test credentials, provider access, environment availability or execution; use Paperclip to connect credentials and run a real check.",
    schema: z.object(agent).strict(), run: async (p, a, api) => {
      const agent = agentOutput(await api(p, "GET", `/agents/${pathId(a.agentId)}/configuration`));
      const config = object(agent.adapterConfig);
      const binding = object(object(agent.runtimeConfig).aiConnection);
      const checks = {
        modelOverridePresent: typeof config.model === "string" && config.model.trim().length > 0,
        connectionBindingPresent: Object.keys(binding).length > 0,
        budgetConfigured: typeof agent.budgetMonthlyCents === "number" && agent.budgetMonthlyCents > 0,
        environmentSelected: typeof agent.defaultEnvironmentId === "string",
      };
      return { agent: pick(agent, agentFields), checks, limits: ["Saved configuration only; no credentials or secrets were read.", "No provider request or agent execution was started.", "Execution capacity and remaining company budget are not measured by this diagnostic."], nextStep: "If a required item is missing, connect credentials or select execution settings in Paperclip, then use its authorized run controls to verify a real execution." };
    },
  },
  {
    name: "paperclip_create_agent", configure: true, destructive: true,
    description: "Create an agent in the authorized company using an existing adapter type, role, reporting line, skills and budget. Requires configuration consent and the normal agent creation permission. Company approval requirements remain enforced; credentials, arbitrary commands and permission policies are not accepted. A created agent may still require setup in Paperclip before it can run.",
    schema: z.object({ ...company, requestId, agent: createAgentSchema.pick({ name: true, role: true, title: true, reportsTo: true, capabilities: true, desiredSkills: true, adapterType: true, budgetMonthlyCents: true }).strict() }).strict(),
    run: async (p, a, api) => ({ agent: agentOutput(await api(p, "POST", `/companies/${pathId(a.companyId)}/agents`, a.agent)) }),
  },
  {
    name: "paperclip_update_agent", configure: true, destructive: true,
    description: "Update an existing agent's identity, reporting line, selected skills, model, budget, or binding to an existing AI connection. Requires configuration consent. Does not change credentials, execution commands or permission policies. New settings affect future execution.",
    schema: z.object({ ...agent, requestId, changes: nonempty(agentChanges) }).strict(), run: async (p, a, api) => ({ agent: agentOutput(await api(p, "PATCH", `/agents/${pathId(a.agentId)}`, a.changes)) }),
  },
  {
    name: "paperclip_read_agent_instructions", description: "Read an agent instruction file and its revision/hash. Defaults to AGENTS.md. Use the returned revision/hash when updating.",
    schema: z.object({ ...agent, path: filePath.default("AGENTS.md") }).strict(),
    run: async (p, a, api) => ({ instructions: await api(p, "GET", `/agents/${pathId(a.agentId)}/instructions-bundle/file?path=${pathId(a.path)}`) }),
  },
  {
    name: "paperclip_update_agent_instructions", configure: true, destructive: true,
    description: "Update an existing agent's instruction file. Requires configuration consent and the revision/hash from a prior read; use null for a new file. Managed paths and normal instruction permissions apply. Legacy promptTemplate.legacy.md must be migrated in Paperclip before editing.",
    schema: z.object({ ...agent, requestId, file: upsertAgentInstructionsFileSchema.omit({ clearLegacyPromptTemplate: true }).extend({ path: filePath }).refine(v => v.baseRevisionId !== undefined || v.baseHash !== undefined, "Read the file and provide its baseRevisionId or baseHash") }).strict(),
    run: async (p, a, api) => ({ instructions: await api(p, "PUT", `/agents/${pathId(a.agentId)}/instructions-bundle/file`, a.file) }),
  },
  {
    name: "paperclip_list_agent_instruction_revisions", description: "Read the revision history for an agent's entry instructions.",
    schema: z.object({ ...agent, path: filePath.optional(), cursor: z.uuid().optional() }).strict(),
    run: async (p, a, api) => ({ revisions: await api(p, "GET", `/agents/${pathId(a.agentId)}/instructions-bundle/history?${new URLSearchParams(Object.fromEntries(["path", "cursor"].filter(k => a[k] !== undefined).map(k => [k, String(a[k])])) )}`) }),
  },
  {
    name: "paperclip_review_capacity_costs", description: "Read authorized company budget overview, recent window spend and agent availability for an operational capacity review. Cost-read permission is checked by Paperclip; provider spend not reported by the instance is not inferred.",
    schema: z.object(company).strict(),
    run: async (p, a, api) => {
      const [budgets, spend, agents] = await Promise.all([
        api(p, "GET", `/companies/${pathId(a.companyId)}/budgets/overview`),
        api(p, "GET", `/companies/${pathId(a.companyId)}/costs/window-spend`),
        api(p, "GET", `/companies/${pathId(a.companyId)}/agents`),
      ]);
      return {
        budgets,
        spend,
        agents: rows(agents).map(value => pick(value, ["id", "name", "role", "status", "budgetMonthlyCents", "spentMonthlyCents", "adapterType"])),
        limits: ["Reports only spend recorded by Paperclip; external provider charges may not be reported.", "Availability is the current agent status, not a guarantee that execution can start."],
      };
    },
  },
  {
    name: "paperclip_get_project", description: "Read a project's settings and repository references.", schema: z.object(project).strict(),
    run: async (p, a, api) => ({ project: projectOutput(await api(p, "GET", `/projects/${pathId(a.projectId)}`)) }),
  },
  {
    name: "paperclip_create_project", configure: true, description: "Create a project, optionally selecting repository IDs from paperclip_list_project_repositories. Requires configuration consent. Does not create remote repositories or configure execution commands.",
    schema: z.object({ ...company, requestId, project: createProjectSchema.pick({ ...projectFields, repositoryIds: true }).strict() }).strict(),
    run: async (p, a, api) => ({ project: projectOutput(await api(p, "POST", `/companies/${pathId(a.companyId)}/projects`, { ...object(a.project), idempotencyKey: `mcp:${p.grant.userId}:${a.requestId}` })) }),
  },
  {
    name: "paperclip_update_project", configure: true, destructive: true, description: "Update a project's name, description, status, lead, goals, target date, icon or color. Requires configuration consent.",
    schema: z.object({ ...project, requestId, changes: nonempty(updateProjectSchema.pick(projectFields).strict()) }).strict(),
    run: async (p, a, api) => ({ project: projectOutput(await api(p, "PATCH", `/projects/${pathId(a.projectId)}`, a.changes)) }),
  },
  {
    name: "paperclip_list_project_repositories", description: "List repository choices available to this person and organization before creating a project or changing its repositories.", schema: z.object(company).strict(),
    run: async (p, a, api) => ({ repositories: await api(p, "GET", `/companies/${pathId(a.companyId)}/project-repositories`) }),
  },
  {
    name: "paperclip_set_project_repositories", configure: true, destructive: true, description: "Replace a project's repository selection with IDs from paperclip_list_project_repositories. Requires configuration consent and normal repository access.",
    schema: z.object({ ...project, requestId, repositoryIds: z.array(z.string().regex(/^\d+$/)).max(100) }).strict(),
    run: async (p, a, api) => ({ project: projectOutput(await api(p, "PUT", `/projects/${pathId(a.projectId)}/repositories`, { repositoryIds: a.repositoryIds })) }),
  },
  {
    name: "paperclip_list_skills", description: "List skills visible in the authorized organization.", schema: z.object(company).strict(),
    run: async (p, a, api) => ({ skills: rows(await api(p, "GET", skillBase(a))).map(v => pick(v, skillFields)) }),
  },
  {
    name: "paperclip_list_skill_sources", description: "List configured skill sources and their selected/imported entries. Use this before refreshing or disconnecting a source.", schema: z.object(company).strict(),
    run: async (p, a, api) => ({ sources: rows(await api(p, "GET", `/companies/${pathId(a.companyId)}/skill-sources`)) }),
  },
  {
    name: "paperclip_discover_skill_source", description: "Scan an HTTPS GitHub repository for installable skills before importing. Discovery does not install content; review candidates and the returned commit SHA first.", schema: z.object({ ...company, repositoryUrl: skillRepoUrl, packageMode: z.enum(["skills", "repository"]).optional(), trackingRef: z.string().trim().min(1).max(255).optional(), connectionId: z.uuid().nullable().optional() }).strict(),
    run: async (p, a, api) => ({ discovery: await api(p, "POST", `/companies/${pathId(a.companyId)}/skill-sources/discover`, { repositoryUrl: a.repositoryUrl, packageMode: a.packageMode, trackingRef: a.trackingRef, connectionId: a.connectionId }) }),
  },
  {
    name: "paperclip_preview_skill_source_file", description: "Preview one file from a discovered GitHub skill at its immutable commit before importing. This does not install the skill.", schema: z.object({ ...company, repositoryUrl: skillRepoUrl, packageMode: z.enum(["skills", "repository"]).optional(), trackingRef: z.string().trim().min(1).max(255).optional(), connectionId: z.uuid().nullable().optional(), commitSha: z.string().regex(/^[a-f0-9]{40}$/i), skillPath: repoPath.refine(value => /(^|\/)skill\.md$/i.test(value)), filePath: repoPath.min(1) }).strict(),
    run: async (p, a, api) => ({ preview: await api(p, "POST", `/companies/${pathId(a.companyId)}/skill-sources/preview`, { repositoryUrl: a.repositoryUrl, packageMode: a.packageMode, trackingRef: a.trackingRef, connectionId: a.connectionId, commitSha: a.commitSha, skillPath: a.skillPath, filePath: a.filePath }) }),
  },
  {
    name: "paperclip_install_skill_source", configure: true, destructive: true, description: "Install selected skills from a reviewed GitHub discovery at its exact commit. Requires configuration consent and normal skill import policy; importing never executes repository code.", schema: z.object({ ...company, requestId, repositoryUrl: skillRepoUrl, packageMode: z.enum(["skills", "repository"]).optional(), trackingRef: z.string().trim().min(1).max(255).optional(), connectionId: z.uuid().nullable().optional(), commitSha: z.string().regex(/^[a-f0-9]{40}$/i), selectedPaths: z.array(repoPath).max(10000), excludedFolders: z.array(repoPath).max(10000).default([]) }).strict(),
    run: async (p, a, api) => ({ result: await api(p, "POST", `/companies/${pathId(a.companyId)}/skill-sources`, { repositoryUrl: a.repositoryUrl, packageMode: a.packageMode, trackingRef: a.trackingRef, connectionId: a.connectionId, commitSha: a.commitSha, selectedPaths: a.selectedPaths, excludedFolders: a.excludedFolders }) }),
  },
  {
    name: "paperclip_refresh_skill_source", configure: true, destructive: true, description: "Check and apply the latest selected versions from a configured skill source. Read the source first and pass its current revision; source policy and skill validation still apply.", schema: z.object({ ...skillSource, requestId, revision: z.number().int().nonnegative(), packageMode: z.enum(["skills", "repository"]).optional(), selectedPaths: z.array(repoPath).max(10000), excludedFolders: z.array(repoPath).max(10000), connectionId: z.uuid().nullable().optional() }).strict(),
    run: async (p, a, api) => ({ result: await api(p, "PATCH", `/companies/${pathId(a.companyId)}/skill-sources/${pathId(a.sourceId)}`, { revision: a.revision, packageMode: a.packageMode, selectedPaths: a.selectedPaths, excludedFolders: a.excludedFolders, connectionId: a.connectionId }) }),
  },
  {
    name: "paperclip_update_skill_source_settings", configure: true, destructive: true, description: "Change tracking branch or automatic update settings for a skill source. Read the source first and pass its current revision; normal source authorization applies.", schema: z.object({ ...skillSource, requestId, revision: z.number().int().nonnegative(), automaticUpdates: z.boolean().optional(), importNewSkills: z.boolean().optional(), connectionId: z.uuid().nullable().optional(), trackingRef: z.string().trim().min(1).max(255).optional() }).strict(),
    run: async (p, a, api) => ({ source: await api(p, "PATCH", `/companies/${pathId(a.companyId)}/skill-sources/${pathId(a.sourceId)}/settings`, { revision: a.revision, automaticUpdates: a.automaticUpdates, importNewSkills: a.importNewSkills, connectionId: a.connectionId, trackingRef: a.trackingRef }) }),
  },
  {
    name: "paperclip_disconnect_skill_source", configure: true, destructive: true, description: "Disconnect a skill source after choosing whether imported skills become independent copies or are deleted. Read source details first; copy/delete operations remain governed by skill policy.", schema: z.object({ ...skillSource, requestId, revision: z.number().int().nonnegative(), skills: z.enum(["copy", "delete"]) }).strict(),
    run: async (p, a, api) => ({ result: await api(p, "DELETE", `/companies/${pathId(a.companyId)}/skill-sources/${pathId(a.sourceId)}`, { revision: a.revision, skills: a.skills }) }),
  },
  {
    name: "paperclip_get_skill", description: "Read a skill's metadata and current version before editing.", schema: z.object(skill).strict(),
    run: async (p, a, api) => ({ skill: pick(await api(p, "GET", skillPath(a)), skillFields) }),
  },
  {
    name: "paperclip_create_skill", configure: true, description: "Create an organization skill with Markdown instructions. Requires configuration consent and normal skill policy. Does not enable public sharing.",
    schema: z.object({ ...company, requestId, skill: companySkillCreateSchema.pick({ name: true, slug: true, description: true, markdown: true, folderId: true, categories: true }).strict() }).strict(),
    run: async (p, a, api) => ({ skill: pick(await api(p, "POST", skillBase(a), { ...object(a.skill), idempotencyKey: `mcp:${a.requestId}` }), skillFields) }),
  },
  {
    name: "paperclip_update_skill", configure: true, destructive: true, description: "Update skill metadata. To update instructions or assets use paperclip_write_skill_file. Requires configuration consent; does not change sharing permissions.",
    schema: z.object({ ...skill, requestId, changes: nonempty(skillMetadata) }).strict(),
    run: async (p, a, api) => ({ skill: pick(await api(p, "PATCH", skillPath(a), a.changes), skillFields) }),
  },
  {
    name: "paperclip_read_skill_file", description: "Read a skill file such as SKILL.md. Binary skill assets use the returned encoding; large task files use attachment downloads.",
    schema: z.object({ ...skill, path: filePath.default("SKILL.md") }).strict(),
    run: async (p, a, api) => ({ file: await api(p, "GET", `${skillPath(a)}/files?path=${pathId(a.path)}`) }),
  },
  {
    name: "paperclip_write_skill_file", configure: true, destructive: true, description: "Write skill instructions or a bounded asset using utf8 or base64. Supply expectedVersionId from paperclip_get_skill, null for a new skill version. Normal skill policy and file safety checks apply.",
    schema: z.object({ ...skill, requestId, file: companySkillFileUpdateSchema.omit({ idempotencyKey: true }).extend({ path: filePath, content: z.string().max(524288), expectedVersionId: z.uuid().nullable() }).strict() }).strict(),
    run: async (p, a, api) => ({ file: await api(p, "PATCH", `${skillPath(a)}/files`, { ...object(a.file), idempotencyKey: `mcp:${a.requestId}` }) }),
  },
  {
    name: "paperclip_remove_skill", configure: true, destructive: true, description: "Remove an organization skill when it is no longer assigned or referenced. Requires configuration consent and the normal skills.remove policy; Paperclip refuses deletion while assignments must be detached first.",
    schema: z.object({ ...skill, requestId }).strict(),
    run: async (p, a, api) => ({ result: await api(p, "DELETE", skillPath(a)) }),
  },
];

async function attachmentDeliverable(p: Parameters<Capability["run"]>[0], a: Record<string, unknown>, api: Parameters<Capability["run"]>[2]) {
  const result = { ...object(a.deliverable) };
  if (!a.attachmentId) return result;
  const attachment = rows(await api(p, "GET", `/issues/${pathId(a.taskId)}/attachments`)).find(v => object(v).id === a.attachmentId);
  if (!attachment) throw new McpApiError(404);
  const contentPath = `/api/attachments/${a.attachmentId}/content`;
  return { ...result, type: "artifact", provider: "paperclip", externalId: a.attachmentId, metadata: {
    ...pick(attachment, ["contentType", "byteSize", "originalFilename"]), attachmentId: a.attachmentId,
    contentPath, openPath: contentPath, downloadPath: contentPath + "?download=1",
  } };
}
