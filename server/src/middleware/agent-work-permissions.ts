import type { RequestHandler } from "express";
import { agents, type Db } from "@paperclipai/db";
import { and, eq } from "drizzle-orm";
import { isUuidLike } from "@paperclipai/shared";
import { forbidden } from "../errors.js";
import { assertAgentWorkAccess, assertAgentProfilePolicyUnchanged, workPermissionsForRequest } from "../services/agent-work-permissions.js";

export function agentWorkPermissionsMiddleware(db: Db): RequestHandler {
  return async (req, _res, next) => {
    try {
      if (req.actor.type === "agent") {
        if (!req.actor.agentId || !req.actor.companyId) throw forbidden("Agent identity is required to check work permissions.");
        const target = /^\/agents\/([^/]+)\/?$/.exec(req.path);
        if (target && ["PATCH", "PUT"].includes(req.method) && req.body && Object.hasOwn(req.body, "metadata")) {
          if (!isUuidLike(target[1])) throw forbidden("Only board users may replace agent profile metadata through aliases.");
          const [agent] = await db.select({ metadata: agents.metadata }).from(agents).where(and(eq(agents.id, target[1]), eq(agents.companyId, req.actor.companyId))).limit(1);
          if (agent) assertAgentProfilePolicyUnchanged(agent.metadata, req.body.metadata);
        }
        await assertAgentWorkAccess(db, req.actor.companyId, req.actor.agentId, workPermissionsForRequest(req.method, req.path, req.body, req.actor.agentId));
      }
      next();
    } catch (error) { next(error); }
  };
}
