import { and, desc, eq, ilike, isNull, or } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { assets, companyFileVersions, companyFiles, leadQualifications } from "@paperclipai/db";
import {
  qualificationCriteriaSchema,
  type LeadQualification,
  type LeadQualificationReason,
  type LeadQualifyInput,
  type QualificationCriteria,
} from "@paperclipai/shared";
import { unprocessable } from "../errors.js";

export const QUALIFICATION_CRITERIA_CONTEXT_ROLE = "procedure";
export const QUALIFICATION_CRITERIA_MISSING_MESSAGE =
  "Define el documento de contexto 'qualification-criteria' (rol procedure) antes de cualificar";

export interface LeadQualificationActor {
  agentId?: string | null;
  runId?: string | null;
  userId?: string | null;
}

export interface LeadQualificationDeps {
  /** Returns the company's criteria, or null when the criteria document is absent. Defaults to the context document lookup. */
  loadCriteria?: (companyId: string) => Promise<QualificationCriteria | null>;
  now?: () => Date;
}

const MAX_CRITERIA_BYTES = 1024 * 1024;

/**
 * Extracts the criteria JSON from a context document. Accepts a plain JSON document or markdown
 * containing a ```json fenced block. Returns null when no JSON can be found.
 */
export function parseCriteriaDocument(text: string, contentType: string | null | undefined): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const isMarkdown = /markdown/i.test(contentType ?? "");
  if (!isMarkdown && (/json/i.test(contentType ?? "") || trimmed.startsWith("{"))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // Fall through to the fenced-block lookup.
    }
  }
  const fenced = /```json\s*\n([\s\S]*?)\n```/i.exec(text);
  if (!fenced) return null;
  return JSON.parse(fenced[1]!);
}

async function readStreamText(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    chunks.push(buffer);
    size += buffer.length;
    if (size >= MAX_CRITERIA_BYTES) break;
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Default loader: the newest company-level context file with role `procedure` whose name names the criteria. */
export async function loadCriteriaFromContext(db: Db, companyId: string): Promise<QualificationCriteria | null> {
  const rows = await db
    .select({
      name: companyFiles.name,
      contentType: companyFiles.contentType,
      objectKey: assets.objectKey,
    })
    .from(companyFiles)
    .leftJoin(companyFileVersions, eq(companyFileVersions.id, companyFiles.currentVersionId))
    .leftJoin(assets, and(eq(assets.id, companyFileVersions.assetId), eq(assets.companyId, companyId)))
    .where(and(
      eq(companyFiles.companyId, companyId),
      eq(companyFiles.contextRole, QUALIFICATION_CRITERIA_CONTEXT_ROLE),
      eq(companyFiles.audienceKind, "company"),
      isNull(companyFiles.deletedAt),
      or(
        ilike(companyFiles.name, "%qualification-criteria%"),
        ilike(companyFiles.name, "%criterios de cualificación%"),
      ),
    ))
    .orderBy(desc(companyFiles.updatedAt))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (!row.objectKey) {
    throw unprocessable("El documento de criterios no tiene contenido legible");
  }
  // Lazy import keeps the storage bootstrap out of modules that never read criteria (and out of unit tests).
  const { getStorageService } = await import("../storage/index.js");
  const object = await getStorageService().getObject(companyId, row.objectKey);
  const text = await readStreamText(object.stream);
  let parsed: unknown;
  try {
    parsed = parseCriteriaDocument(text, row.contentType);
  } catch (error) {
    throw unprocessable(`El documento de criterios no es JSON válido: ${error instanceof Error ? error.message : "error de lectura"}`);
  }
  if (parsed === null) {
    throw unprocessable("El documento de criterios no contiene un bloque JSON con los criterios");
  }
  const validated = qualificationCriteriaSchema.safeParse(parsed);
  if (!validated.success) {
    throw unprocessable("El documento de criterios no es válido", validated.error.issues);
  }
  return validated.data as QualificationCriteria;
}

export function leadQualificationService(db: Db, deps: LeadQualificationDeps = {}) {
  const now = deps.now ?? (() => new Date());
  const loadCriteria = deps.loadCriteria ?? ((companyId: string) => loadCriteriaFromContext(db, companyId));

  async function criteria(companyId: string): Promise<QualificationCriteria | null> {
    return loadCriteria(companyId);
  }

  async function qualify(
    companyId: string,
    input: LeadQualifyInput,
    actor: LeadQualificationActor,
  ): Promise<LeadQualification & { qualified: boolean; threshold: number }> {
    const current = await criteria(companyId);
    if (!current) throw unprocessable(QUALIFICATION_CRITERIA_MISSING_MESSAGE);

    const known = new Set(current.criteria.map((criterion) => criterion.key));
    const unknown = [...new Set(input.assessments.map((assessment) => assessment.criterion).filter((key) => !known.has(key)))];
    if (unknown.length > 0) {
      throw unprocessable(
        `Criterios desconocidos: ${unknown.join(", ")}. Criterios válidos: ${[...known].join(", ")}`,
        { unknownCriteria: unknown },
      );
    }
    const seen = new Set<string>();
    for (const assessment of input.assessments) {
      if (seen.has(assessment.criterion)) {
        throw unprocessable(`Criterio evaluado más de una vez: ${assessment.criterion}`);
      }
      seen.add(assessment.criterion);
    }

    const byKey = new Map(input.assessments.map((assessment) => [assessment.criterion, assessment]));
    const reasons: LeadQualificationReason[] = current.criteria.map((criterion) => {
      const assessment = byKey.get(criterion.key);
      if (!assessment) {
        return { criterion: criterion.key, met: false, weight: criterion.weight, note: "sin evaluar" };
      }
      return { criterion: criterion.key, met: assessment.met, weight: criterion.weight, note: assessment.note ?? null };
    });

    // Missing or unknown (null) assessments do not add weight: only met === true counts.
    const totalWeight = current.criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
    const metWeight = reasons.reduce((sum, reason) => sum + (reason.met === true ? reason.weight : 0), 0);
    const score = totalWeight > 0 ? Math.round((100 * metWeight) / totalWeight) : 0;

    const [row] = await db
      .insert(leadQualifications)
      .values({
        companyId,
        leadId: input.leadId,
        criteriaVersion: current.version,
        score,
        reasons,
        sources: input.sources ?? [],
        enrichment: input.enrichment ?? null,
        agentId: actor.agentId ?? null,
        runId: actor.runId ?? null,
        createdByUserId: actor.userId ?? null,
        createdAt: now(),
      })
      .returning();

    return { ...(row as LeadQualification), qualified: score >= current.threshold, threshold: current.threshold };
  }

  async function latest(companyId: string, leadId: string): Promise<LeadQualification | null> {
    const [row] = await db
      .select()
      .from(leadQualifications)
      .where(and(eq(leadQualifications.companyId, companyId), eq(leadQualifications.leadId, leadId)))
      .orderBy(desc(leadQualifications.createdAt), desc(leadQualifications.id))
      .limit(1);
    return (row as LeadQualification | undefined) ?? null;
  }

  async function history(companyId: string, leadId: string): Promise<LeadQualification[]> {
    const rows = await db
      .select()
      .from(leadQualifications)
      .where(and(eq(leadQualifications.companyId, companyId), eq(leadQualifications.leadId, leadId)))
      .orderBy(desc(leadQualifications.createdAt), desc(leadQualifications.id));
    return rows as LeadQualification[];
  }

  return { criteria, qualify, latest, history };
}

export type LeadQualificationService = ReturnType<typeof leadQualificationService>;
