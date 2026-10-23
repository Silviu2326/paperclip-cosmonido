import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { connectionGrants, toolApplications, toolConnections } from "@paperclipai/db";

/** Reports stored Firecrawl readiness. The actual scrape uses Tool Gateway from the board UI. */
export function productizationBusinessExtractionService(db: Db) {
  return {
    availability: async (companyId: string) => {
      const rows = await db.select({ id: toolConnections.id, status: toolConnections.status, enabled: toolConnections.enabled, transport: toolConnections.transport, healthStatus: toolConnections.healthStatus, healthCheckedAt: toolConnections.healthCheckedAt })
        .from(toolConnections)
        .innerJoin(toolApplications, and(eq(toolApplications.id, toolConnections.applicationId), eq(toolApplications.companyId, companyId)))
        .where(and(eq(toolConnections.companyId, companyId), eq(toolApplications.applicationKey, "firecrawl")));
      let sawCandidate = false;
      let sawAuthorized = false;
      let lastCandidateId: string | null = null;
      let lastAuthorizedId: string | null = null;
      for (const row of rows) {
        const [grant] = await db.select({ id: connectionGrants.id }).from(connectionGrants)
          .where(and(eq(connectionGrants.companyId, companyId), eq(connectionGrants.connectionId, row.id), eq(connectionGrants.status, "active"))).limit(1);
        if (row.status !== "active" || !row.enabled || row.transport !== "mcp_remote") continue;
        sawCandidate = true;
        lastCandidateId = row.id;
        if (!grant) continue;
        sawAuthorized = true;
        lastAuthorizedId = row.id;
        const freshHealth = row.healthCheckedAt && Date.now() - row.healthCheckedAt.getTime() <= 24 * 60 * 60 * 1000;
        if (freshHealth && (row.healthStatus === "ok" || row.healthStatus === "healthy")) {
          return { status: "ready" as const, canExtract: true as const, connectionId: row.id, reason: "Firecrawl has a recent successful health record and an active grant. Tool Gateway checks the selected agent's authority on every scrape." };
        }
      }
      if (sawAuthorized) return { status: "firecrawl_health_check_required" as const, canExtract: false as const, connectionId: lastAuthorizedId, reason: "Run the existing Apps health check before requesting a provider scrape." };
      if (sawCandidate) return { status: "firecrawl_authorization_required" as const, canExtract: false as const, connectionId: lastCandidateId, reason: "Create an active Firecrawl grant in Apps before requesting extraction." };
      return { status: rows.length ? "firecrawl_reconnect_required" as const : "firecrawl_not_configured" as const, canExtract: false as const, connectionId: rows[0]?.id ?? null, reason: rows.length ? "Reconnect Firecrawl in Apps before requesting extraction." : "Connect Firecrawl in Apps to request URL suggestions." };
    },
  };
}
