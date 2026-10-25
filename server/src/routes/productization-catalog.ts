import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { forbidden, unprocessable } from "../errors.js";
import { accessService } from "../services/access.js";
import { portablePackagePreviewService } from "../services/productization/portable-package-preview.js";
import { assertCompanyAccess } from "./authz.js";

const MAX_PACKAGE_BYTES = 1_048_576;

/** Factory for the future, company-scoped productization catalog preview route. */
export function productizationCatalogRoutes(db: Db) {
  const router = Router();
  const access = accessService(db);
  const preview = portablePackagePreviewService(db);

  router.post("/companies/:companyId/productization/catalog/preview", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const decision = await access.decide({
      actor: req.actor,
      action: "agents:create",
      resource: { type: "company", companyId },
    });
    if (!decision.allowed) throw forbidden(decision.explanation);

    let payloadSize: number;
    try {
      payloadSize = Buffer.byteLength(JSON.stringify(req.body), "utf8");
    } catch {
      throw unprocessable("Portable package request must be JSON.");
    }
    if (payloadSize > MAX_PACKAGE_BYTES) {
      throw unprocessable("Portable package exceeds the 1 MiB preview limit.", {
        code: "portable_package_too_large",
        maxBytes: MAX_PACKAGE_BYTES,
      });
    }

    res.json(await preview.preview(companyId, req.body));
  });

  return router;
}
