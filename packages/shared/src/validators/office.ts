import { z } from "zod";
import { officeLayoutSchema, officePatchSchema } from "../office-layout.js";

/** PUT /companies/:companyId/office/layout */
export const putOfficeLayoutSchema = z.object({ layout: officeLayoutSchema }).strict();
export type PutOfficeLayoutInput = z.infer<typeof putOfficeLayoutSchema>;

export const OFFICE_DESIGN_CHAT_MAX_MESSAGE = 2000;
export const OFFICE_DESIGN_CHAT_MAX_HISTORY = 20;

/** POST /companies/:companyId/office/design-chat */
export const officeDesignChatSchema = z.object({
  message: z.string().min(1).max(OFFICE_DESIGN_CHAT_MAX_MESSAGE),
  layout: officeLayoutSchema,
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().max(OFFICE_DESIGN_CHAT_MAX_MESSAGE),
  }).strict()).max(OFFICE_DESIGN_CHAT_MAX_HISTORY).default([]),
}).strict();
export type OfficeDesignChatInput = z.infer<typeof officeDesignChatSchema>;

export const officeDesignChatResponseSchema = z.object({
  reply: z.string(),
  patch: officePatchSchema,
}).strict();
export type OfficeDesignChatResponse = z.infer<typeof officeDesignChatResponseSchema>;

export const officeLayoutResponseSchema = z.object({
  layout: officeLayoutSchema,
  source: z.enum(["default", "saved"]),
}).strict();
export type OfficeLayoutResponse = z.infer<typeof officeLayoutResponseSchema>;
