import { z } from "zod";

const idSchema = z.string().trim().min(1).max(200);
const materialKeySchema = z.string().trim().min(1).max(300);
const versionSchema = z.string().trim().min(1).max(200);
const scopeSchema = z.object({
  accountId: idSchema.nullable(),
  customerId: idSchema.nullable(),
}).strict();

export const activeArtifactSourceSnapshotSchema = z.object({
  companyId: idSchema,
  scope: scopeSchema,
  sourceId: idSchema,
  kind: z.enum(["offer", "brand", "calendar", "script", "proposal", "report", "other"]),
  objective: z.string().trim().min(1).max(2_000),
  evidence: z.enum(["explicit", "inferred", "unknown"]),
  reviewedVersion: versionSchema.nullable(),
  currentVersion: versionSchema.nullable(),
}).strict();

export const activeArtifactMissingMaterialSchema = z.object({
  key: materialKeySchema,
  description: z.string().trim().min(1).max(2_500),
  sourceId: idSchema.nullable(),
}).strict();

export const activeArtifactMaintenanceInputSchema = z.object({
  inputKey: idSchema,
  companyId: idSchema,
  scope: scopeSchema,
  artifact: z.object({
    companyId: idSchema,
    scope: scopeSchema,
    artifactId: idSchema,
    kind: z.enum(["offer", "brand", "calendar", "script", "proposal", "report", "other"]),
    objective: z.string().trim().min(1).max(2_000),
    acceptedVersion: versionSchema.nullable(),
    currentDraftVersion: versionSchema.nullable(),
    reviewPending: z.boolean(),
  }).strict(),
  sources: z.array(activeArtifactSourceSnapshotSchema).max(100),
  missingMaterials: z.array(activeArtifactMissingMaterialSchema).max(100),
}).strict().superRefine((input, ctx) => {
  const sourceIds = new Set<string>();
  if (input.artifact.companyId !== input.companyId) {
    ctx.addIssue({ code: "custom", path: ["artifact", "companyId"], message: "Artifact must belong to the selected company" });
  }
  if (input.artifact.scope.accountId !== input.scope.accountId || input.artifact.scope.customerId !== input.scope.customerId) {
    ctx.addIssue({ code: "custom", path: ["artifact", "scope"], message: "Artifact must match the selected account and customer scope" });
  }
  if (input.artifact.reviewPending && input.artifact.currentDraftVersion === null) {
    ctx.addIssue({ code: "custom", path: ["artifact", "reviewPending"], message: "A pending review requires a current draft" });
  }
  if (input.artifact.currentDraftVersion !== null && input.artifact.currentDraftVersion === input.artifact.acceptedVersion) {
    ctx.addIssue({ code: "custom", path: ["artifact", "currentDraftVersion"], message: "Current draft must differ from the accepted version" });
  }
  input.sources.forEach((source, index) => {
    if (sourceIds.has(source.sourceId)) {
      ctx.addIssue({ code: "custom", path: ["sources", index, "sourceId"], message: "Source snapshot IDs must be unique" });
    }
    sourceIds.add(source.sourceId);
    if (source.companyId !== input.companyId) {
      ctx.addIssue({ code: "custom", path: ["sources", index, "companyId"], message: "Source must belong to the selected company" });
    }
    if (source.scope.accountId !== input.scope.accountId || source.scope.customerId !== input.scope.customerId) {
      ctx.addIssue({ code: "custom", path: ["sources", index, "scope"], message: "Source must match the selected account and customer scope" });
    }
  });
  const materialKeys = new Set<string>();
  input.missingMaterials.forEach((material, index) => {
    if (material.key === "source-evidence" || material.key.startsWith("confirm-source:") ||
        material.key.startsWith("version-evidence:")) {
      ctx.addIssue({ code: "custom", path: ["missingMaterials", index, "key"], message: "Material key is reserved for derived evidence requests" });
    }
    if (materialKeys.has(material.key)) {
      ctx.addIssue({ code: "custom", path: ["missingMaterials", index, "key"], message: "Missing material keys must be unique" });
    }
    materialKeys.add(material.key);
    if (material.sourceId && !input.sources.some((source) => source.sourceId === material.sourceId)) {
      ctx.addIssue({ code: "custom", path: ["missingMaterials", index, "sourceId"], message: "Material source must be included in the source snapshot" });
    }
  });
});

export const activeArtifactMaintenanceProposalSchema = z.object({
  inputKey: idSchema,
  companyId: idSchema,
  scope: scopeSchema,
  artifactId: idSchema,
  artifactKind: z.enum(["offer", "brand", "calendar", "script", "proposal", "report", "other"]),
  objective: z.string().min(1).max(2_000),
  acceptedVersion: versionSchema.nullable(),
  currentDraftVersion: versionSchema.nullable(),
  sources: z.array(activeArtifactSourceSnapshotSchema).max(100),
  action: z.enum(["refresh", "request_material", "review", "no_change"]),
  staleDraft: z.boolean(),
  reasons: z.array(z.string().min(1).max(500)).max(100),
  materialsToRequest: z.array(activeArtifactMissingMaterialSchema).max(300),
}).strict().superRefine((proposal, ctx) => {
  const keys = new Set<string>();
  proposal.materialsToRequest.forEach((material, index) => {
    if (keys.has(material.key)) {
      ctx.addIssue({ code: "custom", path: ["materialsToRequest", index, "key"], message: "Proposal material keys must be unique" });
    }
    keys.add(material.key);
  });
});

export type ActiveArtifactMaintenanceInput = z.infer<typeof activeArtifactMaintenanceInputSchema>;
export type ActiveArtifactMaintenanceProposal = z.infer<typeof activeArtifactMaintenanceProposalSchema>;

/** Derives a reviewable proposal only; the caller owns persistence and deduplication by inputKey. */
export function deriveActiveArtifactMaintenance(
  rawInput: ActiveArtifactMaintenanceInput,
): ActiveArtifactMaintenanceProposal {
  const input = activeArtifactMaintenanceInputSchema.parse(rawInput);
  const artifact = input.artifact;
  const staleSources = input.sources.filter((source) =>
    source.evidence === "explicit" && source.reviewedVersion !== null && source.currentVersion !== null && source.reviewedVersion !== source.currentVersion,
  );
  const unconfirmedSources = input.sources.filter((source) => source.evidence !== "explicit");
  const unversionedSources = input.sources.filter((source) =>
    source.evidence === "explicit" && (source.reviewedVersion === null || source.currentVersion === null),
  );

  const materialsToRequest = [...input.missingMaterials];
  for (const source of unconfirmedSources) {
    materialsToRequest.push({
      key: `confirm-source:${source.sourceId}`,
      description: `Confirma que “${source.objective}” es una fuente de este artefacto y aporta una referencia o versión revisada.`,
      sourceId: source.sourceId,
    });
  }
  for (const source of unversionedSources) {
    materialsToRequest.push({
      key: `version-evidence:${source.sourceId}`,
      description: `Aporta evidencia de la versión revisada y de la versión actual para “${source.objective}”.`,
      sourceId: source.sourceId,
    });
  }
  if (input.sources.length === 0) {
    materialsToRequest.push({
      key: "source-evidence",
      description: "Identifica las fuentes explícitas del artefacto y aporta su objetivo y versión revisada y actual.",
      sourceId: null,
    });
  }

  let action: ActiveArtifactMaintenanceProposal["action"];
  let staleDraft = false;
  const reasons: string[] = [];
  if (artifact.currentDraftVersion !== null && staleSources.length > 0) {
    action = "review";
    staleDraft = true;
    reasons.push("Las fuentes cambiaron mientras ya existe un borrador; revisar ese borrador antes de proponer trabajo adicional.");
  } else if (artifact.reviewPending) {
    action = "review";
    reasons.push("El artefacto ya tiene una revisión pendiente.");
  } else if (materialsToRequest.length > 0) {
    action = "request_material";
    reasons.push("Falta confirmar fuentes o aportar materiales/versiones antes de decidir si el artefacto cambió.");
  } else if (staleSources.length > 0) {
    action = "refresh";
    reasons.push("Una o más fuentes explícitas tienen versiones distintas a las revisadas.");
  } else if (artifact.acceptedVersion === null && artifact.currentDraftVersion === null) {
    action = "refresh";
    reasons.push("El artefacto aún no tiene una versión aceptada; preparar su primera versión.");
  } else {
    action = "no_change";
    reasons.push("Las fuentes explícitas tienen evidencia versionada y no se observan cambios.");
  }

  return activeArtifactMaintenanceProposalSchema.parse({
    inputKey: input.inputKey,
    companyId: input.companyId,
    scope: input.scope,
    artifactId: artifact.artifactId,
    artifactKind: artifact.kind,
    objective: artifact.objective,
    acceptedVersion: artifact.acceptedVersion,
    currentDraftVersion: artifact.currentDraftVersion,
    sources: input.sources,
    action,
    staleDraft,
    reasons,
    materialsToRequest,
  });
}
