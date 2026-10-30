import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { contactIdentities, contacts, customerContacts, customers } from "@paperclipai/db";
import {
  CONTACT_STATUSES,
  type CreateContact,
  type CrmListQuery,
  type UpdateContact,
} from "@paperclipai/shared";
import { badRequest, conflict, notFound, unprocessable } from "../../errors.js";
import { logActivity, type ActivityPublication } from "../activity-log.js";
import {
  CrmDuplicateError,
  decodeCursor,
  findIdempotentEntityId,
  likeContains,
  lockIdempotencyKey,
  toPage,
  type CrmActor,
  type DuplicateCandidate,
} from "./common.js";
import { identityService, normalizeEmail, normalizePhoneE164, type IdentityInput } from "./identity.js";

// Contacts and their customer links (pista A1). Identities (email, phone) are kept in
// contact_identities with normalized identifiers, so intake and booking can resolve them.

export type ContactRow = typeof contacts.$inferSelect;

export interface ContactDuplicateQuery {
  displayName?: string | null;
  email?: string | null;
  phone?: string | null;
}

interface IdentityToWrite {
  channel: "email" | "phone";
  identifier: string;
}

function identitiesFor(email: string | null, phone: string | null): IdentityToWrite[] {
  const result: IdentityToWrite[] = [];
  if (email) result.push({ channel: "email", identifier: email });
  if (phone) result.push({ channel: "phone", identifier: phone });
  return result;
}

function normalizeContactFields(input: { primaryEmail?: string | null; primaryPhone?: string | null }) {
  let primaryEmail: string | null | undefined = undefined;
  let primaryPhone: string | null | undefined = undefined;
  if (input.primaryEmail !== undefined) {
    if (input.primaryEmail === null || input.primaryEmail === "") {
      primaryEmail = null;
    } else {
      primaryEmail = normalizeEmail(input.primaryEmail);
      if (!primaryEmail) throw unprocessable("Invalid email", { field: "primaryEmail" });
    }
  }
  if (input.primaryPhone !== undefined) {
    if (input.primaryPhone === null || input.primaryPhone === "") {
      primaryPhone = null;
    } else {
      primaryPhone = normalizePhoneE164(input.primaryPhone);
      if (!primaryPhone) throw unprocessable("Invalid phone number", { field: "primaryPhone" });
    }
  }
  return { primaryEmail, primaryPhone };
}

export function contactService(db: Db) {
  return {
    /**
     * Read-only duplicate candidates by normalized identity (email, phone).
     * Never merges. Each candidate lists the identities that matched.
     */
    findDuplicates: async (companyId: string, input: ContactDuplicateQuery): Promise<DuplicateCandidate<ContactRow>[]> => {
      const matches = await identityService(db).findMatches(companyId, {
        email: input.email ?? null,
        phone: input.phone ?? null,
      } satisfies IdentityInput);
      const grouped = new Map<string, DuplicateCandidate<ContactRow>>();
      for (const match of matches) {
        const reason = `${match.channel}:${match.identifier}`;
        const current = grouped.get(match.contact.id);
        if (current) current.reasons.push(reason);
        else grouped.set(match.contact.id, { record: match.contact, reasons: [reason] });
      }
      return [...grouped.values()];
    },

    list: async (companyId: string, query: CrmListQuery) => {
      const conditions = [eq(contacts.companyId, companyId)];
      if (query.status !== undefined) {
        if (!(CONTACT_STATUSES as readonly string[]).includes(query.status)) {
          throw badRequest("Invalid status", { field: "status" });
        }
        conditions.push(eq(contacts.status, query.status));
      }
      if (query.q) {
        const pattern = likeContains(query.q);
        conditions.push(
          or(
            ilike(contacts.displayName, pattern),
            ilike(contacts.primaryEmail, pattern),
            ilike(contacts.primaryPhone, pattern),
          )!,
        );
      }
      const cursor = decodeCursor(query.cursor);
      if (cursor) {
        conditions.push(
          sql`(${contacts.updatedAt}, ${contacts.id}) < (${cursor.updatedAt.toISOString()}::timestamptz, ${cursor.id}::uuid)`,
        );
      }
      const rows = await db
        .select()
        .from(contacts)
        .where(and(...conditions))
        .orderBy(desc(contacts.updatedAt), desc(contacts.id))
        .limit(query.limit + 1);
      const page = toPage(rows, query.limit);
      if (page.items.length === 0) return page;
      const links = await db
        .select({ contactId: customerContacts.contactId, id: customers.id, name: customers.name })
        .from(customerContacts)
        .innerJoin(customers, and(eq(customers.id, customerContacts.customerId), eq(customers.companyId, companyId)))
        .where(and(eq(customerContacts.companyId, companyId), inArray(customerContacts.contactId, page.items.map((row) => row.id))))
        .orderBy(desc(customerContacts.isPrimary), asc(customers.name), asc(customers.id));
      const byContact = new Map<string, Array<{ id: string; name: string }>>();
      for (const { contactId, id, name } of links) {
        const linked = byContact.get(contactId) ?? [];
        linked.push({ id, name });
        byContact.set(contactId, linked);
      }
      return { ...page, items: page.items.map((contact) => ({ ...contact, customers: byContact.get(contact.id) ?? [] })) };
    },

    getById: (id: string) =>
      db
        .select()
        .from(contacts)
        .where(eq(contacts.id, id))
        .then((rows) => rows[0] ?? null),

    /** Contacts linked to a customer of this company, primary first. */
    listByCustomer: async (companyId: string, customerId: string) => {
      const customer = await db
        .select({ id: customers.id })
        .from(customers)
        .where(and(eq(customers.id, customerId), eq(customers.companyId, companyId)))
        .then((rows) => rows[0] ?? null);
      if (!customer) return null;
      return db
        .select({
          contact: contacts,
          role: customerContacts.role,
          isPrimary: customerContacts.isPrimary,
        })
        .from(customerContacts)
        .innerJoin(contacts, eq(contacts.id, customerContacts.contactId))
        .where(and(eq(customerContacts.customerId, customerId), eq(customerContacts.companyId, companyId)))
        .orderBy(desc(customerContacts.isPrimary), asc(contacts.displayName));
    },

    /** Customers a contact is linked to, primary links first. Null when the contact is not in this company. */
    listCustomers: async (companyId: string, contactId: string) => {
      const contact = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.id, contactId), eq(contacts.companyId, companyId)))
        .then((rows) => rows[0] ?? null);
      if (!contact) return null;
      return db
        .select({
          customer: customers,
          role: customerContacts.role,
          isPrimary: customerContacts.isPrimary,
        })
        .from(customerContacts)
        .innerJoin(customers, eq(customers.id, customerContacts.customerId))
        .where(and(eq(customerContacts.contactId, contactId), eq(customerContacts.companyId, companyId)))
        .orderBy(desc(customerContacts.isPrimary), asc(customers.name));
    },

    /**
     * Creates a contact and its email/phone identities. Idempotent by `idempotencyKey`.
     * Without `force`, an identity already known to the company throws CrmDuplicateError.
     * With `force`, the contact is created and the conflicting identity is left on the
     * existing contact (listed in the activity details).
     */
    create: async (
      companyId: string,
      input: CreateContact,
      options: { actor: CrmActor; force?: boolean; publications?: ActivityPublication[] },
    ): Promise<{ contact: ContactRow; created: boolean }> => {
      const { primaryEmail, primaryPhone } = normalizeContactFields({
        primaryEmail: input.primaryEmail ?? null,
        primaryPhone: input.primaryPhone ?? null,
      });
      const email = primaryEmail ?? null;
      const phone = primaryPhone ?? null;
      const action = "contact.created";

      return db.transaction(async (tx) => {
        const txDb = tx as unknown as Db;
        if (input.idempotencyKey) {
          await lockIdempotencyKey(txDb, companyId, action, input.idempotencyKey);
          const priorId = await findIdempotentEntityId(txDb, {
            companyId,
            action,
            entityType: "contact",
            key: input.idempotencyKey,
          });
          if (priorId) {
            const prior = await txDb
              .select()
              .from(contacts)
              .where(and(eq(contacts.id, priorId), eq(contacts.companyId, companyId)))
              .then((rows) => rows[0] ?? null);
            if (prior) return { contact: prior, created: false };
          }
        }

        if (input.customerId) {
          const customer = await txDb
            .select({ id: customers.id })
            .from(customers)
            .where(and(eq(customers.id, input.customerId), eq(customers.companyId, companyId)))
            .then((rows) => rows[0] ?? null);
          if (!customer) throw notFound("Customer not found");
        }

        const matches = await identityService(txDb).findMatches(companyId, { email, phone });
        if (matches.length > 0 && !options.force) {
          const grouped = new Map<string, DuplicateCandidate<ContactRow>>();
          for (const match of matches) {
            const reason = `${match.channel}:${match.identifier}`;
            const current = grouped.get(match.contact.id);
            if (current) current.reasons.push(reason);
            else grouped.set(match.contact.id, { record: match.contact, reasons: [reason] });
          }
          throw new CrmDuplicateError([...grouped.values()]);
        }

        const [row] = await txDb
          .insert(contacts)
          .values({
            companyId,
            firstName: input.firstName ?? null,
            lastName: input.lastName ?? null,
            displayName: input.displayName,
            primaryEmail: email,
            primaryPhone: phone,
            title: input.title ?? null,
            language: input.language ?? null,
            preferredChannel: input.preferredChannel ?? null,
            consents: input.consents ?? {},
          })
          .returning();

        const skippedIdentities: string[] = [];
        for (const identity of identitiesFor(email, phone)) {
          const inserted = await txDb
            .insert(contactIdentities)
            .values({
              companyId,
              contactId: row!.id,
              channel: identity.channel,
              identifier: identity.identifier,
              verified: false,
              source: "manual",
            })
            .onConflictDoNothing()
            .returning({ id: contactIdentities.id });
          if (inserted.length === 0) skippedIdentities.push(`${identity.channel}:${identity.identifier}`);
        }

        await logActivity(txDb, {
          companyId,
          ...options.actor,
          action,
          entityType: "contact",
          entityId: row!.id,
          details: {
            displayName: row!.displayName,
            ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
            ...(skippedIdentities.length > 0 ? { identitiesOwnedElsewhere: skippedIdentities } : {}),
          },
        }, options.publications);

        if (input.customerId) {
          await linkWithin(txDb, companyId, input.customerId, row!.id, { role: null, isPrimary: false }, options.actor);
        }
        return { contact: row!, created: true };
      });
    },

    /** Updates fields. Changing email or phone also (re)attaches the identity; a clash with another contact is a 409. */
    update: async (companyId: string, id: string, input: UpdateContact, options: { actor: CrmActor }) => {
      const { primaryEmail, primaryPhone } = normalizeContactFields(input);

      return db.transaction(async (tx) => {
        const txDb = tx as unknown as Db;
        const existing = await txDb
          .select()
          .from(contacts)
          .where(and(eq(contacts.id, id), eq(contacts.companyId, companyId)))
          .then((rows) => rows[0] ?? null);
        if (!existing) return null;

        const patch: Partial<typeof contacts.$inferInsert> = { updatedAt: new Date() };
        if (input.firstName !== undefined) patch.firstName = input.firstName;
        if (input.lastName !== undefined) patch.lastName = input.lastName;
        if (input.displayName !== undefined) patch.displayName = input.displayName;
        if (input.title !== undefined) patch.title = input.title;
        if (input.language !== undefined) patch.language = input.language;
        if (input.preferredChannel !== undefined) patch.preferredChannel = input.preferredChannel;
        if (input.consents !== undefined) patch.consents = input.consents;
        if (primaryEmail !== undefined) patch.primaryEmail = primaryEmail;
        if (primaryPhone !== undefined) patch.primaryPhone = primaryPhone;
        if (input.status !== undefined) {
          patch.status = input.status;
          patch.archivedAt = input.status === "archived" ? (existing.archivedAt ?? new Date()) : null;
        }

        for (const identity of identitiesFor(
          primaryEmail !== undefined ? primaryEmail : null,
          primaryPhone !== undefined ? primaryPhone : null,
        )) {
          await attachIdentity(txDb, companyId, id, identity);
        }

        const [row] = await txDb
          .update(contacts)
          .set(patch)
          .where(and(eq(contacts.id, id), eq(contacts.companyId, companyId)))
          .returning();

        const archived = existing.status !== "archived" && row!.status === "archived";
        await logActivity(txDb, {
          companyId,
          ...options.actor,
          action: archived ? "contact.archived" : "contact.updated",
          entityType: "contact",
          entityId: id,
          details: { changedFields: Object.keys(input).filter((key) => (input as Record<string, unknown>)[key] !== undefined) },
        });
        return row!;
      });
    },

    /** Links a contact to a customer. isPrimary true clears the flag on the customer's other contacts. */
    link: (
      companyId: string,
      customerId: string,
      contactId: string,
      input: { role?: string | null; isPrimary?: boolean },
      options: { actor: CrmActor },
    ) =>
      db.transaction((tx) =>
        linkWithin(tx as unknown as Db, companyId, customerId, contactId, {
          role: input.role ?? null,
          isPrimary: input.isPrimary ?? false,
        }, options.actor),
      ),

    /** Removes the link. Returns false when the contact was not linked to the customer. */
    unlink: (companyId: string, customerId: string, contactId: string, options: { actor: CrmActor }) =>
      db.transaction(async (tx) => {
        const txDb = tx as unknown as Db;
        const removed = await txDb
          .delete(customerContacts)
          .where(
            and(
              eq(customerContacts.companyId, companyId),
              eq(customerContacts.customerId, customerId),
              eq(customerContacts.contactId, contactId),
            ),
          )
          .returning({ id: customerContacts.id });
        if (removed.length === 0) return false;
        await logActivity(txDb, {
          companyId,
          ...options.actor,
          action: "contact.unlinked",
          entityType: "contact",
          entityId: contactId,
          details: { customerId },
        });
        return true;
      }),
  };
}

async function attachIdentity(txDb: Db, companyId: string, contactId: string, identity: IdentityToWrite) {
  const [owner] = await txDb
    .select({ contactId: contactIdentities.contactId })
    .from(contactIdentities)
    .where(
      and(
        eq(contactIdentities.companyId, companyId),
        eq(contactIdentities.channel, identity.channel),
        eq(contactIdentities.identifier, identity.identifier),
      ),
    )
    .limit(1);
  if (owner && owner.contactId !== contactId) {
    throw conflict("Identity already belongs to another contact", {
      channel: identity.channel,
      identifier: identity.identifier,
      contactId: owner.contactId,
    });
  }
  if (owner) return;
  await txDb.insert(contactIdentities).values({
    companyId,
    contactId,
    channel: identity.channel,
    identifier: identity.identifier,
    verified: false,
    source: "manual",
  });
}

async function linkWithin(
  txDb: Db,
  companyId: string,
  customerId: string,
  contactId: string,
  input: { role: string | null; isPrimary: boolean },
  actor: CrmActor,
) {
  const [customer] = await txDb
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.companyId, companyId)))
    .limit(1);
  if (!customer) throw notFound("Customer not found");
  const [contact] = await txDb
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.companyId, companyId)))
    .limit(1);
  if (!contact) throw notFound("Contact not found");

  if (input.isPrimary) {
    await txDb
      .update(customerContacts)
      .set({ isPrimary: false, updatedAt: new Date() })
      .where(
        and(
          eq(customerContacts.companyId, companyId),
          eq(customerContacts.customerId, customerId),
          sql`${customerContacts.contactId} <> ${contactId}`,
        ),
      );
  }

  const [link] = await txDb
    .insert(customerContacts)
    .values({
      companyId,
      customerId,
      contactId,
      role: input.role,
      isPrimary: input.isPrimary,
    })
    .onConflictDoUpdate({
      target: [customerContacts.customerId, customerContacts.contactId],
      set: { role: input.role, isPrimary: input.isPrimary, updatedAt: new Date() },
    })
    .returning();

  await logActivity(txDb, {
    companyId,
    ...actor,
    action: "contact.linked",
    entityType: "contact",
    entityId: contactId,
    details: { customerId, role: input.role, isPrimary: input.isPrimary },
  });
  return link!;
}
