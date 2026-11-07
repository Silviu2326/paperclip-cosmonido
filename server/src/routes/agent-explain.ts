import { Router } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { agentExplainService } from "../services/agent-explain.js";
import { assertCompanyAccess } from "./authz.js";

const explainQuerySchema = z.object({
  kind: z.enum(["decision", "run", "tool_action", "proposal", "playbook_run"]),
});

/** Sprint 3 WP12: read-only "Por qué hizo esto" explanation. Board and agents of the company may read. */
export function agentExplainRoutes(db: Db) {
  const router = Router();
  const svc = agentExplainService(db);

  router.get("/companies/:companyId/agent-actions/:actionId/explain", async (req, res) => {
    const companyId = req.params.companyId as string;
    const actionId = req.params.actionId as string;
    assertCompanyAccess(req, companyId);
    const parsed = explainQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query: kind must be one of decision, run, tool_action, proposal, playbook_run", details: parsed.error.issues });
      return;
    }
    const explanation = await svc.explain(companyId, parsed.data.kind, actionId);
    res.json(explanation);
  });

  return router;
}
