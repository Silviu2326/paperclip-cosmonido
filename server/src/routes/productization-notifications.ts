import { Router } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { badRequest, forbidden } from "../errors.js";
import { logActivity } from "../services/activity-log.js";
import { productNotificationsService } from "../services/productization/notifications.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";

const preferencesSchema = z.object({
  categories: z.array(z.enum(["decisions", "reviews", "tasks"])).max(3),
  browserEnabled: z.boolean(),
}).strict();
const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(4096),
  expirationTime: z.number().positive().nullable(),
  keys: z.object({ p256dh: z.string().min(60).max(120), auth: z.string().min(20).max(100) }).strict(),
}).strict();

export function productNotificationRoutes(db: Db) {
  const router = Router();
  const service = productNotificationsService(db);

  router.get("/companies/:companyId/product-notifications", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const actor = getActorInfo(req);
    if (actor.actorType !== "user") throw forbidden("Board user context required");
    res.setHeader("Cache-Control", "no-store");
    res.json(await service.snapshot(companyId, actor.actorId));
  });

  router.put("/companies/:companyId/product-notifications/preferences", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const actor = getActorInfo(req);
    if (actor.actorType !== "user") throw forbidden("Board user context required");
    const parsed = preferencesSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest("Invalid notification preferences", parsed.error.issues);
    const preferences = await service.updatePreferences(companyId, actor.actorId, parsed.data);
    await logActivity(db, { companyId, actorType: "user", actorId: actor.actorId, action: "product_notifications.preferences_updated", entityType: "product_notification_preferences", entityId: actor.actorId, details: { categories: preferences.categories, browserEnabled: preferences.browserEnabled } });
    res.setHeader("Cache-Control", "no-store");
    res.json(preferences);
  });

  router.get("/companies/:companyId/product-notifications/push/config", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.setHeader("Cache-Control", "no-store");
    res.json(service.getPushPublicConfig());
  });

  router.get("/companies/:companyId/product-notifications/push/subscriptions", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const actor = getActorInfo(req);
    if (actor.actorType !== "user") throw forbidden("Board user context required");
    res.setHeader("Cache-Control", "no-store");
    res.json(await service.listSubscriptions(companyId, actor.actorId));
  });

  router.post("/companies/:companyId/product-notifications/push/subscriptions", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const actor = getActorInfo(req);
    if (actor.actorType !== "user") throw forbidden("Board user context required");
    const parsed = pushSubscriptionSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest("Invalid push subscription", parsed.error.issues);
    const subscription = await service.subscribe(companyId, actor.actorId, parsed.data);
    await logActivity(db, { companyId, actorType: "user", actorId: actor.actorId, action: "product_notifications.push_subscribed", entityType: "product_notification_subscription", entityId: subscription.id, details: { enabled: true } });
    res.setHeader("Cache-Control", "no-store");
    res.status(201).json(subscription);
  });

  router.delete("/companies/:companyId/product-notifications/push/subscriptions/:subscriptionId", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const actor = getActorInfo(req);
    if (actor.actorType !== "user") throw forbidden("Board user context required");
    const subscriptionId = req.params.subscriptionId as string;
    const result = await service.revokeSubscription(companyId, actor.actorId, subscriptionId);
    await logActivity(db, { companyId, actorType: "user", actorId: actor.actorId, action: "product_notifications.push_subscription_revoked", entityType: "product_notification_subscription", entityId: subscriptionId, details: { revoked: true } });
    res.setHeader("Cache-Control", "no-store");
    res.json(result);
  });

  router.delete("/companies/:companyId/product-notifications/push/subscriptions", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const actor = getActorInfo(req);
    if (actor.actorType !== "user") throw forbidden("Board user context required");
    const result = await service.revokeAllSubscriptions(companyId, actor.actorId);
    await logActivity(db, { companyId, actorType: "user", actorId: actor.actorId, action: "product_notifications.push_disabled", entityType: "product_notification_preferences", entityId: actor.actorId, details: { remotePushEnabled: false } });
    res.setHeader("Cache-Control", "no-store");
    res.json(result);
  });

  return router;
}
