import { Router, type Request, type Response } from "express";
import type { Db } from "@paperclipai/db";
import {
  updateArtifactResourceMembershipSchema,
  updateCompanyFileResourceMembershipSchema,
  updateDocumentResourceMembershipSchema,
  updateResourceMembershipSchema,
  type ArtifactMembershipSource,
  type ResourceMembershipResourceType,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { badRequest, notFound } from "../errors.js";
import { getActorInfo } from "./authz.js";
import { logActivity, resourceMembershipService } from "../services/index.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireBoardUserId(req: Request, res: Response): string | null {
  if (req.actor.type !== "board" || !req.actor.userId) {
    res.status(403).json({ error: "Board user access required" });
    return null;
  }
  return req.actor.userId;
}

async function logMembershipChange(
  db: Db,
  req: Request,
  input: {
    companyId: string;
    userId: string;
    resourceType: ResourceMembershipResourceType;
    resourceId: string;
    state: "joined" | "left";
    starredAt: Date | null;
    changeKind: "joined" | "left" | "starred" | "unstarred";
    policySource: string;
  },
) {
  const actor = getActorInfo(req);
  await logActivity(db, {
    companyId: input.companyId,
    actorType: actor.actorType,
    actorId: actor.actorId,
    agentId: actor.agentId,
    runId: actor.runId,
    agentApiKeyId: actor.agentApiKeyId,
    action: `resource_membership.${input.changeKind}`,
    entityType: input.resourceType,
    entityId: input.resourceId,
    details: {
      userId: input.userId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      state: input.state,
      starredAt: input.starredAt,
      starred: input.starredAt !== null,
      policySource: input.policySource,
    },
  });
}

export function resourceMembershipRoutes(db: Db) {
  const router = Router();
  const svc = resourceMembershipService(db);

  router.get("/companies/:companyId/resource-memberships/me", async (req, res) => {
    const companyId = req.params.companyId as string;
    const userId = requireBoardUserId(req, res);
    if (!userId) return;
    res.json(await svc.listForUser(companyId, userId, req.actor));
  });

  router.put(
    "/companies/:companyId/resource-memberships/me/projects/:projectId",
    validate(updateResourceMembershipSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const projectId = req.params.projectId as string;
      const userId = requireBoardUserId(req, res);
      if (!userId) return;
      const result = await svc.updateProject({
        companyId,
        projectId,
        userId,
        state: req.body.state,
        starred: req.body.starred,
        actor: req.actor,
      });
      if (result.changed && result.changeKind) {
        await logMembershipChange(db, req, {
          companyId,
          userId,
          resourceType: "project",
          resourceId: projectId,
          state: result.state,
          starredAt: result.starredAt,
          changeKind: result.changeKind,
          policySource: result.policySource,
        });
      }
      const { changed: _changed, changeKind: _changeKind, policySource: _policySource, ...response } = result;
      res.json(response);
    },
  );

  router.put(
    "/companies/:companyId/resource-memberships/me/agents/:agentId",
    validate(updateResourceMembershipSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const agentId = req.params.agentId as string;
      const userId = requireBoardUserId(req, res);
      if (!userId) return;
      const result = await svc.updateAgent({
        companyId,
        agentId,
        userId,
        state: req.body.state,
        starred: req.body.starred,
        actor: req.actor,
      });
      if (result.changed && result.changeKind) {
        await logMembershipChange(db, req, {
          companyId,
          userId,
          resourceType: "agent",
          resourceId: agentId,
          state: result.state,
          starredAt: result.starredAt,
          changeKind: result.changeKind,
          policySource: result.policySource,
        });
      }
      const { changed: _changed, changeKind: _changeKind, policySource: _policySource, ...response } = result;
      res.json(response);
    },
  );

  router.put(
    "/companies/:companyId/resource-memberships/me/documents/:documentId",
    validate(updateDocumentResourceMembershipSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const documentId = req.params.documentId as string;
      const userId = requireBoardUserId(req, res);
      if (!userId) return;
      const result = await svc.updateDocument({
        companyId,
        documentId,
        userId,
        starred: req.body.starred,
        actor: req.actor,
      });
      if (result.changed && result.changeKind) {
        await logMembershipChange(db, req, {
          companyId,
          userId,
          resourceType: "document",
          resourceId: documentId,
          state: result.state,
          starredAt: result.starredAt,
          changeKind: result.changeKind,
          policySource: result.policySource,
        });
      }
      const { changed: _changed, changeKind: _changeKind, policySource: _policySource, ...response } = result;
      res.json(response);
    },
  );

  router.put(
    "/companies/:companyId/resource-memberships/me/company-files/:companyFileId",
    validate(updateCompanyFileResourceMembershipSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const companyFileId = req.params.companyFileId as string;
      const userId = requireBoardUserId(req, res);
      if (!userId) return;
      if (!UUID_PATTERN.test(companyFileId)) throw notFound("File not found");
      const result = await svc.updateCompanyFile({
        companyId,
        companyFileId,
        userId,
        starred: req.body.starred,
        actor: req.actor,
      });
      if (result.changed && result.changeKind) {
        await logMembershipChange(db, req, {
          companyId,
          userId,
          resourceType: "company_file",
          resourceId: companyFileId,
          state: result.state,
          starredAt: result.starredAt,
          changeKind: result.changeKind,
          policySource: result.policySource,
        });
      }
      const { changed: _changed, changeKind: _changeKind, policySource: _policySource, ...response } = result;
      res.json(response);
    },
  );

  router.put(
    "/companies/:companyId/resource-memberships/me/artifacts/:source/:artifactId",
    validate(updateArtifactResourceMembershipSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const source = req.params.source as string;
      const artifactId = req.params.artifactId as string;
      const userId = requireBoardUserId(req, res);
      if (!userId) return;
      if (source !== "attachment" && source !== "work_product") {
        throw badRequest("source must be attachment or work_product");
      }
      if (!UUID_PATTERN.test(artifactId)) {
        throw notFound(source === "attachment" ? "Attachment not found" : "Work product not found");
      }
      const result = await svc.updateArtifact({
        companyId,
        source: source as ArtifactMembershipSource,
        artifactId,
        userId,
        starred: req.body.starred,
        actor: req.actor,
      });
      if (result.changed && result.changeKind) {
        await logMembershipChange(db, req, {
          companyId,
          userId,
          resourceType: "artifact",
          resourceId: result.resourceId,
          state: result.state,
          starredAt: result.starredAt,
          changeKind: result.changeKind,
          policySource: result.policySource,
        });
      }
      const { changed: _changed, changeKind: _changeKind, policySource: _policySource, ...response } = result;
      res.json(response);
    },
  );

  return router;
}
