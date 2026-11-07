import { createHash } from "node:crypto";

const RESEND_EMAILS_URL = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 10_000;

export type AuthEmailConfig = {
  provider: "resend" | null;
  apiKey: string | null;
  from: string | null;
};

export type AuthProviderAvailability = {
  emailDeliveryConfigured: boolean;
  emailVerificationRequired: boolean;
  googleEnabled: boolean;
};

export function resolveAuthEmailConfig(env: NodeJS.ProcessEnv = process.env): AuthEmailConfig {
  const requestedProvider = env.PAPERCLIP_AUTH_EMAIL_PROVIDER?.trim().toLowerCase();
  if (requestedProvider && requestedProvider !== "resend") {
    throw new Error("Unsupported account email provider. PAPERCLIP_AUTH_EMAIL_PROVIDER currently supports only resend.");
  }
  const provider = requestedProvider === "resend" ? "resend" : null;
  const apiKey = env.RESEND_API_KEY?.trim() || null;
  const rawFrom = env.PAPERCLIP_AUTH_EMAIL_FROM?.trim() || null;
  const from = rawFrom && !/[\r\n]/.test(rawFrom) && rawFrom.length <= 320 ? rawFrom : null;
  return { provider, apiKey, from };
}

export function isAuthEmailConfigured(config = resolveAuthEmailConfig()): boolean {
  return config.provider === "resend" && Boolean(config.apiKey && config.from);
}

export function authProviderAvailability(env: NodeJS.ProcessEnv = process.env): AuthProviderAvailability {
  const emailConfig = resolveAuthEmailConfig(env);
  const emailDeliveryConfigured = isAuthEmailConfigured(emailConfig);
  return {
    emailDeliveryConfigured,
    emailVerificationRequired: env.PAPERCLIP_AUTH_REQUIRE_EMAIL_VERIFICATION?.trim().toLowerCase() === "true" && emailDeliveryConfigured,
    googleEnabled: Boolean(env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim()),
  };
}

function verificationIdempotencyKey(token: string): string {
  const digest = createHash("sha256").update(token).digest("hex");
  return `paperclip-auth-verification-${digest}`;
}

function escapeHtml(value: string): string {
  const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return value.replace(/[&<>"']/g, character => entities[character]!);
}

/** Send identity mail only through the fixed Resend API; provider response data is never logged or surfaced. */
export async function sendAuthVerificationEmail(input: { email: string; url: string; token: string }): Promise<void> {
  const config = resolveAuthEmailConfig();
  if (!isAuthEmailConfigured(config) || !config.apiKey || !config.from) {
    throw new Error("Account verification email delivery is not configured.");
  }

  const safeUrl = input.url;
  const escapedUrl = escapeHtml(safeUrl);
  const text = `Verify your Paperclip account by opening this link:\n\n${safeUrl}\n`;
  const html = `<p>Verify your Paperclip account by opening this link:</p><p><a href="${escapedUrl}">Verify email address</a></p>`;
  let response: Response;
  try {
    response = await fetch(RESEND_EMAILS_URL, {
      method: "POST",
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": verificationIdempotencyKey(input.token),
      },
      body: JSON.stringify({
        from: config.from,
        to: [input.email],
        subject: "Verify your Paperclip email address",
        text,
        html,
      }),
    });
  } catch {
    throw new Error("Account verification email delivery failed.");
  }
  if (!response.ok) throw new Error("Account verification email delivery failed.");
}
