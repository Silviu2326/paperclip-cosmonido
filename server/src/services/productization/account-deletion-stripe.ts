import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { productAccounts } from "@paperclipai/db";
import type { AccountDeletionProvider } from "./account-deletion.js";

const STRIPE_API = "https://api.stripe.com";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_SUBSCRIPTION_PAGES = 1;
const INACTIVE_SUBSCRIPTION_STATUSES = new Set(["canceled", "incomplete_expired"]);
const STRIPE_API_VERSION = "2026-09-30.endive";

type StripeSubscription = { id: string; customer: string | { id?: string } | null; status: string };
type StripeCustomer = { id?: string; deleted?: boolean; metadata?: Record<string, string> };

async function stripeRequest(path: string, method: "GET" | "DELETE", secret: string, idempotencyKey?: string): Promise<Response> {
  return fetch(`${STRIPE_API}${path}`, {
    method,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${secret}`,
      "Stripe-Version": STRIPE_API_VERSION,
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
  });
}

async function readJson<T>(response: Response, message: string): Promise<T> {
  try { return await response.json() as T; } catch { throw new Error(message); }
}

function customerIdOf(value: StripeSubscription["customer"]): string | null {
  if (typeof value === "string") return value;
  return value && typeof value.id === "string" ? value.id : null;
}

/** Server-only adapter matching billing config. DB row-locking revalidates customer ownership across Stripe I/O. */
export function createAccountDeletionStripeProvider(db: Db, env: NodeJS.ProcessEnv = process.env): AccountDeletionProvider | undefined {
  const secret = env.STRIPE_SECRET_KEY?.trim();
  if (!secret) return undefined;
  return {
    async deleteCustomer(customerId, accountId) {
      return db.transaction(async (tx) => {
        const [account] = await tx.select({ id: productAccounts.id, stripeCustomerId: productAccounts.stripeCustomerId })
          .from(productAccounts).where(eq(productAccounts.id, accountId)).for("update").limit(1);
        if (!account || account.stripeCustomerId !== customerId) throw new Error("Stripe customer is no longer bound to this account.");

        const customerResponse = await stripeRequest(`/v1/customers/${encodeURIComponent(customerId)}`, "GET", secret);
        if (customerResponse.status === 404) throw new Error("Stripe did not confirm the bound customer's deletion.");
        if (!customerResponse.ok) throw new Error("Stripe customer verification failed.");
        const customer = await readJson<StripeCustomer>(customerResponse, "Stripe customer response was invalid.");
        if (customer.id !== customerId) throw new Error("Stripe returned a customer outside the requested account binding.");
        const metadataAccountId = customer.metadata?.productAccountId;
        if (metadataAccountId && metadataAccountId !== accountId) throw new Error("Stripe customer metadata does not match the commercial account.");
        if (customer.deleted === true) return { activeSubscription: false };

        let startingAfter: string | null = null;
        for (let page = 0; page < MAX_SUBSCRIPTION_PAGES; page += 1) {
          const params = new URLSearchParams({ customer: customerId, status: "all", limit: "100" });
          if (startingAfter) params.set("starting_after", startingAfter);
          const response = await stripeRequest(`/v1/subscriptions?${params.toString()}`, "GET", secret);
          if (!response.ok) throw new Error("Stripe subscription verification failed.");
          const payload = await readJson<{ data?: unknown; has_more?: unknown }>(response, "Stripe subscription response was invalid.");
          if (!Array.isArray(payload.data) || typeof payload.has_more !== "boolean") throw new Error("Stripe subscription response was incomplete.");
          const subscriptions = payload.data as StripeSubscription[];
          for (const subscription of subscriptions) {
            if (!subscription || typeof subscription.id !== "string" || !subscription.id.startsWith("sub_") || typeof subscription.status !== "string") {
              throw new Error("Stripe returned a malformed subscription record.");
            }
            if (customerIdOf(subscription.customer) !== customerId) throw new Error("Stripe returned a subscription outside the requested customer.");
            // Unknown statuses are held as active. Only the two terminal states
            // are safe to ignore, so a new Stripe status fails closed.
            if (!INACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status)) return { activeSubscription: true };
          }
          if (!payload.has_more) break;
          const lastId = subscriptions.at(-1)?.id;
          if (!lastId || page === MAX_SUBSCRIPTION_PAGES - 1) throw new Error("Stripe subscription history exceeds the bounded deletion scan.");
          startingAfter = lastId;
        }

        const response = await stripeRequest(`/v1/customers/${encodeURIComponent(customerId)}`, "DELETE", secret, `paperclip-account-delete:${accountId}:${customerId}`);
        if (response.status === 404) throw new Error("Stripe did not confirm the bound customer's deletion.");
        if (!response.ok) throw new Error("Stripe customer deletion failed.");
        const deleted = await readJson<{ id?: unknown; deleted?: unknown }>(response, "Stripe customer deletion response was invalid.");
        if (deleted.id !== customerId || deleted.deleted !== true) throw new Error("Stripe did not confirm deletion of the bound customer.");
        return { activeSubscription: false };
      });
    },
  };
}
