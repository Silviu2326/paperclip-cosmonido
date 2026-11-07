import { normalizeDomain, normalizeEmail, normalizePhoneE164 } from "../crm/identity.js";
import {
  CrmProviderResponseError,
  type CanonicalFields,
  type ContactSyncFields,
  type CrmProviderAdapter,
  type CrmSyncEntityKind,
  type CrmSyncOperation,
  type CrmSyncProvider,
  type CustomerSyncFields,
  type ExternalPage,
  type ExternalRecord,
  type ProviderReceipt,
} from "./types.js";

// Provider adapters translate canonical fields <-> provider arguments/answers. The upstream tool
// names are never guessed: administrators map each operation to a tool from the live connection.

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Accepts the parsed result or an MCP envelope ({ structuredContent } / { content: [{ text }] }). */
export function unwrapToolResult(response: unknown): unknown {
  let value = response;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return value;
    }
  }
  if (isRecord(value)) {
    if (value.isError === true) {
      const message = Array.isArray(value.content) && isRecord(value.content[0]) ? text(value.content[0].text) : null;
      throw new CrmProviderResponseError(message ?? "The provider reported an error", { definite: true });
    }
    if (value.structuredContent !== undefined) return unwrapToolResult(value.structuredContent);
    if (Array.isArray(value.content) && isRecord(value.content[0]) && typeof value.content[0].text === "string") {
      try {
        return JSON.parse(value.content[0].text);
      } catch {
        return value;
      }
    }
  }
  return value;
}

function recordId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  return null;
}

function splitName(displayName: string): { first: string | null; last: string | null } {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: null, last: null };
  if (parts.length === 1) return { first: parts[0]!, last: null };
  return { first: parts[0]!, last: parts.slice(1).join(" ") };
}

function projectCustomer(fields: CustomerSyncFields, supportsDomain: boolean): CustomerSyncFields {
  return { name: fields.name.trim(), domain: supportsDomain ? normalizeDomain(fields.domain) : null };
}

// ---------------------------------------------------------------- HubSpot

const HUBSPOT_OBJECT: Record<CrmSyncEntityKind, "companies" | "contacts"> = { customer: "companies", contact: "contacts" };
const HUBSPOT_PROPERTIES: Record<CrmSyncEntityKind, string[]> = {
  customer: ["name", "domain"],
  contact: ["firstname", "lastname", "email", "phone", "jobtitle"],
};
function configuredToolName(kind: CrmSyncEntityKind, operation: CrmSyncOperation, overrides: Record<string, string>): string {
  const key = `${operation}${kind === "customer" ? "Customer" : "Contact"}`;
  const name = overrides[key]?.trim();
  if (!name) throw new CrmProviderResponseError(`Map the live provider tool for ${key} before starting CRM sync`, { definite: true });
  return name;
}

function hubspotContactFields(properties: Json): ContactSyncFields {
  const firstName = text(properties.firstname);
  const lastName = text(properties.lastname);
  const email = normalizeEmail(text(properties.email));
  return {
    firstName,
    lastName,
    displayName: [firstName, lastName].filter(Boolean).join(" ") || email || "HubSpot contact",
    email,
    phone: normalizePhoneE164(text(properties.phone)),
    title: text(properties.jobtitle),
  };
}

function hubspotRecord(kind: CrmSyncEntityKind, value: unknown): ExternalRecord | null {
  if (!isRecord(value)) return null;
  const externalId = recordId(value.id);
  const properties = isRecord(value.properties) ? value.properties : null;
  if (!externalId || !properties) return null;
  const fields: CanonicalFields =
    kind === "customer"
      ? { name: text(properties.name) ?? "", domain: normalizeDomain(text(properties.domain)) }
      : hubspotContactFields(properties);
  return { externalId, updatedAt: text(value.updatedAt) ?? text(properties.hs_lastmodifieddate), fields };
}

const hubspot: CrmProviderAdapter = {
  provider: "hubspot",
  toolName: configuredToolName,
  project(kind, fields) {
    if (kind === "customer") return projectCustomer(fields as CustomerSyncFields, true);
    const contact = fields as ContactSyncFields;
    const names = contact.firstName || contact.lastName ? { first: contact.firstName, last: contact.lastName } : splitName(contact.displayName);
    const email = normalizeEmail(contact.email);
    return {
      firstName: names.first,
      lastName: names.last,
      displayName: [names.first, names.last].filter(Boolean).join(" ") || email || contact.displayName,
      email,
      phone: normalizePhoneE164(contact.phone),
      title: text(contact.title),
    };
  },
  listArguments: (kind, cursor, limit) => ({
    objectType: HUBSPOT_OBJECT[kind],
    limit,
    properties: HUBSPOT_PROPERTIES[kind],
    ...(cursor ? { after: cursor } : {}),
  }),
  parsePage(kind, response): ExternalPage {
    const body = unwrapToolResult(response);
    if (!isRecord(body) || !Array.isArray(body.results)) {
      throw new CrmProviderResponseError("HubSpot answered without a results list");
    }
    const records: ExternalRecord[] = [];
    for (const item of body.results) {
      const record = hubspotRecord(kind, item);
      if (!record) throw new CrmProviderResponseError("HubSpot returned a record without id or properties");
      records.push(record);
    }
    const paging = isRecord(body.paging) && isRecord(body.paging.next) ? text(body.paging.next.after) : null;
    return { records, nextCursor: paging };
  },
  writeArguments(kind, externalId, fields) {
    const projected = hubspot.project(kind, fields);
    const properties: Json =
      kind === "customer"
        ? { name: (projected as CustomerSyncFields).name, domain: (projected as CustomerSyncFields).domain ?? "" }
        : (() => {
            const c = projected as ContactSyncFields;
            // Empty string clears a HubSpot property, so a cleared local field reaches the provider.
            return { firstname: c.firstName ?? "", lastname: c.lastName ?? "", email: c.email ?? "", phone: c.phone ?? "", jobtitle: c.title ?? "" };
          })();
    return {
      objectType: HUBSPOT_OBJECT[kind],
      inputs: [externalId ? { id: externalId, properties } : { properties }],
    };
  },
  parseReceipt(kind, response): ProviderReceipt {
    const body = unwrapToolResult(response);
    const item = isRecord(body) && Array.isArray(body.results) ? body.results[0] : body;
    const externalId = isRecord(item) ? recordId(item.id) : null;
    if (!externalId) throw new CrmProviderResponseError("HubSpot did not return a record id for the write");
    const record = hubspotRecord(kind, item);
    return { externalId, updatedAt: record?.updatedAt ?? (isRecord(item) ? text(item.updatedAt) : null), fields: record?.fields ?? null };
  },
};

// ---------------------------------------------------------------- Pipedrive

function firstValue(value: unknown): string | null {
  if (Array.isArray(value)) {
    const primary = value.find((item) => isRecord(item) && item.primary === true) ?? value[0];
    return isRecord(primary) ? text(primary.value) : text(primary);
  }
  return text(value);
}

function pipedriveRecord(kind: CrmSyncEntityKind, value: unknown): ExternalRecord | null {
  if (!isRecord(value)) return null;
  const externalId = recordId(value.id);
  if (!externalId) return null;
  const updatedAt = text(value.update_time);
  if (kind === "customer") return { externalId, updatedAt, fields: { name: text(value.name) ?? "", domain: null } };
  const email = normalizeEmail(firstValue(value.email));
  return {
    externalId,
    updatedAt,
    fields: {
      firstName: text(value.first_name),
      lastName: text(value.last_name),
      displayName: text(value.name) ?? email ?? "Pipedrive person",
      email,
      phone: normalizePhoneE164(firstValue(value.phone)),
      title: text(value.job_title),
    },
  };
}

function pipedriveBody(response: unknown): Json {
  const body = unwrapToolResult(response);
  if (!isRecord(body)) throw new CrmProviderResponseError("Pipedrive answered with an unreadable body");
  if (body.success === false) throw new CrmProviderResponseError(text(body.error) ?? "Pipedrive reported an error", { definite: true });
  return body;
}

const pipedrive: CrmProviderAdapter = {
  provider: "pipedrive",
  toolName: configuredToolName,
  project(kind, fields) {
    // Organizations have no standard domain field in Pipedrive, so domain is not synced.
    if (kind === "customer") return projectCustomer(fields as CustomerSyncFields, false);
    const contact = fields as ContactSyncFields;
    return {
      firstName: text(contact.firstName),
      lastName: text(contact.lastName),
      displayName: contact.displayName.trim(),
      email: normalizeEmail(contact.email),
      phone: normalizePhoneE164(contact.phone),
      title: text(contact.title),
    };
  },
  listArguments: (_kind, cursor, limit) => ({ limit, start: cursor ? Number(cursor) : 0 }),
  parsePage(kind, response): ExternalPage {
    const body = pipedriveBody(response);
    // `data: null` is how Pipedrive answers an empty collection.
    if (body.data !== null && !Array.isArray(body.data)) throw new CrmProviderResponseError("Pipedrive answered without a data list");
    const records: ExternalRecord[] = [];
    for (const item of (body.data as unknown[] | null) ?? []) {
      const record = pipedriveRecord(kind, item);
      if (!record) throw new CrmProviderResponseError("Pipedrive returned a record without an id");
      records.push(record);
    }
    const pagination = isRecord(body.additional_data) && isRecord(body.additional_data.pagination) ? body.additional_data.pagination : null;
    const more = pagination?.more_items_in_collection === true;
    const next = pagination && typeof pagination.next_start === "number" ? String(pagination.next_start) : null;
    return { records, nextCursor: more ? next : null };
  },
  writeArguments(kind, externalId, fields) {
    const projected = pipedrive.project(kind, fields);
    const args: Json =
      kind === "customer"
        ? { name: (projected as CustomerSyncFields).name }
        : (() => {
            const c = projected as ContactSyncFields;
            return {
              name: c.displayName,
              first_name: c.firstName,
              last_name: c.lastName,
              email: c.email ? [{ value: c.email, primary: true }] : [],
              phone: c.phone ? [{ value: c.phone, primary: true }] : [],
              job_title: c.title,
            };
          })();
    return externalId ? { id: Number.isSafeInteger(Number(externalId)) ? Number(externalId) : externalId, ...args } : args;
  },
  parseReceipt(kind, response): ProviderReceipt {
    const body = pipedriveBody(response);
    const record = pipedriveRecord(kind, body.data);
    if (!record) throw new CrmProviderResponseError("Pipedrive did not return a record id for the write");
    return { externalId: record.externalId, updatedAt: record.updatedAt, fields: record.fields };
  },
};

const ADAPTERS: Record<CrmSyncProvider, CrmProviderAdapter> = { hubspot, pipedrive };

export function crmProviderAdapter(provider: CrmSyncProvider): CrmProviderAdapter {
  return ADAPTERS[provider];
}
