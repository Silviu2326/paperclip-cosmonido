import { Router } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import {
  createConversationMessageSchema,
  createConversationSchema,
  setConversationStateSchema,
} from "@paperclipai/shared";
import { badRequest } from "../errors.js";
import { validate } from "../middleware/validate.js";
import type { EmailChannelService } from "../services/email-channels.js";
import {
  conversationListQuerySchema,
  conversationService,
  type ConversationActor,
} from "../services/conversations/conversations.js";
import {
  conversationMessageService,
  registerConversationTransport,
} from "../services/conversations/messages.js";
import {
  emailTransportService,
  projectEmailConversations,
} from "../services/conversations/transports/email.js";
import { assertBoard, assertCompanyAccess, getAccessibleResource, getActorInfo } from "./authz.js";
import { conversationAgentDispatchService } from "../services/conversations/agent-dispatch.js";
import type { Request } from "express";

// Sprint 2 pista C (Bandeja). Endpoints:
//   GET    /companies/:companyId/conversations            list with filters (cursor pagination)
//   POST   /companies/:companyId/conversations            create
//   GET    /conversations/:id                             conversation with its messages
//   POST   /conversations/:id/messages                    create a draft
//   POST   /messages/:id/send                             send a draft through the external action gate
//   POST   /messages/:id/reconcile                        settle a queued or uncertain send
//   PATCH  /conversations/:id/state                       status and priority
//   POST   /conversations/:id/assign                      assign user or agent
//   POST   /conversations/:id/link                        link customer, opportunity or lead
//
// `email` is the email channel service from app.ts. Without it, email sends report "not available".

const uuid = z.string().uuid();

const assignSchema = z
  .object({
    assignedUserId: z.string().min(1).max(200).nullable().optional(),
    assignedAgentId: uuid.nullable().optional(),
  })
  .strict();

const linkSchema = z
  .object({
    customerId: uuid.nullable().optional(),
    opportunityId: uuid.nullable().optional(),
    leadId: uuid.nullable().optional(),
  })
  .strict();

const reconcileSchema = z
  .object({
    outcome: z.enum(["sent", "failed"]).optional(),
    providerMessageId: z.string().min(1).max(998).nullable().optional(),
  })
  .strict();

const agentDispatchSettingsSchema = z.object({
  enabled: z.boolean(),
  agentId: uuid,
  responsibleUserId: z.string().trim().min(1).max(200),
}).strict();

function actorOf(req: Request): ConversationActor {
  const info = getActorInfo(req);
  if (info.actorType === "agent") return { agentId: info.agentId ?? info.actorId };
  return { userId: info.actorId };
}

export function conversationRoutes(db: Db, email?: EmailChannelService) {
  const router = Router();
  const convs = conversationService(db);
  const msgs = conversationMessageService(db);
  const agentDispatch = conversationAgentDispatchService(db);
  if (email) registerConversationTransport(emailTransportService(db, email));

  router.get("/companies/:companyId/conversation-agent-dispatch", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json(await agentDispatch.getSettings(companyId));
  });

  router.put("/companies/:companyId/conversation-agent-dispatch", validate(agentDispatchSettingsSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    const actor = getActorInfo(req);
    if (actor.actorType !== "user") throw badRequest("Only an authenticated company user can configure automatic replies");
    res.json(await agentDispatch.configure(companyId, actor.actorId, req.body));
  });

  router.get("/companies/:companyId/conversations", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const parsed = conversationListQuerySchema.safeParse(req.query);
    if (!parsed.success) throw badRequest("Invalid conversation filters", parsed.error.issues);
    await projectEmailConversations(db, companyId);
    res.json(await convs.list(companyId, parsed.data));
  });

  router.post("/companies/:companyId/conversations", validate(createConversationSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.status(201).json(await convs.create(companyId, req.body, actorOf(req)));
  });

  router.get("/conversations/:id", async (req, res) => {
    const id = req.params.id as string;
    const conversation = await getAccessibleResource(req, res, convs.findById(id), "Conversation not found");
    if (!conversation) return;
    await projectEmailConversations(db, conversation.companyId);
    const fresh = (await convs.getById(conversation.companyId, id)) ?? conversation;
    res.json({ ...fresh, messages: await convs.messages(id) });
  });

  router.post("/conversations/:id/messages", validate(createConversationMessageSchema), async (req, res) => {
    const id = req.params.id as string;
    const conversation = await getAccessibleResource(req, res, convs.findById(id), "Conversation not found");
    if (!conversation) return;
    res.status(201).json(await msgs.draft(conversation.companyId, id, req.body, actorOf(req)));
  });

  router.post("/messages/:id/send", async (req, res) => {
    const id = req.params.id as string;
    const message = await getAccessibleResource(req, res, msgs.findMessage(id), "Message not found");
    if (!message) return;
    res.json(await msgs.send(message.companyId, id, actorOf(req)));
  });

  router.post("/messages/:id/reconcile", validate(reconcileSchema), async (req, res) => {
    const id = req.params.id as string;
    const message = await getAccessibleResource(req, res, msgs.findMessage(id), "Message not found");
    if (!message) return;
    const body = req.body as z.infer<typeof reconcileSchema>;
    const resolution = body.outcome
      ? { outcome: body.outcome, providerMessageId: body.providerMessageId ?? null }
      : undefined;
    res.json(await msgs.reconcile(message.companyId, id, actorOf(req), resolution));
  });

  router.patch("/conversations/:id/state", validate(setConversationStateSchema), async (req, res) => {
    const id = req.params.id as string;
    const conversation = await getAccessibleResource(req, res, convs.findById(id), "Conversation not found");
    if (!conversation) return;
    res.json(await convs.setState(conversation.companyId, id, req.body, actorOf(req)));
  });

  router.post("/conversations/:id/assign", validate(assignSchema), async (req, res) => {
    const id = req.params.id as string;
    const conversation = await getAccessibleResource(req, res, convs.findById(id), "Conversation not found");
    if (!conversation) return;
    res.json(await convs.assign(conversation.companyId, id, req.body, actorOf(req)));
  });

  router.post("/conversations/:id/link", validate(linkSchema), async (req, res) => {
    const id = req.params.id as string;
    const conversation = await getAccessibleResource(req, res, convs.findById(id), "Conversation not found");
    if (!conversation) return;
    res.json(await convs.link(conversation.companyId, id, req.body, actorOf(req)));
  });

  return router;
}
