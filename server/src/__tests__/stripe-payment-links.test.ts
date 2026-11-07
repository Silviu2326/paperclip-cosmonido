import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createPaymentLink, verifyStripeSignature } from "../services/stripe-payment-links.js";

const secret = "whsec_test_secret";
const body = Buffer.from(JSON.stringify({ id: "evt_1", type: "checkout.session.completed" }));

function signature(payload: Buffer, timestamp: number, key = secret) {
  const v1 = createHmac("sha256", key).update(`${timestamp}.`).update(payload).digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

describe("verifyStripeSignature", () => {
  const now = 1_800_000_000;

  it("accepts a correctly signed payload within tolerance", () => {
    expect(verifyStripeSignature({ rawBody: body, header: signature(body, now), secret, nowSeconds: now })).toBe(true);
  });

  it("accepts when any v1 entry matches (key rotation)", () => {
    const valid = signature(body, now).split(",v1=")[1]!;
    const header = `t=${now},v1=${"0".repeat(64)},v1=${valid}`;
    expect(verifyStripeSignature({ rawBody: body, header, secret, nowSeconds: now })).toBe(true);
  });

  it("rejects a tampered body", () => {
    const tampered = Buffer.from(body.toString().replace("evt_1", "evt_2"));
    expect(verifyStripeSignature({ rawBody: tampered, header: signature(body, now), secret, nowSeconds: now })).toBe(false);
  });

  it("rejects a signature made with another secret", () => {
    expect(verifyStripeSignature({ rawBody: body, header: signature(body, now, "whsec_other"), secret, nowSeconds: now })).toBe(false);
  });

  it("rejects a timestamp older than the tolerance", () => {
    const old = now - 301;
    expect(verifyStripeSignature({ rawBody: body, header: signature(body, old), secret, nowSeconds: now })).toBe(false);
    expect(verifyStripeSignature({ rawBody: body, header: signature(body, old), secret, nowSeconds: now, toleranceSeconds: 400 })).toBe(true);
  });

  it("rejects a timestamp too far in the future", () => {
    expect(verifyStripeSignature({ rawBody: body, header: signature(body, now + 301), secret, nowSeconds: now })).toBe(false);
  });

  it("rejects missing or malformed headers", () => {
    expect(verifyStripeSignature({ rawBody: body, header: "", secret, nowSeconds: now })).toBe(false);
    expect(verifyStripeSignature({ rawBody: body, header: `t=${now}`, secret, nowSeconds: now })).toBe(false);
    expect(verifyStripeSignature({ rawBody: body, header: `t=${now},v1=zz`, secret, nowSeconds: now })).toBe(false);
    expect(verifyStripeSignature({ rawBody: body, header: signature(body, now), secret: "", nowSeconds: now })).toBe(false);
  });
});

describe("createPaymentLink", () => {
  it("creates a price and then a payment link with form-encoded bodies and bearer auth", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      if (String(url).endsWith("/v1/prices")) return jsonResponse({ id: "price_123" });
      return jsonResponse({ id: "plink_123", url: "https://buy.stripe.com/test_123" });
    }) as unknown as typeof fetch;

    const link = await createPaymentLink({
      secretKey: "sk_test_abc",
      amountCents: 50000,
      currency: "EUR",
      name: "Señal: CRM",
      metadata: { proposalId: "11111111-1111-4111-8111-111111111111", companyId: "22222222-2222-4222-8222-222222222222" },
      fetch: fetchMock,
      apiBase: "https://stripe.test",
    });

    expect(link).toEqual({ id: "plink_123", url: "https://buy.stripe.com/test_123" });
    expect(calls.map((call) => call.url)).toEqual(["https://stripe.test/v1/prices", "https://stripe.test/v1/payment_links"]);
    for (const call of calls) {
      expect(call.init.method).toBe("POST");
      expect(call.init.headers).toMatchObject({ Authorization: "Bearer sk_test_abc", "Content-Type": "application/x-www-form-urlencoded" });
    }
    const priceBody = new URLSearchParams(String(calls[0]!.init.body));
    expect(priceBody.get("currency")).toBe("eur");
    expect(priceBody.get("unit_amount")).toBe("50000");
    expect(priceBody.get("product_data[name]")).toBe("Señal: CRM");
    const linkBody = new URLSearchParams(String(calls[1]!.init.body));
    expect(linkBody.get("line_items[0][price]")).toBe("price_123");
    expect(linkBody.get("line_items[0][quantity]")).toBe("1");
    expect(linkBody.get("metadata[proposalId]")).toBe("11111111-1111-4111-8111-111111111111");
    expect(linkBody.get("metadata[companyId]")).toBe("22222222-2222-4222-8222-222222222222");
  });

  it("surfaces Stripe errors without leaking the key", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: { message: "No such price" } }, 400)) as unknown as typeof fetch;
    await expect(createPaymentLink({
      secretKey: "sk_test_abc",
      amountCents: 100,
      currency: "EUR",
      name: "Señal",
      metadata: { proposalId: "p", companyId: "c" },
      fetch: fetchMock,
    })).rejects.toThrow(/Stripe \/v1\/prices failed \(400\): No such price/);
  });

  it("rejects non-positive amounts before calling Stripe", async () => {
    const fetchMock = vi.fn() as unknown as typeof fetch;
    await expect(createPaymentLink({ secretKey: "k", amountCents: 0, currency: "EUR", name: "x", metadata: { proposalId: "p", companyId: "c" }, fetch: fetchMock })).rejects.toThrow(/positive/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
