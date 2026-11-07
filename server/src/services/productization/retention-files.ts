import { and, asc, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { assets, companyFiles, companyFileVersions, companyRetention, retentionSweeps } from "@paperclipai/db";
import type { StorageService } from "../../storage/types.js";
import type { RetentionFileAdapter } from "./security.js";

const MAX_VERSIONS_PER_FILE = 5;
const MAX_FILES_PER_TICK = 5;
const FILE_OPERATION_LEASE_MS = 5 * 60_000;

type CandidateAsset = { id: string; provider: string; objectKey: string; byteSize: number };

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

/**
 * Retention only purges old soft-deleted company-file records. The persisted
 * started marker makes restore impossible before storage I/O; retries repeat
 * idempotent company-scoped deletes, and metadata is removed only after all
 * object deletes have been acknowledged.
 */
export function createCompanyFileRetentionAdapter(db: Db, storage: StorageService): RetentionFileAdapter {
  async function externallyReferenced(executor: Pick<Db, "execute">, assetIds: string[], fileId: string): Promise<boolean> {
    if (!assetIds.length) return false;
    const assetIdArray = sql`array[${sql.join(assetIds.map((id) => sql`${id}::uuid`), sql`, `)}]`;
    const rows = rowsOf<{ protected: boolean }>(await executor.execute(sql`
      select exists (
        select 1 from case_attachments where asset_id = any(${assetIdArray})
        union all select 1 from issue_attachments where asset_id = any(${assetIdArray})
        union all select 1 from company_logos where asset_id = any(${assetIdArray})
        union all select 1 from media_projects where source_asset_id = any(${assetIdArray})
        union all select 1 from media_jobs where output_asset_id = any(${assetIdArray})
        union all select 1 from customer_portal_files where asset_id = any(${assetIdArray})
        union all select 1 from runner_api_response_reservations where asset_id = any(${assetIdArray})
        union all select 1 from productization_agency_brands where logo_asset_id = any(${assetIdArray})
        union all select 1 from company_file_versions where asset_id = any(${assetIdArray})
          and file_id <> ${fileId}::uuid
      ) as protected
    `));
    return rows[0]?.protected === true;
  }

  async function preview(companyId: string, cutoff: Date) {
    const rows = rowsOf<{ files: number; versions: number; bytes: number }>(await db.execute(sql`
      select count(*)::int as files, coalesce(sum(eligible.versions), 0)::int as versions,
        coalesce(sum(eligible.bytes), 0)::bigint as bytes
      from (
        select f.id, count(v.id)::int as versions, coalesce(sum(a.byte_size), 0)::bigint as bytes
        from company_files f
        left join company_file_versions v on v.file_id = f.id and v.company_id = f.company_id
        left join assets a on a.id = v.asset_id and a.company_id = f.company_id
        where f.company_id = ${companyId}::uuid and f.deleted_at < ${cutoff.toISOString()}::timestamptz and f.retention_purged_at is null
        group by f.id
        having count(v.id) <= ${MAX_VERSIONS_PER_FILE} and count(a.id) = count(v.id)
          and not exists (
            select 1 from company_file_versions v2 join assets a2 on a2.id = v2.asset_id
            where v2.file_id = f.id and (
              exists (select 1 from case_attachments x where x.asset_id = a2.id)
              or exists (select 1 from issue_attachments x where x.asset_id = a2.id)
              or exists (select 1 from company_logos x where x.asset_id = a2.id)
              or exists (select 1 from media_projects x where x.source_asset_id = a2.id)
              or exists (select 1 from media_jobs x where x.output_asset_id = a2.id)
              or exists (select 1 from customer_portal_files x where x.asset_id = a2.id)
              or exists (select 1 from runner_api_response_reservations x where x.asset_id = a2.id)
              or exists (select 1 from productization_agency_brands x where x.logo_asset_id = a2.id)
              or exists (select 1 from company_file_versions other where other.asset_id = a2.id and other.file_id <> f.id)
            )
          )
      ) eligible
    `));
    return { files: Number(rows[0]?.files ?? 0), versions: Number(rows[0]?.versions ?? 0), bytes: Number(rows[0]?.bytes ?? 0) };
  }

  async function purgeBatch(companyId: string, cutoff: Date, afterId: string | null, limit: number, fence?: { sweepId: string; leaseOwner: string; policyRevision: number }) {
    const boundedLimit = Math.max(1, Math.min(MAX_FILES_PER_TICK, Math.floor(limit)));
    const candidates = await db.select({ id: companyFiles.id }).from(companyFiles).where(and(
      eq(companyFiles.companyId, companyId), lt(companyFiles.deletedAt, cutoff), isNull(companyFiles.retentionPurgedAt),
      afterId ? gt(companyFiles.id, afterId) : sql`true`,
    )).orderBy(asc(companyFiles.id)).limit(boundedLimit);
    if (!candidates.length) return { afterId, processed: 0, deleted: 0, versions: 0, bytes: 0, protectedSkipped: 0, done: true };

    let deleted = 0;
    let versionsPurged = 0;
    let bytesPurged = 0;
    let protectedSkipped = 0;
    for (const candidate of candidates) {
      const prepared = await db.transaction(async (tx) => {
        if (fence) {
          const [owned] = await tx.select({ id: retentionSweeps.id }).from(retentionSweeps).where(and(
            eq(retentionSweeps.id, fence.sweepId), eq(retentionSweeps.companyId, companyId), eq(retentionSweeps.leaseOwner, fence.leaseOwner),
            eq(retentionSweeps.policyRevision, fence.policyRevision), eq(retentionSweeps.status, "running"), sql`${retentionSweeps.leaseExpiresAt} > now()`,
          )).for("update").limit(1);
          const [policy] = await tx.select({ revision: companyRetention.revision }).from(companyRetention).where(and(
            eq(companyRetention.companyId, companyId), eq(companyRetention.revision, fence.policyRevision), eq(companyRetention.filesEnabled, true),
          )).for("share").limit(1);
          if (!owned || !policy) return "fence_lost" as const;
          await tx.update(retentionSweeps).set({ leaseExpiresAt: new Date(Date.now() + FILE_OPERATION_LEASE_MS), updatedAt: new Date() })
            .where(eq(retentionSweeps.id, fence.sweepId));
        }
        const [file] = await tx.select({ id: companyFiles.id, startedAt: companyFiles.retentionPurgeStartedAt, purgedAt: companyFiles.retentionPurgedAt })
          .from(companyFiles).where(and(eq(companyFiles.id, candidate.id), eq(companyFiles.companyId, companyId), lt(companyFiles.deletedAt, cutoff), isNull(companyFiles.retentionPurgedAt))).for("update").limit(1);
        if (!file) return "skip" as const;
        if (!file.startedAt) {
          const markerAt = new Date();
          await tx.update(companyFiles).set({ retentionPurgeStartedAt: markerAt, updatedAt: markerAt }).where(eq(companyFiles.id, file.id));
          return { kind: "ready" as const, startedHere: true, markerAt };
        }
        return { kind: "ready" as const, startedHere: false, markerAt: file.startedAt };
      });
      if (prepared === "fence_lost") return { afterId, processed: 0, deleted, versions: versionsPurged, bytes: bytesPurged, protectedSkipped, done: false };
      if (prepared === "skip") continue;

      const outcome = await db.transaction(async (tx) => {
        if (fence) {
          const [owned] = await tx.select({ id: retentionSweeps.id }).from(retentionSweeps).where(and(
            eq(retentionSweeps.id, fence.sweepId), eq(retentionSweeps.companyId, companyId), eq(retentionSweeps.leaseOwner, fence.leaseOwner),
            eq(retentionSweeps.policyRevision, fence.policyRevision), eq(retentionSweeps.status, "running"), sql`${retentionSweeps.leaseExpiresAt} > now()`,
          )).for("update").limit(1);
          const [policy] = await tx.select({ revision: companyRetention.revision }).from(companyRetention).where(and(
            eq(companyRetention.companyId, companyId), eq(companyRetention.revision, fence.policyRevision), eq(companyRetention.filesEnabled, true),
          )).for("share").limit(1);
          if (!owned || !policy) return { kind: "fence_lost" as const };
        }
        const [file] = await tx.select({ id: companyFiles.id, currentVersionId: companyFiles.currentVersionId })
          .from(companyFiles).where(and(eq(companyFiles.id, candidate.id), eq(companyFiles.companyId, companyId), lt(companyFiles.deletedAt, cutoff), isNull(companyFiles.retentionPurgedAt), sql`${companyFiles.retentionPurgeStartedAt} is not null`)).for("update").limit(1);
        if (!file) return { kind: "skipped" as const };
        const versions = await tx.select({ id: companyFileVersions.id, assetId: companyFileVersions.assetId, versionNumber: companyFileVersions.versionNumber })
          .from(companyFileVersions).where(and(eq(companyFileVersions.fileId, file.id), eq(companyFileVersions.companyId, companyId))).orderBy(asc(companyFileVersions.versionNumber));
        if (versions.length > MAX_VERSIONS_PER_FILE) {
          if (prepared.startedHere) await tx.update(companyFiles).set({ retentionPurgeStartedAt: null }).where(and(eq(companyFiles.id, file.id), eq(companyFiles.retentionPurgeStartedAt, prepared.markerAt)));
          return { kind: "protected" as const };
        }
        const assetIds = [...new Set(versions.map((version) => version.assetId))];
        const assetRows: CandidateAsset[] = assetIds.length ? await tx.select({ id: assets.id, provider: assets.provider, objectKey: assets.objectKey, byteSize: assets.byteSize })
          .from(assets).where(and(eq(assets.companyId, companyId), inArray(assets.id, assetIds))).for("update") : [];
        if (assetRows.length !== assetIds.length || await externallyReferenced(tx, assetIds, file.id)) {
          if (prepared.startedHere) await tx.update(companyFiles).set({ retentionPurgeStartedAt: null }).where(and(eq(companyFiles.id, file.id), eq(companyFiles.retentionPurgeStartedAt, prepared.markerAt)));
          return { kind: "protected" as const };
        }

        // External objects are deleted while the asset rows are locked so FK
        // references cannot appear between the safety check and metadata purge.
        for (const asset of assetRows) {
          if (asset.provider !== storage.provider) throw new Error("retention_storage_provider_mismatch");
          await storage.deleteObject(companyId, asset.objectKey);
        }
        if (fence) {
          const [stillOwned] = await tx.select({ id: retentionSweeps.id }).from(retentionSweeps).where(and(
            eq(retentionSweeps.id, fence.sweepId), eq(retentionSweeps.leaseOwner, fence.leaseOwner),
            eq(retentionSweeps.policyRevision, fence.policyRevision), eq(retentionSweeps.status, "running"),
            sql`${retentionSweeps.leaseExpiresAt} > now()`,
          )).limit(1);
          if (!stillOwned) throw new Error("retention_lease_lost_after_storage_io");
        }
        if (versions.length) await tx.delete(companyFileVersions).where(and(eq(companyFileVersions.fileId, file.id), eq(companyFileVersions.companyId, companyId)));
        if (assetIds.length) await tx.delete(assets).where(and(eq(assets.companyId, companyId), inArray(assets.id, assetIds)));
        await tx.update(companyFiles).set({ currentVersionId: null, byteSize: 0, retentionPurgedAt: new Date(), updatedAt: new Date() })
          .where(and(eq(companyFiles.id, file.id), eq(companyFiles.companyId, companyId), isNull(companyFiles.retentionPurgedAt)));
        return { kind: "deleted" as const, versions: versions.length, bytes: assetRows.reduce((sum, asset) => sum + Number(asset.byteSize), 0) };
      });
      if (outcome.kind === "fence_lost") {
        if (prepared.startedHere) await db.update(companyFiles).set({ retentionPurgeStartedAt: null }).where(and(eq(companyFiles.id, candidate.id), eq(companyFiles.companyId, companyId), eq(companyFiles.retentionPurgeStartedAt, prepared.markerAt)));
        return { afterId, processed: 0, deleted, versions: versionsPurged, bytes: bytesPurged, protectedSkipped, done: false };
      }
      if (outcome.kind === "deleted") {
        deleted += 1;
        versionsPurged += outcome.versions;
        bytesPurged += outcome.bytes;
      } else if (outcome.kind === "protected") {
        // Permanently skip protected references for this sweep by advancing the
        // keyset cursor; a future preview/sweep may reconsider the file.
        protectedSkipped += 1;
      }
    }
    const after = candidates.at(-1)!.id;
    const [next] = await db.select({ id: companyFiles.id }).from(companyFiles).where(and(
      eq(companyFiles.companyId, companyId), lt(companyFiles.deletedAt, cutoff), isNull(companyFiles.retentionPurgedAt), gt(companyFiles.id, after),
    )).orderBy(asc(companyFiles.id)).limit(1);
    return { afterId: after, processed: candidates.length, deleted, versions: versionsPurged, bytes: bytesPurged, protectedSkipped, done: !next };
  }

  return { preview, purgeBatch };
}
