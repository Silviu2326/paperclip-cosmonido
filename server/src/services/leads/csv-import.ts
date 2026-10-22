import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { contactIdentities, leads } from "@paperclipai/db";
import { badRequest } from "../../errors.js";
import { normalizeEmail, normalizePhoneE164 } from "../crm/identity.js";
import { leadIntakeService } from "./intake.js";

// CSV import of leads (pista B). Parsing is local: no new dependency.
// Flow: preview (parse, map columns, flag invalid rows and duplicates) and then
// commit (ingest each importable row through the idempotent intake service).

export const CSV_MAX_ROWS = 5000;
export const CSV_MAX_CHARS = 5_000_000;
export const CSV_PREVIEW_ROWS = 200;

export const LEAD_CSV_FIELDS = ["name", "email", "phone", "company", "language", "message", "sourceRef"] as const;
export type LeadCsvField = (typeof LEAD_CSV_FIELDS)[number];

const mappedHeader = z.string().trim().min(1).max(200).optional();

export const csvImportBodySchema = z.object({
  csv: z.string().min(1).max(CSV_MAX_CHARS),
  /** Field -> header name in the file. Missing fields are auto-mapped from the header names. */
  mapping: z
    .object({
      name: mappedHeader,
      email: mappedHeader,
      phone: mappedHeader,
      company: mappedHeader,
      language: mappedHeader,
      message: mappedHeader,
      sourceRef: mappedHeader,
    })
    .optional(),
  skipDuplicates: z.boolean().optional().default(true),
});
export type CsvImportBody = z.infer<typeof csvImportBodySchema>;

// ---------------------------------------------------------------- parsing

/** Picks the most frequent delimiter of the first line outside quotes: comma, semicolon or tab. */
export function detectDelimiter(firstLine: string): "," | ";" | "\t" {
  let inQuotes = false;
  const counts = { ",": 0, ";": 0, "\t": 0 };
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch as keyof typeof counts] += 1;
  }
  if (counts[";"] > counts[","] && counts[";"] >= counts["\t"]) return ";";
  if (counts["\t"] > counts[","] && counts["\t"] > counts[";"]) return "\t";
  return ",";
}

/** RFC 4180 style parser: quoted fields, doubled quotes, embedded newlines, CRLF or LF, optional BOM. */
export function parseCsv(input: string): { rows: string[][]; delimiter: string } {
  const source = input.replace(/^﻿/, "");
  const firstLineEnd = source.search(/\r?\n/);
  const delimiter = detectDelimiter(firstLineEnd === -1 ? source : source.slice(0, firstLineEnd));

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (inQuotes) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\r" && source[i + 1] === "\n") {
      continue;
    } else if (ch === "\n" || ch === "\r") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (inQuotes) throw badRequest("CSV has an unclosed quoted field");
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully blank lines.
  return { rows: rows.filter((cells) => cells.some((cell) => cell.trim() !== "")), delimiter };
}

function foldHeader(header: string): string {
  return header.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/[_\-]+/g, " ");
}

const HEADER_SYNONYMS: Record<LeadCsvField, string[]> = {
  name: ["name", "nombre", "nombre completo", "full name", "contacto", "contact"],
  email: ["email", "e mail", "correo", "correo electronico", "mail"],
  phone: ["phone", "telefono", "tel", "movil", "mobile", "celular", "whatsapp"],
  company: ["company", "empresa", "organizacion", "compania", "organization"],
  language: ["language", "idioma", "lang"],
  message: ["message", "mensaje", "notes", "notas", "comentario", "comentarios"],
  sourceRef: ["id", "external id", "source ref", "referencia", "ref"],
};

/** Suggests a header for each field from its name. Unmatched fields are omitted. */
export function suggestMapping(headers: string[]): Partial<Record<LeadCsvField, string>> {
  const folded = headers.map((header) => ({ header, key: foldHeader(header) }));
  const mapping: Partial<Record<LeadCsvField, string>> = {};
  for (const field of LEAD_CSV_FIELDS) {
    const match = folded.find((entry) => HEADER_SYNONYMS[field].includes(entry.key));
    if (match) mapping[field] = match.header;
  }
  return mapping;
}

// ---------------------------------------------------------------- rows

export type CsvRowStatus = "ready" | "duplicate" | "invalid";
export type CsvDuplicateReason = "in_file" | "existing_lead";

export interface CsvPreviewRow {
  line: number;
  status: CsvRowStatus;
  duplicateReason: CsvDuplicateReason | null;
  /** The identifier already belongs to a known contact. The row still imports, linked to that contact. */
  knownContact: boolean;
  errors: string[];
  values: Partial<Record<LeadCsvField, string>>;
}

interface ParsedRow extends CsvPreviewRow {
  sourceRef: string | null;
  identityKey: string | null;
}

export function csvImportService(db: Db) {
  const intake = leadIntakeService(db);

  function resolveMapping(headers: string[], explicit: CsvImportBody["mapping"]) {
    const auto = suggestMapping(headers);
    const resolved: Partial<Record<LeadCsvField, number>> = {};
    for (const field of LEAD_CSV_FIELDS) {
      const header = explicit?.[field] ?? auto[field];
      if (!header) continue;
      const index = headers.indexOf(header);
      if (index === -1) throw badRequest(`Mapped column not found in file: ${header}`);
      resolved[field] = index;
    }
    return resolved;
  }

  function buildRows(body: CsvImportBody) {
    const { rows: table, delimiter } = parseCsv(body.csv);
    if (table.length < 2) throw badRequest("CSV needs a header row and at least one data row");
    const headers = table[0].map((header) => header.trim());
    const dataRows = table.slice(1);
    if (dataRows.length > CSV_MAX_ROWS) throw badRequest(`CSV has more than ${CSV_MAX_ROWS} rows`);
    const mapping = resolveMapping(headers, body.mapping);
    if (mapping.email === undefined && mapping.phone === undefined) {
      throw badRequest("Map an email or phone column to import leads");
    }

    const seen = new Set<string>();
    const rows: ParsedRow[] = dataRows.map((cells, index) => {
      const values: Partial<Record<LeadCsvField, string>> = {};
      for (const field of LEAD_CSV_FIELDS) {
        const column = mapping[field];
        if (column === undefined) continue;
        const value = (cells[column] ?? "").trim();
        if (value) values[field] = value;
      }
      const errors: string[] = [];
      const email = normalizeEmail(values.email ?? null);
      const phone = normalizePhoneE164(values.phone ?? null);
      if (values.email && !email) errors.push("Invalid email");
      if (values.phone && !phone) errors.push("Invalid phone");
      if (!email && !phone) errors.push("Missing a valid email or phone");
      const identityKey = email ?? phone ?? null;
      const sourceRef = values.sourceRef
        ?? (identityKey ? `row:${createHash("sha256").update(identityKey).digest("hex").slice(0, 32)}` : null);
      let duplicateReason: CsvDuplicateReason | null = null;
      if (errors.length === 0 && sourceRef) {
        if (seen.has(sourceRef)) duplicateReason = "in_file";
        seen.add(sourceRef);
      }
      return {
        line: index + 2,
        status: errors.length > 0 ? "invalid" : duplicateReason ? "duplicate" : "ready",
        duplicateReason,
        knownContact: false,
        errors,
        values,
        sourceRef,
        identityKey,
      };
    });
    return { headers, mapping, rows, delimiter };
  }

  /** Marks rows whose sourceRef already exists as csv leads, and rows whose identifier is a known contact. */
  async function markExisting(companyId: string, rows: ParsedRow[]) {
    const usable = rows.filter((row) => row.status !== "invalid");
    const refs = [...new Set(usable.map((row) => row.sourceRef).filter((ref): ref is string => !!ref))];
    const identifiers = [...new Set(usable.map((row) => row.identityKey).filter((key): key is string => !!key))];

    const existingRefs = new Set<string>();
    if (refs.length > 0) {
      const found = await db
        .select({ sourceRef: leads.sourceRef })
        .from(leads)
        .where(and(eq(leads.companyId, companyId), eq(leads.source, "csv"), inArray(leads.sourceRef, refs)));
      for (const row of found) if (row.sourceRef) existingRefs.add(row.sourceRef);
    }
    const knownIdentifiers = new Set<string>();
    if (identifiers.length > 0) {
      const found = await db
        .select({ identifier: contactIdentities.identifier })
        .from(contactIdentities)
        .where(and(eq(contactIdentities.companyId, companyId), inArray(contactIdentities.identifier, identifiers)));
      for (const row of found) knownIdentifiers.add(row.identifier);
    }
    for (const row of usable) {
      if (row.sourceRef && existingRefs.has(row.sourceRef) && row.duplicateReason !== "in_file") {
        row.duplicateReason = "existing_lead";
        row.status = "duplicate";
      }
      row.knownContact = row.identityKey !== null && knownIdentifiers.has(row.identityKey);
    }
  }

  function toPreviewRow(row: ParsedRow): CsvPreviewRow {
    return {
      line: row.line,
      status: row.status,
      duplicateReason: row.duplicateReason,
      knownContact: row.knownContact,
      errors: row.errors,
      values: row.values,
    };
  }

  return {
    /** Parses and classifies every row without writing anything. */
    async preview(companyId: string, body: CsvImportBody) {
      const { headers, mapping, rows, delimiter } = buildRows(body);
      await markExisting(companyId, rows);
      const count = (status: CsvRowStatus) => rows.filter((row) => row.status === status).length;
      return {
        delimiter,
        headers,
        mapping: Object.fromEntries(
          LEAD_CSV_FIELDS.map((field) => [field, mapping[field] === undefined ? null : headers[mapping[field]!]]),
        ),
        totals: {
          rows: rows.length,
          ready: count("ready"),
          duplicate: count("duplicate"),
          invalid: count("invalid"),
          knownContacts: rows.filter((row) => row.knownContact).length,
        },
        rows: rows.slice(0, CSV_PREVIEW_ROWS).map(toPreviewRow),
        previewLimit: CSV_PREVIEW_ROWS,
      };
    },

    /**
     * Imports what the preview marks as ready. Duplicates are skipped unless
     * skipDuplicates is false, and the intake service still refuses a repeated sourceRef.
     */
    async commit(companyId: string, body: CsvImportBody) {
      const { rows } = buildRows(body);
      await markExisting(companyId, rows);
      let imported = 0;
      let skipped = 0;
      const errors: Array<{ line: number; message: string }> = [];
      for (const row of rows) {
        if (row.status === "invalid") {
          skipped += 1;
          continue;
        }
        if (row.status === "duplicate" && body.skipDuplicates) {
          skipped += 1;
          continue;
        }
        try {
          const email = normalizeEmail(row.values.email ?? null);
          const phone = normalizePhoneE164(row.values.phone ?? null);
          const result = await intake.ingest(companyId, {
            source: "csv",
            sourceRef: row.sourceRef,
            payload: {
              name: row.values.name ?? null,
              company: row.values.company ?? null,
              email,
              phone,
              message: row.values.message ?? null,
              line: row.line,
            },
            identity: { email, phone },
            language: row.values.language ?? null,
          });
          if (result.created) imported += 1;
          else skipped += 1;
        } catch (error) {
          errors.push({ line: row.line, message: error instanceof Error ? error.message : "Import failed" });
        }
      }
      return { imported, skipped, errors, total: rows.length };
    },
  };
}

/** Name the stub exported; kept as an alias so existing imports keep working. */
export const leadCsvImportService = csvImportService;
