import { Router, type Request } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { portablePackageStatusActionSchema } from "@paperclipai/shared/productization/portable-package";
import { badRequest, forbidden, unprocessable } from "../errors.js";
import { accessService } from "../services/access.js";
import { logActivity } from "../services/activity-log.js";
import {
  packageInstallationService,
  portablePackageCatalogService,
} from "../services/productization/package-installation.js";
import { portablePackagePreviewService } from "../services/productization/portable-package-preview.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";

const MAX_PACKAGE_BYTES = 1_048_576;
const uuidSchema = z.string().uuid();

function assertJsonSize(body: unknown, message: string) {
  let payloadSize: number;
  try {
    payloadSize = Buffer.byteLength(JSON.stringify(body), "utf8");
  } catch {
    throw unprocessable("Portable package request must be JSON.");
  }
  if (payloadSize > MAX_PACKAGE_BYTES) {
    throw unprocessable(message, { code: "portable_package_too_large", maxBytes: MAX_PACKAGE_BYTES });
  }
}

function paramId(req: Request, name: string): string {
  const parsed = uuidSchema.safeParse(req.params[name]);
  if (!parsed.success) throw badRequest(`Invalid ${name}`);
  return parsed.data;
}

/**
 * Company-scoped portable-package catalog: preview, versioned private packages,
 * explicit review/publish, and durable installation receipts.
 *
 * Authority model: every endpoint is board-only and company-scoped. Mutations
 * additionally require the existing `agents:create` decision. Hiring itself is
 * never performed here: `claim` returns the exact body (plus a stable item-specific
 * idempotency key) for the existing `/agent-hires` endpoint, which keeps the approval gate and
 * adapter checks. A claimed agent item is never released or re-sent; `cancel` only applies to
 * items that were never claimed.
 *
 * Resources are the opposite case by design: `install` creates a draft row through the existing domain
 * service under a unique identity, so it is resumable and idempotent. It never publishes, sends, connects
 * or grants autonomy; the installed draft still needs the domain's own publish step by a person.
 */
export function productizationCatalogRoutes(db: Db) {
  const router = Router();
  const access = accessService(db);
  const preview = portablePackagePreviewService(db);
  const catalog = portablePackageCatalogService(db);
  const installations = packageInstallationService(db);
  const base = "/companies/:companyId/productization/catalog";

  async function authorize(req: Request, options: { mutate: boolean }) {
    const companyId = req.params.companyId as string;
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    if (options.mutate) {
      const decision = await access.decide({
        actor: req.actor,
        action: "agents:create",
        resource: { type: "company", companyId },
      });
      if (!decision.allowed) throw forbidden(decision.explanation);
    }
    return companyId;
  }

  async function audit(req: Request, companyId: string, action: string, entityType: string, entityId: string, details: Record<string, unknown> = {}) {
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      agentApiKeyId: actor.agentApiKeyId,
      action,
      entityType,
      entityId,
      details,
    });
  }

  const userIdOf = (req: Request) => (req.actor.type === "board" ? req.actor.userId ?? null : null);

  router.post(`${base}/preview`, async (req, res) => {
    // Board-only like every other catalog endpoint (an agent actor must not reach the previewer).
    const companyId = await authorize(req, { mutate: true });
    assertJsonSize(req.body, "Portable package exceeds the 1 MiB preview limit.");
    res.json(await preview.preview(companyId, req.body));
  });

  /* ---- Versioned private packages ------------------------------------- */

  router.get(`${base}/packages`, async (req, res) => {
    const companyId = await authorize(req, { mutate: false });
    res.json(await catalog.list(companyId));
  });

  router.post(`${base}/packages`, async (req, res) => {
    const companyId = await authorize(req, { mutate: true });
    assertJsonSize(req.body, "Portable package exceeds the 1 MiB limit.");
    const created = await catalog.createDraft(companyId, req.body, userIdOf(req));
    await audit(req, companyId, "productization.package_draft_created", "portable_package", created.id, {
      packageKey: created.packageKey, packageVersion: created.packageVersion,
    });
    res.status(201).json(created);
  });

  router.get(`${base}/packages/:packageId`, async (req, res) => {
    const companyId = await authorize(req, { mutate: false });
    res.json(await catalog.get(companyId, paramId(req, "packageId")));
  });

  router.put(`${base}/packages/:packageId`, async (req, res) => {
    const companyId = await authorize(req, { mutate: true });
    assertJsonSize(req.body, "Portable package exceeds the 1 MiB limit.");
    const id = paramId(req, "packageId");
    const updated = await catalog.updateDraft(companyId, id, req.body);
    await audit(req, companyId, "productization.package_draft_updated", "portable_package", id, {
      packageKey: updated.packageKey, packageVersion: updated.packageVersion,
    });
    res.json(updated);
  });

  router.delete(`${base}/packages/:packageId`, async (req, res) => {
    const companyId = await authorize(req, { mutate: true });
    const id = paramId(req, "packageId");
    await catalog.deleteDraft(companyId, id);
    await audit(req, companyId, "productization.package_draft_deleted", "portable_package", id);
    res.status(204).end();
  });

  router.post(`${base}/packages/:packageId/request-review`, async (req, res) => {
    const companyId = await authorize(req, { mutate: true });
    const id = paramId(req, "packageId");
    const result = await catalog.requestReview(companyId, id);
    await audit(req, companyId, "productization.package_review_requested", "portable_package", id);
    res.json(result);
  });

  router.post(`${base}/packages/:packageId/return-to-draft`, async (req, res) => {
    const companyId = await authorize(req, { mutate: true });
    const id = paramId(req, "packageId");
    const result = await catalog.returnToDraft(companyId, id);
    await audit(req, companyId, "productization.package_returned_to_draft", "portable_package", id);
    res.json(result);
  });

  router.post(`${base}/packages/:packageId/publish`, async (req, res) => {
    const companyId = await authorize(req, { mutate: true });
    const id = paramId(req, "packageId");
    const body = portablePackageStatusActionSchema.safeParse(req.body ?? {});
    if (!body.success) {
      throw unprocessable("Publishing requires the reviewer's privacy attestation.", { code: "portable_package_attestation_required" });
    }
    const result = await catalog.publish(companyId, id, userIdOf(req));
    await audit(req, companyId, "productization.package_published", "portable_package", id, {
      packageKey: result.packageKey, packageVersion: result.packageVersion, contentHash: result.contentHash,
    });
    res.json(result);
  });

  router.post(`${base}/packages/:packageId/withdraw`, async (req, res) => {
    const companyId = await authorize(req, { mutate: true });
    const id = paramId(req, "packageId");
    const result = await catalog.withdraw(companyId, id);
    await audit(req, companyId, "productization.package_withdrawn", "portable_package", id);
    res.json(result);
  });

  router.get(`${base}/packages/:packageId/export`, async (req, res) => {
    const companyId = await authorize(req, { mutate: false });
    const id = paramId(req, "packageId");
    const result = await catalog.exportPublished(companyId, id);
    await audit(req, companyId, "productization.package_exported", "portable_package", id, { contentHash: result.contentHash });
    res.json(result);
  });

  /* ---- Installation receipts ------------------------------------------ */

  router.get(`${base}/packages/:packageId/install-plan`, async (req, res) => {
    const companyId = await authorize(req, { mutate: false });
    res.json(await installations.plan(companyId, paramId(req, "packageId")));
  });

  router.post(`${base}/packages/:packageId/installations`, async (req, res) => {
    const companyId = await authorize(req, { mutate: true });
    const id = paramId(req, "packageId");
    const result = await installations.createInstallation(companyId, id, req.body, userIdOf(req));
    if (!result.reused) {
      await audit(req, companyId, "productization.package_installation_planned", "package_installation", result.installation.id, {
        packageId: id, items: result.installation.items.length,
      });
    }
    res.status(result.reused ? 200 : 201).json(result);
  });

  router.get(`${base}/installations`, async (req, res) => {
    const companyId = await authorize(req, { mutate: false });
    res.json(await installations.listInstallations(companyId));
  });

  router.get(`${base}/installations/:installationId`, async (req, res) => {
    const companyId = await authorize(req, { mutate: false });
    res.json(await installations.getInstallation(companyId, paramId(req, "installationId")));
  });

  router.delete(`${base}/installations/:installationId`, async (req, res) => {
    const companyId = await authorize(req, { mutate: true });
    const id = paramId(req, "installationId");
    await installations.discardInstallation(companyId, id);
    await audit(req, companyId, "productization.package_installation_discarded", "package_installation", id);
    res.status(204).end();
  });

  router.post(`${base}/installations/:installationId/items/:itemId/claim`, async (req, res) => {
    const companyId = await authorize(req, { mutate: true });
    const installationId = paramId(req, "installationId");
    const itemId = paramId(req, "itemId");
    const result = await installations.claimItem(companyId, installationId, itemId, userIdOf(req));
    await audit(req, companyId, "productization.package_item_claimed", "package_installation", installationId, { itemId });
    res.json(result);
  });

  // Resource items (playbook, lead form, brand preset, request template) are created by the server as drafts.
  // Repeating this call is safe: the write is keyed by a unique identity and can only link the same row.
  router.post(`${base}/installations/:installationId/items/:itemId/install`, async (req, res) => {
    const companyId = await authorize(req, { mutate: true });
    const installationId = paramId(req, "installationId");
    const itemId = paramId(req, "itemId");
    const result = await installations.installResource(companyId, installationId, itemId, userIdOf(req));
    await audit(req, companyId, "productization.package_resource_installed", "package_installation", installationId, {
      itemId,
      kind: result.item.kind,
      outcome: result.outcome,
      status: result.item.status,
      resourceId: result.item.resourceId,
    });
    res.json(result);
  });

  router.post(`${base}/installations/:installationId/items/:itemId/reconcile`, async (req, res) => {
    const companyId = await authorize(req, { mutate: true });
    const installationId = paramId(req, "installationId");
    const itemId = paramId(req, "itemId");
    const result = await installations.reconcileItem(companyId, installationId, itemId);
    await audit(req, companyId, "productization.package_item_reconciled", "package_installation", installationId, {
      itemId, found: result.found, status: result.item.status,
    });
    res.json(result);
  });

  // Replaces the removed `release`: only an item that was never claimed can be cancelled.
  router.post(`${base}/installations/:installationId/items/:itemId/cancel`, async (req, res) => {
    const companyId = await authorize(req, { mutate: true });
    const installationId = paramId(req, "installationId");
    const itemId = paramId(req, "itemId");
    const result = await installations.cancelItem(companyId, installationId, itemId);
    await audit(req, companyId, "productization.package_item_cancelled", "package_installation", installationId, { itemId });
    res.json(result);
  });

  return router;
}
