import type { Db } from "@paperclipai/db";
import type { EnrichmentResult, LeadEnrichInput } from "@paperclipai/shared";
import { unprocessable } from "../errors.js";
import { costService } from "./costs.js";

export const NO_ENRICHMENT_CONNECTION_MESSAGE = "No enrichment connection configured (Exa, Firecrawl or Tavily)";

export interface EnrichmentSearchResult {
  url: string;
  title?: string | null;
  snippet?: string | null;
}

export interface EnrichmentProvider {
  id: "exa" | "firecrawl" | "tavily";
  search: (query: string) => Promise<{ results: EnrichmentSearchResult[]; costCents: number }>;
}

export interface EnrichmentActor {
  agentId?: string | null;
  runId?: string | null;
  userId?: string | null;
}

export interface EnrichmentDeps {
  /** Ordered search providers. Empty means no enrichment connection is configured. */
  providers?: EnrichmentProvider[];
  now?: () => Date;
}

const DOMAIN_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Derives a registrable-looking domain from an email address, URL or bare domain. Returns null when none is found. */
export function deriveDomain(query: string): string | null {
  const value = query.trim().toLowerCase();
  if (!value) return null;
  let host: string;
  if (value.includes("@") && !value.includes("://")) {
    host = value.slice(value.lastIndexOf("@") + 1);
  } else if (/^https?:\/\//.test(value)) {
    try {
      host = new URL(value).hostname;
    } catch {
      return null;
    }
  } else {
    host = value.split(/[/?#]/)[0] ?? "";
  }
  host = host.replace(/:\d+$/, "").replace(/\.$/, "").replace(/^www\./, "");
  return DOMAIN_PATTERN.test(host) ? host : null;
}

const SECTOR_KEYWORDS: Array<[string, string[]]> = [
  ["software", ["software", "saas", "platform", "plataforma"]],
  ["consulting", ["consulting", "consultoría", "consultora", "consultancy"]],
  ["marketing", ["marketing", "advertising", "agencia de publicidad", "agency"]],
  ["finance", ["finance", "fintech", "banking", "banca", "seguros", "insurance"]],
  ["health", ["health", "salud", "clinic", "clínica", "healthcare"]],
  ["education", ["education", "educación", "training", "formación", "academy"]],
  ["retail", ["retail", "ecommerce", "e-commerce", "tienda", "shop"]],
  ["manufacturing", ["manufacturing", "fabricación", "industrial", "factory"]],
];

const SIGNAL_KEYWORDS: Array<[string, string[]]> = [
  ["funding", ["funding", "raised", "series a", "series b", "ronda de", "inversión"]],
  ["hiring", ["hiring", "careers", "vacantes", "contratando", "we are hiring"]],
  ["expansion", ["expands", "expansion", "nueva sede", "opens new", "new office"]],
  ["launch", ["launches", "launch", "lanza", "lanzamiento", "new product"]],
];

const SIZE_PATTERNS: RegExp[] = [
  /(\d{1,3}(?:[.,]\d{3})*|\d+)\s*(?:-|–|to|a)\s*(\d{1,3}(?:[.,]\d{3})*|\d+)\s+(?:employees|empleados|personas)/i,
  /(\d{1,3}(?:[.,]\d{3})*|\d+)\+?\s+(?:employees|empleados|personas)/i,
];

function sizeFrom(text: string): string | null {
  const range = SIZE_PATTERNS[0]!.exec(text);
  if (range) return `${range[1]}-${range[2]}`;
  const single = SIZE_PATTERNS[1]!.exec(text);
  return single ? `${single[1]}+` : null;
}

/**
 * Heuristic enrichment from search titles and snippets. Keyword lists are deliberately simple:
 * the agent reviews the sources; this only proposes company, size, sector and signals.
 */
export function summarizeSearchResults(domain: string, results: Array<EnrichmentSearchResult & { provider: string }>) {
  const corpus = results.map((result) => `${result.title ?? ""} ${result.snippet ?? ""}`).join(" \n ");
  const lower = corpus.toLowerCase();
  const ownSite = results.find((result) => {
    try {
      return new URL(result.url).hostname.replace(/^www\./, "") === domain;
    } catch {
      return false;
    }
  });
  const company = ownSite?.title ? ownSite.title.split(/\s[|–—-]\s/)[0]!.trim() || null : null;
  const sector = SECTOR_KEYWORDS.find(([, words]) => words.some((word) => lower.includes(word)))?.[0] ?? null;
  const signals = SIGNAL_KEYWORDS.filter(([, words]) => words.some((word) => lower.includes(word))).map(([name]) => name);
  return { company, size: sizeFrom(corpus), sector, signals };
}

export function enrichmentService(db: Db, deps: EnrichmentDeps = {}) {
  const providers = deps.providers ?? [];
  const now = deps.now ?? (() => new Date());

  async function enrich(companyId: string, input: LeadEnrichInput, actor: EnrichmentActor): Promise<EnrichmentResult> {
    const domain = deriveDomain(input.query);
    if (!domain) throw unprocessable("Indica un dominio o un correo válido para enriquecer");
    if (providers.length === 0) throw unprocessable(NO_ENRICHMENT_CONNECTION_MESSAGE);
    // Cost receipts for enrichment are attributed to an agent; the cost validator rejects a null agent.
    if (!actor.agentId) throw unprocessable("El enriquecimiento debe ejecutarlo un agente para registrar su coste");

    let costCents = 0;
    let winner: { provider: EnrichmentProvider; results: EnrichmentSearchResult[] } | null = null;
    const query = `${domain} company profile`;
    for (const provider of providers) {
      const response = await provider.search(query);
      costCents += response.costCents;
      if (response.results.length > 0) {
        winner = { provider, results: response.results };
        break;
      }
    }

    const sources = winner
      ? winner.results.map((result) => ({ provider: winner!.provider.id, url: result.url, title: result.title ?? null }))
      : [];
    const summary = summarizeSearchResults(domain, (winner?.results ?? []).map((result) => ({ ...result, provider: winner!.provider.id })));

    if (winner && costCents > 0) {
      const day = now().toISOString().slice(0, 10);
      await costService(db).createEvent(companyId, {
        agentId: actor.agentId,
        usageKind: "enrichment",
        provider: winner.provider.id,
        biller: winner.provider.id,
        billingType: "metered_api",
        costStatus: "reported",
        model: "search",
        costCents,
        occurredAt: now(),
        idempotencyKey: `enrichment:${companyId}:${domain}:${day}`,
      });
    }

    return {
      query: input.query,
      company: summary.company,
      domain,
      size: summary.size,
      sector: summary.sector,
      signals: summary.signals,
      sources,
      costCents,
    };
  }

  return { enrich };
}

export type EnrichmentService = ReturnType<typeof enrichmentService>;
