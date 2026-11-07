import { Router, type Request, type Response, type NextFunction } from "express";
import { ZodError, type ZodSchema } from "zod";
import type { Db } from "@paperclipai/db";
import {
  acceptProposalPublicSchema,
  createProposalSchema,
  proposalListQuerySchema,
  rejectProposalPublicSchema,
  reviseProposalSchema,
  sendProposalSchema,
  type PublicProposalView,
} from "@paperclipai/shared";
import { proposalService, type ProposalServiceDeps } from "../services/proposals.js";
import { logActivity } from "../services/activity-log.js";
import { assertBoardOrAgent, assertCompanyAccess, getAccessibleResource, getActorInfo } from "./authz.js";
import { HttpError, unprocessable } from "../errors.js";

/** Sprint 3 WP8: authenticated proposal routes and the unauthenticated public signing and Stripe webhook routes. */

function validateBody(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body ?? {});
      next();
    } catch (error) {
      if (error instanceof ZodError) return next(unprocessable("Validation error", error.issues));
      next(error);
    }
  };
}

function actorFields(req: Request) {
  const actor = getActorInfo(req);
  return {
    actor: { agentId: actor.agentId, userId: actor.actorType === "user" ? actor.actorId : null },
    logged: {
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      agentApiKeyId: actor.agentApiKeyId,
    },
  };
}

export function proposalRoutes(db: Db, deps: ProposalServiceDeps = {}) {
  const router = Router();
  const svc = proposalService(db, deps);

  router.get("/companies/:companyId/proposals/page", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const parsed = proposalListQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(422).json({ error: "Validation error", details: parsed.error.issues });
    res.json(await svc.listPage(companyId, parsed.data));
  });

  router.get("/companies/:companyId/proposals", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    let query;
    try {
      query = proposalListQuerySchema.parse(req.query);
    } catch (error) {
      if (error instanceof ZodError) return res.status(422).json({ error: "Validation error", details: error.issues });
      throw error;
    }
    res.json(await svc.list(companyId, query));
  });

  router.post("/companies/:companyId/proposals", validateBody(createProposalSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { actor, logged } = actorFields(req);
    const proposal = await svc.createFromOpportunity(companyId, req.body, actor);
    await logActivity(db, {
      ...logged,
      companyId,
      action: "proposal.created",
      entityType: "proposal",
      entityId: proposal.id,
      details: { proposalKey: proposal.proposalKey, revision: proposal.revision, title: proposal.title },
    });
    res.status(201).json(proposal);
  });

  router.get("/proposals/:id", async (req, res) => {
    const proposal = await getAccessibleResource(req, res, svc.getById(req.params.id as string), "Proposal not found");
    if (proposal) res.json(proposal);
  });

  router.get("/proposals/:id/revisions", async (req, res) => {
    const proposal = await getAccessibleResource(req, res, svc.getById(req.params.id as string), "Proposal not found");
    if (!proposal) return;
    res.json(await svc.listRevisions(proposal.companyId, proposal.proposalKey));
  });

  router.post("/proposals/:id/revise", validateBody(reviseProposalSchema), async (req, res) => {
    assertBoardOrAgent(req);
    const existing = await getAccessibleResource(req, res, svc.getById(req.params.id as string), "Proposal not found");
    if (!existing) return;
    const { actor, logged } = actorFields(req);
    const proposal = await svc.revise(existing.id, req.body, actor);
    await logActivity(db, {
      ...logged,
      companyId: existing.companyId,
      action: "proposal.revised",
      entityType: "proposal",
      entityId: proposal.id,
      details: { proposalKey: proposal.proposalKey, revision: proposal.revision, previousProposalId: existing.id },
    });
    res.json(proposal);
  });

  router.post("/proposals/:id/send", validateBody(sendProposalSchema), async (req, res) => {
    const existing = await getAccessibleResource(req, res, svc.getById(req.params.id as string), "Proposal not found");
    if (!existing) return;
    const { actor, logged } = actorFields(req);
    const result = await svc.send(existing.id, req.body, actor);
    await logActivity(db, {
      ...logged,
      companyId: existing.companyId,
      action: "proposal.sent",
      entityType: "proposal",
      entityId: result.proposal.id,
      details: { proposalKey: result.proposal.proposalKey, revision: result.proposal.revision, via: req.body.via, paymentStatus: result.proposal.paymentStatus },
    });
    for (const expiredId of result.expiredProposalIds) {
      await logActivity(db, {
        ...logged,
        companyId: existing.companyId,
        action: "proposal.expired",
        entityType: "proposal",
        entityId: expiredId,
        details: { reason: "superseded", supersededBy: result.proposal.id },
      });
    }
    res.json({
      proposal: result.proposal,
      publicUrl: result.publicUrl,
      paymentUnavailableReason: result.paymentUnavailableReason,
      messageId: result.messageId,
    });
  });

  return router;
}

/** Minimal self-contained page for the signer. Every user-provided value goes through escapeHtml. */
function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMoney(cents: number | null | undefined, currency: string) {
  if (cents === null || cents === undefined) return "—";
  return `${(cents / 100).toFixed(2)} ${escapeHtml(currency)}`;
}

const statusLabels: Record<string, string> = {
  sent: "Pendiente de firma",
  viewed: "Pendiente de firma",
  accepted: "Aceptada",
  rejected: "Rechazada",
  expired: "Caducada",
};

export function renderPublicProposalHtml(view: PublicProposalView, token: string) {
  const canSign = view.status === "sent" || view.status === "viewed";
  const scopeRows = view.scope.map((item, index) => `
        <tr>
          <td>${index + 1}</td>
          <td><strong>${escapeHtml(item.title)}</strong>${item.description ? `<br><span class="muted">${escapeHtml(item.description)}</span>` : ""}</td>
          <td>${item.quantity === null || item.quantity === undefined ? "—" : escapeHtml(item.quantity)}</td>
          <td>${formatMoney(item.unitPriceCents, view.currency)}</td>
        </tr>`).join("");
  const paymentBlock = view.paymentUrl
    ? `<p><a class="button" href="${escapeHtml(view.paymentUrl)}" rel="noopener">Pagar la señal</a></p>`
    : "";
  const acceptBlock = canSign
    ? `<form id="sign" class="card">
        <h2>Aceptar propuesta</h2>
        <label>Nombre completo<input name="name" required maxlength="200" autocomplete="name"></label>
        <label>Correo electrónico<input name="email" type="email" required maxlength="320" autocomplete="email"></label>
        <input type="hidden" name="revision" value="${escapeHtml(view.revision)}">
        <button type="submit">Aceptar propuesta</button>
        <p id="message" role="status" class="muted"></p>
      </form>`
    : `<p class="card">Estado: <strong>${escapeHtml(statusLabels[view.status] ?? view.status)}</strong></p>`;
  const tokenJson = JSON.stringify(token).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(view.title)} · ${escapeHtml(view.companyName)}</title>
  <style>
    :root { color-scheme: light dark; --bg: #f7f7f5; --fg: #1d1d1b; --muted: #6b6b66; --card: #ffffff; --line: #d9d9d3; --accent: #1f5f4a; }
    @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #161615; --fg: #ecece8; --muted: #9c9c95; --card: #20201e; --line: #3a3a36; --accent: #6fbf9f; } }
    :root[data-theme="dark"] { --bg: #161615; --fg: #ecece8; --muted: #9c9c95; --card: #20201e; --line: #3a3a36; --accent: #6fbf9f; }
    body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.5 system-ui, sans-serif; }
    main { max-width: 760px; margin: 0 auto; padding: 16px; display: flex; flex-direction: column; gap: 16px; }
    .card { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 16px; }
    h1 { font-size: 1.5rem; margin: 0; }
    h2 { font-size: 1.1rem; margin: 0 0 8px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
    .muted { color: var(--muted); font-size: 0.9rem; }
    .terms { white-space: pre-wrap; }
    label { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
    input { font: inherit; padding: 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg); }
    button, .button { font: inherit; display: inline-block; padding: 10px 16px; border-radius: 6px; border: 0; background: var(--accent); color: #ffffff; text-decoration: none; cursor: pointer; }
    button:disabled { opacity: 0.6; cursor: default; }
  </style>
</head>
<body>
  <main>
    <header class="card">
      <p class="muted">${escapeHtml(view.companyName)} · Revisión ${escapeHtml(view.revision)}</p>
      <h1>${escapeHtml(view.title)}</h1>
      ${view.validUntil ? `<p class="muted">Válida hasta ${escapeHtml(view.validUntil.slice(0, 10))}</p>` : ""}
    </header>
    <section class="card">
      <h2>Alcance</h2>
      <table>
        <thead><tr><th>#</th><th>Concepto</th><th>Cantidad</th><th>Precio unitario</th></tr></thead>
        <tbody>${scopeRows}</tbody>
      </table>
    </section>
    <section class="card">
      <h2>Precio</h2>
      <p>Total: <strong>${formatMoney(view.priceCents, view.currency)}</strong></p>
      ${view.depositCents ? `<p>Señal para reservar: <strong>${formatMoney(view.depositCents, view.currency)}</strong></p>` : ""}
      ${paymentBlock}
    </section>
    ${view.terms ? `<section class="card"><h2>Condiciones</h2><div class="terms">${escapeHtml(view.terms)}</div></section>` : ""}
    ${acceptBlock}
  </main>
  <script>
    (function () {
      var token = ${tokenJson};
      var form = document.getElementById("sign");
      if (!form) return;
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        var data = new FormData(form);
        var message = document.getElementById("message");
        var button = form.querySelector("button");
        button.disabled = true;
        message.textContent = "Enviando…";
        fetch("/api/public/proposals/" + encodeURIComponent(token) + "/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: data.get("name"), email: data.get("email"), revision: Number(data.get("revision")) })
        }).then(function (response) {
          return response.json().catch(function () { return {}; }).then(function (body) {
            if (response.ok) { window.location.reload(); return; }
            button.disabled = false;
            message.textContent = body.error || "No se pudo aceptar la propuesta.";
          });
        }).catch(function () {
          button.disabled = false;
          message.textContent = "No se pudo aceptar la propuesta. Inténtalo de nuevo.";
        });
      });
    })();
  </script>
</body>
</html>`;
}

export function publicProposalRoutes(db: Db, deps: ProposalServiceDeps = {}) {
  const router = Router();
  const svc = proposalService(db, deps);

  router.get("/api/public/proposals/:token", async (req, res) => {
    const token = req.params.token as string;
    await svc.markViewed(token);
    res.json(await svc.publicView(token));
  });

  router.get("/api/public/proposals/:token/view", async (req, res) => {
    const token = req.params.token as string;
    await svc.markViewed(token);
    const view = await svc.publicView(token);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(renderPublicProposalHtml(view, token));
  });

  router.post("/api/public/proposals/:token/accept", validateBody(acceptProposalPublicSchema), async (req, res) => {
    const token = req.params.token as string;
    const accepted = await svc.accept(token, req.body, {
      ip: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    });
    await logActivity(db, {
      companyId: accepted.companyId,
      actorType: "system",
      actorId: "public-proposal",
      action: "proposal.accepted",
      entityType: "proposal",
      entityId: accepted.id,
      details: { revision: accepted.revision },
    });
    res.json(await svc.publicView(token));
  });

  router.post("/api/public/proposals/:token/reject", validateBody(rejectProposalPublicSchema), async (req, res) => {
    const token = req.params.token as string;
    const rejected = await svc.reject(token, req.body);
    await logActivity(db, {
      companyId: rejected.companyId,
      actorType: "system",
      actorId: "public-proposal",
      action: "proposal.rejected",
      entityType: "proposal",
      entityId: rejected.id,
      details: { revision: rejected.revision },
    });
    res.json(await svc.publicView(token));
  });

  router.post("/api/public/stripe/webhook", async (req, res) => {
    const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
    if (!Buffer.isBuffer(rawBody)) throw new HttpError(401, "Webhook body is missing");
    const signature = req.get("stripe-signature") ?? undefined;
    const result = await svc.handleStripeWebhook({ rawBody, signature });
    if (result.status === "paid" && result.proposalId && result.companyId) {
      await logActivity(db, {
        companyId: result.companyId,
        actorType: "system",
        actorId: "stripe-webhook",
        action: "proposal.paid",
        entityType: "proposal",
        entityId: result.proposalId,
        details: { source: "stripe" },
      });
    }
    res.json({ received: true, status: result.status });
  });

  return router;
}
