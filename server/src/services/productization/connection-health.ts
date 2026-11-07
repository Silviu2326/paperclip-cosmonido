import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { connectionGrants, toolApplications, toolConnections } from "@paperclipai/db";

export type ProductConnectionStage = "available" | "connected" | "authorized" | "checked";

/** Projects only provider records already stored by the Apps system. It never writes or probes providers. */
export function productizationConnectionHealthService(db: Db) {
  return {
    list: async (companyId: string) => {
      const rows = await db.select({
        id: toolConnections.id,
        name: toolConnections.name,
        status: toolConnections.status,
        enabled: toolConnections.enabled,
        healthStatus: toolConnections.healthStatus,
        healthCheckedAt: toolConnections.healthCheckedAt,
        applicationKey: toolApplications.applicationKey,
        applicationName: toolApplications.name,
      }).from(toolConnections)
        .innerJoin(toolApplications, and(eq(toolApplications.id, toolConnections.applicationId), eq(toolApplications.companyId, companyId)))
        .where(eq(toolConnections.companyId, companyId));
      const activeGrants = rows.length ? await db.select({ connectionId: connectionGrants.connectionId }).from(connectionGrants)
        .where(and(eq(connectionGrants.companyId, companyId), eq(connectionGrants.status, "active"), inArray(connectionGrants.connectionId, rows.map((row) => row.id)))) : [];
      const authorizedIds = new Set(activeGrants.map((grant) => grant.connectionId));
      const now = Date.now();
      const results = [];
      for (const row of rows) {
        const active = row.status === "active" && row.enabled;
        const hasGrant = authorizedIds.has(row.id);
        const healthIsRecent = Boolean(row.healthCheckedAt && now - row.healthCheckedAt.getTime() <= 24 * 60 * 60 * 1000);
        const checked = active && hasGrant && (row.healthStatus === "ok" || row.healthStatus === "healthy") && healthIsRecent;
        const stage: ProductConnectionStage = checked ? "checked" : hasGrant && active ? "authorized" : active ? "connected" : "available";
        results.push({
          id: row.id,
          applicationKey: row.applicationKey,
          applicationName: row.applicationName,
          name: row.name,
          stage,
          healthStatus: row.healthStatus,
          checkedAt: row.healthCheckedAt?.toISOString() ?? null,
          reconnectPath: `/apps/${encodeURIComponent(row.id)}/permissions`,
          evidence: row.healthCheckedAt && healthIsRecent && (row.healthStatus === "ok" || row.healthStatus === "healthy") ? "stored_provider_health_check" as const : null,
        });
      }
      return results;
    },
  };
}
