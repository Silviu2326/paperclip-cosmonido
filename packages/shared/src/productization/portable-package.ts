import { z } from "zod";

/**
 * Safe, declarative package interchange contract. This describes content for a
 * future import draft; it does not represent an installation or grant authority.
 */
const localIdSchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const catalogKeySchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,127}$/);
const copySchema = z.string().trim().min(1).max(4_000);
const shortCopySchema = z.string().trim().min(1).max(240);
const localRefSchema = z.object({ kind: z.literal("local"), id: localIdSchema }).strict();
const catalogRefSchema = z.object({
  kind: z.literal("catalog"),
  key: catalogKeySchema,
  version: z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/),
}).strict();

export const portablePackageReferenceSchema = z.discriminatedUnion("kind", [
  localRefSchema,
  catalogRefSchema,
]);

export const portablePackageTeamMemberSchema = z.object({
  id: localIdSchema,
  title: shortCopySchema,
  purpose: copySchema,
  deploymentMode: z.enum(["persistent", "assignment_specialist"]),
  deliveryCriteria: z.array(copySchema).max(40),
  suggestedCostLimit: z.object({
    amountMinor: z.number().int().nonnegative().max(100_000_000),
    currency: z.string().regex(/^[A-Z]{3}$/),
  }).strict().nullable(),
  reportsTo: localIdSchema.nullable(),
  skillRefs: z.array(portablePackageReferenceSchema).max(40),
}).strict();

export const portablePackageTeamSchema = z.object({
  id: localIdSchema,
  name: shortCopySchema,
  description: copySchema,
  members: z.array(portablePackageTeamMemberSchema).min(1).max(100),
}).strict();

export const portablePackagePlaybookSchema = z.object({
  id: localIdSchema,
  name: shortCopySchema,
  description: copySchema,
  steps: z.array(z.object({
    id: localIdSchema,
    title: shortCopySchema,
    guidance: copySchema,
    channel: z.enum(["email", "phone", "messaging", "meeting", "internal"]),
    waitDays: z.number().int().min(0).max(365),
    templateRefs: z.array(localRefSchema).max(40),
  }).strict()).min(1).max(100),
}).strict();

export const portablePackageRequestTemplateSchema = z.object({
  id: localIdSchema,
  name: shortCopySchema,
  outcome: copySchema,
  acceptanceCriteria: z.array(copySchema).min(1).max(40),
  expectedDeliverable: shortCopySchema,
  suggestedPlaybookRefs: z.array(portablePackageReferenceSchema).max(40),
}).strict();

export const portablePackageBrandPresetSchema = z.object({
  id: localIdSchema,
  name: shortCopySchema,
  voice: copySchema,
  audience: copySchema,
  preferredTerms: z.array(shortCopySchema).max(100),
  avoidedTerms: z.array(shortCopySchema).max(100),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
}).strict();

export const portablePackageFormSchema = z.object({
  id: localIdSchema,
  name: shortCopySchema,
  fields: z.array(z.object({
    id: localIdSchema,
    label: shortCopySchema,
    helpText: z.string().max(1_000).optional(),
    type: z.enum(["text", "long_text", "email", "phone", "url", "choice", "date"]),
    required: z.boolean(),
    choices: z.array(shortCopySchema).max(100).optional(),
  }).strict()).min(1).max(100),
}).strict().superRefine((form, ctx) => {
  const ids = new Set<string>();
  form.fields.forEach((field, index) => {
    if (ids.has(field.id)) {
      ctx.addIssue({ code: "custom", path: ["fields", index, "id"], message: "Duplicate field id" });
    }
    ids.add(field.id);
    if (field.type === "choice") {
      const choices = field.choices ?? [];
      if (choices.length < 2 || new Set(choices).size !== choices.length) {
        ctx.addIssue({ code: "custom", path: ["fields", index, "choices"], message: "Choice fields require at least two unique choices" });
      }
    } else if (field.choices !== undefined) {
      ctx.addIssue({ code: "custom", path: ["fields", index, "choices"], message: "Only choice fields may define choices" });
    }
  });
});

export const portablePackageMeetingTypeSchema = z.object({
  id: localIdSchema,
  name: shortCopySchema,
  description: copySchema,
  durationMinutes: z.number().int().min(5).max(480),
  preparation: z.array(copySchema).max(40),
}).strict();

export const portablePackageConnectionRequestSchema = z.object({
  provider: z.enum(["google_workspace", "hubspot", "pipedrive", "salesforce", "slack", "stripe"]),
  reason: shortCopySchema,
  capabilities: z.array(z.enum([
    "read_calendar", "write_calendar", "read_email", "send_email",
    "read_contacts", "write_contacts", "read_opportunities", "write_opportunities",
    "read_messages", "send_messages", "read_billing",
  ])).min(1).max(11),
}).strict();

/** Version 1 intentionally contains no identity, authority, secret, or executable fields. */
export const portablePackageSchema = z.object({
  format: z.literal("paperclip.portable-package"),
  version: z.literal(1),
  packageKey: catalogKeySchema,
  packageVersion: z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/),
  name: shortCopySchema,
  description: copySchema,
  teams: z.array(portablePackageTeamSchema).max(100),
  skills: z.array(z.object({
    id: localIdSchema,
    catalogKey: catalogKeySchema,
    catalogVersion: z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/),
  }).strict()).max(200),
  playbooks: z.array(portablePackagePlaybookSchema).max(100),
  requestTemplates: z.array(portablePackageRequestTemplateSchema).max(100),
  brandPresets: z.array(portablePackageBrandPresetSchema).max(100),
  forms: z.array(portablePackageFormSchema).max(100),
  meetingTypes: z.array(portablePackageMeetingTypeSchema).max(100),
  connectionRequests: z.array(portablePackageConnectionRequestSchema).max(30),
}).strict().superRefine((value, ctx) => {
  const checkUnique = (ids: string[], path: (string | number)[]) => {
    const seen = new Set<string>();
    ids.forEach((id, index) => {
      if (seen.has(id)) ctx.addIssue({ code: "custom", path: [...path, index], message: "Duplicate local id" });
      seen.add(id);
    });
  };
  checkUnique(value.teams.map((item) => item.id), ["teams"]);
  checkUnique(value.skills.map((item) => item.id), ["skills"]);
  checkUnique(value.playbooks.map((item) => item.id), ["playbooks"]);
  checkUnique(value.requestTemplates.map((item) => item.id), ["requestTemplates"]);
  checkUnique(value.brandPresets.map((item) => item.id), ["brandPresets"]);
  checkUnique(value.forms.map((item) => item.id), ["forms"]);
  checkUnique(value.meetingTypes.map((item) => item.id), ["meetingTypes"]);

  const skillIds = new Set(value.skills.map((item) => item.id));
  const playbookIds = new Set(value.playbooks.map((item) => item.id));
  const templateIds = new Set(value.requestTemplates.map((item) => item.id));
  value.teams.forEach((team, teamIndex) => {
    const memberIds = new Set(team.members.map((member) => member.id));
    checkUnique(team.members.map((member) => member.id), ["teams", teamIndex, "members"]);
    const managerByMember = new Map(team.members.map((member) => [member.id, member.reportsTo]));
    team.members.forEach((member, memberIndex) => {
      if (member.reportsTo && !memberIds.has(member.reportsTo)) {
        ctx.addIssue({ code: "custom", path: ["teams", teamIndex, "members", memberIndex, "reportsTo"], message: "Manager must refer to a member of this team" });
      }
      if (member.reportsTo === member.id) {
        ctx.addIssue({ code: "custom", path: ["teams", teamIndex, "members", memberIndex, "reportsTo"], message: "A member cannot report to themselves" });
      }
      const visited = new Set<string>([member.id]);
      let manager = member.reportsTo;
      while (manager) {
        if (visited.has(manager)) {
          ctx.addIssue({ code: "custom", path: ["teams", teamIndex, "members", memberIndex, "reportsTo"], message: "Reporting relationships cannot contain cycles" });
          break;
        }
        visited.add(manager);
        manager = managerByMember.get(manager) ?? null;
      }
      if (member.deploymentMode === "assignment_specialist" && member.deliveryCriteria.length === 0) {
        ctx.addIssue({ code: "custom", path: ["teams", teamIndex, "members", memberIndex, "deliveryCriteria"], message: "Assignment specialists require delivery criteria" });
      }
      member.skillRefs.forEach((ref, refIndex) => {
        if (ref.kind === "local" && !skillIds.has(ref.id)) {
          ctx.addIssue({ code: "custom", path: ["teams", teamIndex, "members", memberIndex, "skillRefs", refIndex], message: "Local skill reference does not resolve" });
        }
      });
    });
  });
  value.playbooks.forEach((playbook, playbookIndex) => {
    checkUnique(playbook.steps.map((step) => step.id), ["playbooks", playbookIndex, "steps"]);
    playbook.steps.forEach((step, stepIndex) => step.templateRefs.forEach((ref, refIndex) => {
      if (!templateIds.has(ref.id)) {
        ctx.addIssue({ code: "custom", path: ["playbooks", playbookIndex, "steps", stepIndex, "templateRefs", refIndex], message: "Request template reference does not resolve" });
      }
    }));
  });
  value.requestTemplates.forEach((template, templateIndex) => template.suggestedPlaybookRefs.forEach((ref, refIndex) => {
    if (ref.kind === "local" && !playbookIds.has(ref.id)) {
      ctx.addIssue({ code: "custom", path: ["requestTemplates", templateIndex, "suggestedPlaybookRefs", refIndex], message: "Local playbook reference does not resolve" });
    }
  }));
  checkUnique(value.skills.map((item) => item.catalogKey), ["skills", "catalogKey"]);
});

export type PortablePackage = z.infer<typeof portablePackageSchema>;
export type PortablePackageConnectionRequest = z.infer<typeof portablePackageConnectionRequestSchema>;
