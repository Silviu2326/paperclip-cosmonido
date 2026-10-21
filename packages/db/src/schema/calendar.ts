import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { agents } from "./agents.js";
import { companies } from "./companies.js";
import { contacts } from "./contacts.js";
import { customers } from "./customers.js";
import { opportunities } from "./opportunities.js";
import { toolConnections } from "./tool_access.js";

// Sprint 2 pista H (Agenda). Pendiente de integración: añadir export en
// schema/index.ts y regenerar migración (pnpm db:generate).

export interface BookingWeeklyHour {
  /** 0 = domingo ... 6 = sábado, en la zona horaria del tipo de reserva. */
  weekday: number;
  /** Hora local "HH:mm". */
  start: string;
  /** Hora local "HH:mm", posterior a start. */
  end: string;
}

export const bookingTypes = pgTable(
  "booking_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    bufferMinutes: integer("buffer_minutes").notNull().default(0),
    timezone: text("timezone").notNull().default("UTC"),
    weeklyHours: jsonb("weekly_hours").$type<BookingWeeklyHour[]>().notNull().default([]),
    hostAgentId: uuid("host_agent_id").references(() => agents.id, { onDelete: "set null" }),
    hostUserId: text("host_user_id"),
    connectionId: uuid("connection_id").references(() => toolConnections.id, { onDelete: "set null" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyUpdatedIdx: index("booking_types_company_updated_idx").on(table.companyId, table.updatedAt),
    companySlugUq: uniqueIndex("booking_types_company_slug_uq").on(table.companyId, table.slug),
    durationCheck: check("booking_types_duration_check", sql`${table.durationMinutes} > 0`),
    bufferCheck: check("booking_types_buffer_check", sql`${table.bufferMinutes} >= 0`),
  }),
);

export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("google_calendar"),
    // Id del evento en el proveedor; nulo mientras no exista recibo.
    externalId: text("external_id"),
    connectionId: uuid("connection_id").references(() => toolConnections.id, { onDelete: "set null" }),
    bookingTypeId: uuid("booking_type_id").references(() => bookingTypes.id, { onDelete: "set null" }),
    hostAgentId: uuid("host_agent_id").references(() => agents.id, { onDelete: "set null" }),
    hostUserId: text("host_user_id"),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    opportunityId: uuid("opportunity_id").references(() => opportunities.id, { onDelete: "set null" }),
    kind: text("kind").notNull().default("meeting"),
    title: text("title").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("proposed"),
    attendeeName: text("attendee_name"),
    attendeeEmail: text("attendee_email"),
    attendeePhone: text("attendee_phone"),
    meetingLink: text("meeting_link"),
    // Sin FK: el registro vive en external_actions; se enlaza por servicio.
    externalActionId: uuid("external_action_id"),
    providerReceipt: jsonb("provider_receipt").$type<Record<string, unknown>>(),
    idempotencyKey: text("idempotency_key"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyUpdatedIdx: index("calendar_events_company_updated_idx").on(table.companyId, table.updatedAt),
    companyStartsIdx: index("calendar_events_company_starts_idx").on(table.companyId, table.startsAt),
    companyIdempotencyUq: uniqueIndex("calendar_events_company_idempotency_uq")
      .on(table.companyId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    statusCheck: check(
      "calendar_events_status_check",
      sql`${table.status} in ('proposed', 'confirmed', 'cancelled')`,
    ),
    rangeCheck: check("calendar_events_range_check", sql`${table.endsAt} > ${table.startsAt}`),
  }),
);
