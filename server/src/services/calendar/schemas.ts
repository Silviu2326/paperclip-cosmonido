import { z } from "zod";

// Input schemas for the calendar routes, public booking and agent tools.
// Kept local to pista H; move to packages/shared/validators when the contract allows.

const isoInstant = z
  .string()
  .min(1)
  .max(40)
  .refine((value) => !Number.isNaN(Date.parse(value)), "Must be an ISO 8601 date-time");

const hhmm = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Must be HH:mm");

const weeklyHourSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  start: hhmm,
  end: hhmm,
});

export const bookingTypeSlugSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, digits and dashes");

export const createBookingTypeSchema = z.object({
  slug: bookingTypeSlugSchema,
  name: z.string().trim().min(1).max(120),
  durationMinutes: z.number().int().min(5).max(480),
  bufferMinutes: z.number().int().min(0).max(240).default(0),
  timezone: z.string().min(1).max(64).default("UTC"),
  weeklyHours: z.array(weeklyHourSchema).max(28).default([]),
  hostAgentId: z.string().uuid().nullable().optional(),
  hostUserId: z.string().min(1).max(200).nullable().optional(),
  connectionId: z.string().uuid().nullable().optional(),
  publicExecutionEnabled: z.boolean().default(false),
});

export const availabilityQuerySchema = z.object({
  bookingTypeId: z.string().uuid().optional(),
  slug: bookingTypeSlugSchema.optional(),
  from: isoInstant,
  to: isoInstant,
});

export const attendeeSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().min(3).max(40).optional().nullable(),
});

export const bookSchema = z.object({
  bookingTypeId: z.string().uuid().optional(),
  slug: bookingTypeSlugSchema.optional(),
  startsAt: isoInstant,
  attendee: attendeeSchema,
  customerId: z.string().uuid().optional().nullable(),
  opportunityId: z.string().uuid().optional().nullable(),
});

export const rescheduleSchema = z.object({ startsAt: isoInstant });

export const listEventsQuerySchema = z.object({
  status: z.enum(["proposed", "confirmed", "cancelled"]).optional(),
  from: isoInstant.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/** Public booking body: name, email and phone, per the Sprint 2 contract. */
export const publicBookingSchema = z.object({
  startsAt: isoInstant,
  name: attendeeSchema.shape.name,
  email: attendeeSchema.shape.email,
  phone: attendeeSchema.shape.phone,
});

export type CreateBookingTypeInput = z.infer<typeof createBookingTypeSchema>;
export type BookInput = z.infer<typeof bookSchema>;
