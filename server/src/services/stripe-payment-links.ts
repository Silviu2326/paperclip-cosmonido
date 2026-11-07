import { createHmac, timingSafeEqual } from "node:crypto";

/** Sprint 3 WP8: minimal Stripe REST client (no SDK). Used for deposit payment links and webhook signatures. */

const STRIPE_API_BASE = "https://api.stripe.com";

export interface StripePaymentLinkInput {
  secretKey: string;
  amountCents: number;
  currency: string;
  name: string;
  metadata: { proposalId: string; companyId: string };
  fetch?: typeof fetch;
  apiBase?: string;
}

export interface StripePaymentLink {
  id: string;
  url: string;
}

function encodeForm(fields: Array<[string, string]>) {
  const params = new URLSearchParams();
  for (const [key, value] of fields) params.append(key, value);
  return params;
}

async function stripePost(
  fetchImpl: typeof fetch,
  apiBase: string,
  secretKey: string,
  path: string,
  body: URLSearchParams,
): Promise<Record<string, unknown>> {
  const response = await fetchImpl(`${apiBase}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(`Stripe ${path} failed (${response.status})${payload.error?.message ? `: ${payload.error.message}` : ""}`);
  }
  return payload;
}

/**
 * Creates a one-off price and a Payment Link for a proposal deposit.
 * The metadata carries proposalId and companyId so the webhook can find the owning company.
 */
export async function createPaymentLink(input: StripePaymentLinkInput): Promise<StripePaymentLink> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error("Stripe payment link amount must be a positive integer number of cents");
  }
  const fetchImpl = input.fetch ?? fetch;
  const apiBase = input.apiBase ?? STRIPE_API_BASE;
  const currency = input.currency.toLowerCase();

  const price = await stripePost(fetchImpl, apiBase, input.secretKey, "/v1/prices", encodeForm([
    ["currency", currency],
    ["unit_amount", String(input.amountCents)],
    ["product_data[name]", input.name.slice(0, 250)],
  ]));
  const priceId = typeof price.id === "string" ? price.id : null;
  if (!priceId) throw new Error("Stripe did not return a price id");

  const fields: Array<[string, string]> = [
    ["line_items[0][price]", priceId],
    ["line_items[0][quantity]", "1"],
    ["metadata[proposalId]", input.metadata.proposalId],
    ["metadata[companyId]", input.metadata.companyId],
  ];
  const link = await stripePost(fetchImpl, apiBase, input.secretKey, "/v1/payment_links", encodeForm(fields));
  if (typeof link.id !== "string" || typeof link.url !== "string") {
    throw new Error("Stripe did not return a payment link");
  }
  return { id: link.id, url: link.url };
}

export interface VerifyStripeSignatureInput {
  rawBody: Buffer;
  header: string;
  secret: string;
  toleranceSeconds?: number;
  /** Unix seconds; defaults to the current time. Injectable for tests. */
  nowSeconds?: number;
}

/**
 * Verifies a `Stripe-Signature` header (`t=<unix>,v1=<hex>[,v1=...]`).
 * The signed payload is `${t}.${rawBody}`; comparison is timing-safe.
 */
export function verifyStripeSignature(input: VerifyStripeSignatureInput): boolean {
  const tolerance = input.toleranceSeconds ?? 300;
  if (!input.header || !input.secret) return false;

  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of input.header.split(",")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key === "t") {
      if (!/^\d+$/.test(value)) return false;
      timestamp = Number(value);
    } else if (key === "v1") {
      signatures.push(value);
    }
  }
  if (timestamp === null || signatures.length === 0) return false;

  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > tolerance) return false;

  const expected = createHmac("sha256", input.secret)
    .update(`${timestamp}.`)
    .update(input.rawBody)
    .digest();

  return signatures.some((signature) => {
    if (!/^[0-9a-fA-F]+$/.test(signature) || signature.length !== expected.length * 2) return false;
    const provided = Buffer.from(signature, "hex");
    return provided.length === expected.length && timingSafeEqual(provided, expected);
  });
}
