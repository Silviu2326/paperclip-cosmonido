import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { contactIdentities, productContactImports, type Db } from "@paperclipai/db";
import { CONTACT_IMPORT_MAX_BYTES, CONTACT_IMPORT_MAX_ROWS, contactImportCommitInputSchema, type ContactImportPreview, type ContactImportReceipt, type ContactImportMapping } from "@paperclipai/shared/productization/contact-import";
import { createContactSchema } from "@paperclipai/shared";
import { badRequest, conflict } from "../../errors.js";
import { contactService } from "../crm/contacts.js";
import { CrmDuplicateError } from "../crm/common.js";
import { normalizeEmail, normalizePhoneE164 } from "../crm/identity.js";
import { logActivity, publishActivity, type ActivityPublication } from "../activity-log.js";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const headers = ["displayName", "email", "phone", "language"];

/** RFC4180 quoting, bounded before parsing; no expression/formula evaluation. */
function parseCsv(csv: string, mapping?: ContactImportMapping) {
  if (Buffer.byteLength(csv, "utf8") > CONTACT_IMPORT_MAX_BYTES) throw badRequest("El CSV supera 128 KiB.");
  const text = csv.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false, closed = false;
  const cell = () => { row.push(field.trim()); field = ""; closed = false; };
  const line = () => { cell(); if (row.some(Boolean)) rows.push(row); row = []; if (rows.length > CONTACT_IMPORT_MAX_ROWS + 1) throw badRequest("Importa como máximo 100 contactos por lote."); };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { quoted = false; closed = true; }
      else field += ch;
    } else if (ch === '"') {
      if (field.length || closed) throw badRequest("Comillas CSV mal formadas.");
      quoted = true;
    } else if (ch === ",") cell();
    else if (ch === "\r" || ch === "\n") { line(); if (ch === "\r" && text[i + 1] === "\n") i++; }
    else { if (closed && ch.trim()) throw badRequest("Texto después del cierre de comillas CSV."); if (!closed) field += ch; }
  }
  if (quoted) throw badRequest("Hay comillas CSV sin cerrar.");
  if (field || row.length || closed) line();
  const heading = rows.shift();
  if (!heading || new Set(heading).size !== heading.length || heading.some(h => !h)) throw badRequest("La cabecera CSV debe tener nombres únicos y no vacíos.");
  const selected = mapping ? [mapping.displayName, mapping.email, mapping.phone, mapping.language] : headers;
  if (!selected[0] || (!selected[1] && !selected[2]) || selected.some(name => name && !heading.includes(name))) throw badRequest("Revisa el mapeo de columnas: requiere nombre y email o teléfono.");
  const positions = selected.map(name => name ? heading.indexOf(name) : -1);
  if (new Set(positions.filter(p => p >= 0)).size !== positions.filter(p => p >= 0).length) throw badRequest("Cada campo debe usar una columna distinta.");
  if (!rows.length) throw badRequest("El CSV no contiene contactos.");
  if (rows.some(row => row.length !== heading.length)) throw badRequest("Hay filas con un número de columnas distinto de la cabecera.");
  return rows.map(row => positions.map(position => position < 0 ? "" : row[position]!));
}

export function productContactImportService(db: Db) {
  async function preview(companyId: string, csv: string, mapping?: ContactImportMapping): Promise<ContactImportPreview> {
    const rows = parseCsv(csv, mapping).map<ContactImportPreview["rows"][number]>((cells, i) => {
      const [displayName = "", rawEmail = "", rawPhone = "", rawLanguage = ""] = cells;
      const email = rawEmail ? normalizeEmail(rawEmail) : null, phone = rawPhone ? normalizePhoneE164(rawPhone) : null;
      const language = rawLanguage.toLowerCase() || null;
      const valid = cells.length === 4 && (!rawEmail || email) && (!rawPhone || phone) && (email || phone) && createContactSchema.safeParse({ displayName, primaryEmail: email, primaryPhone: phone, language }).success;
      return { row: i + 2, displayName, email, phone, language, status: valid ? "create" : "invalid", existingContactId: null, reason: valid ? null : "Revisa nombre, email/teléfono y código de idioma de dos letras." };
    });
    const identifiers = [...new Set(rows.filter(r => r.status === "create").flatMap(r => [r.email, r.phone]).filter((v): v is string => Boolean(v)))];
    // One indexed, company-scoped identity lookup for the whole preview.
    const existing = identifiers.length ? await db.select({ channel: contactIdentities.channel, identifier: contactIdentities.identifier, contactId: contactIdentities.contactId }).from(contactIdentities)
      .where(and(eq(contactIdentities.companyId, companyId), inArray(contactIdentities.channel, ["email", "phone"]), inArray(contactIdentities.identifier, identifiers))).limit(CONTACT_IMPORT_MAX_ROWS * 2) : [];
    const owners = new Map(existing.map(r => [`${r.channel}:${r.identifier}`, r.contactId]));
    const seen = new Set<string>();
    for (const row of rows) {
      if (row.status !== "create") continue;
      const keys = [row.email && `email:${row.email}`, row.phone && `phone:${row.phone}`].filter((v): v is string => Boolean(v));
      const matches = new Set(keys.map(key => owners.get(key)).filter((v): v is string => Boolean(v)));
      if (matches.size > 1) { row.status = "invalid"; row.reason = "Las identidades pertenecen a contactos distintos; resuélvelo antes de importar."; }
      else if (matches.size) { row.status = "existing"; row.existingContactId = [...matches][0]!; row.reason = "Ya existe; se conserva sin modificar ni añadir consentimiento."; }
      else if (keys.some(key => seen.has(key))) { row.status = "duplicate_in_file"; row.reason = "Identidad repetida dentro del CSV; se conserva la primera fila."; }
      for (const key of keys) seen.add(key);
    }
    const counts = { create: 0, existing: 0, duplicate_in_file: 0, invalid: 0 };
    for (const row of rows) counts[row.status]++;
    return { companyId, rows, counts, previewHash: hash(JSON.stringify({ companyId, rows })) };
  }
  return {
    preview,
    async commit(companyId: string, userId: string, raw: unknown): Promise<ContactImportReceipt> {
      const input = contactImportCommitInputSchema.parse(raw), csvHash = hash(JSON.stringify({ csv: input.csv, mapping: input.mapping ?? null }));
      const publications: ActivityPublication[] = [];
      let receipt: ContactImportReceipt;
      try {
        receipt = await db.transaction(async tx => {
          const txDb = tx as unknown as Db;
          await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`contact-import:${companyId}:${input.idempotencyKey}`},0))`);
          const [prior] = await tx.select().from(productContactImports).where(and(eq(productContactImports.companyId, companyId), eq(productContactImports.idempotencyKey, input.idempotencyKey))).limit(1);
          if (prior) { if (prior.csvHash !== csvHash) throw conflict("La clave del lote ya se usó con otro CSV."); return prior.receipt; }
          const current = await productContactImportService(txDb).preview(companyId, input.csv, input.mapping);
          if (current.previewHash !== input.previewHash) throw conflict("Los contactos cambiaron desde la vista previa. Revísala de nuevo.");
          if (current.counts.invalid) throw badRequest("Corrige las filas inválidas antes de importar.");
          const result: ContactImportReceipt = { id: randomUUID(), companyId, created: [], skippedExisting: current.counts.existing, skippedInFile: current.counts.duplicate_in_file, completedAt: new Date().toISOString() };
          for (const row of current.rows.filter(r => r.status === "create")) {
            const { contact } = await contactService(txDb).create(companyId, createContactSchema.parse({ displayName: row.displayName, primaryEmail: row.email, primaryPhone: row.phone, language: row.language, consents: {}, idempotencyKey: `csv:${input.idempotencyKey}:${row.row}` }), { actor: { actorType: "user", actorId: userId }, publications });
            const identities = await tx.select({ channel: contactIdentities.channel, identifier: contactIdentities.identifier }).from(contactIdentities).where(and(eq(contactIdentities.companyId, companyId), eq(contactIdentities.contactId, contact.id)));
            if ((row.email && !identities.some(i => i.channel === "email" && i.identifier === row.email)) || (row.phone && !identities.some(i => i.channel === "phone" && i.identifier === row.phone))) throw conflict("Una identidad se creó en paralelo. Revisa de nuevo el lote.");
            result.created.push(contact.id);
          }
          await tx.insert(productContactImports).values({ id: result.id, companyId, createdByUserId: userId, idempotencyKey: input.idempotencyKey, csvHash, receipt: result, completedAt: new Date(result.completedAt) });
          await logActivity(txDb, { companyId, actorType: "user", actorId: userId, action: "contacts.imported", entityType: "contact_import", entityId: result.id, details: { created: result.created.length, skippedExisting: result.skippedExisting, skippedInFile: result.skippedInFile } }, publications);
          return result;
        });
      } catch (error) { if (error instanceof CrmDuplicateError) throw conflict("Un contacto se creó en paralelo. Revisa de nuevo el lote."); throw error; }
      for (const publication of publications) publishActivity(publication);
      return receipt;
    },
  };
}
