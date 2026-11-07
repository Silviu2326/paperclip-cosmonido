import {
  authSessionSchema,
  currentUserProfileSchema,
  type AuthSession,
  type CurrentUserProfile,
  type UpdateCurrentUserProfile,
} from "@paperclipai/shared";
import { redactUrlSecrets } from "@/lib/redact-url-secrets";
import { tenantSessionRecovery } from "@/lib/tenant-session-recovery";
import { readApiJson } from "./response";

type AuthErrorBody =
  | {
    code?: string;
    message?: string;
    error?: string | { code?: string; message?: string };
  }
  | null;

export interface SignOutResult {
  success?: boolean;
  redirectTo?: string;
}

export type AuthSessionDevice = {
  id: string;
  token: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type TwoFactorSignInResult = { twoFactorRedirect?: boolean; twoFactorMethods?: string[] };
export type AuthProviderAvailability = { emailDeliveryConfigured: boolean; emailVerificationRequired: boolean; googleEnabled: boolean };

export class AuthApiError extends Error {
  status: number;
  code: string | null;
  body: unknown;

  constructor(message: string, status: number, body: unknown, code: string | null = null) {
    super(message);
    this.name = "AuthApiError";
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

function toSession(value: unknown): AuthSession | null {
  const direct = authSessionSchema.safeParse(value);
  if (direct.success) return direct.data;

  if (!value || typeof value !== "object") return null;
  const nested = authSessionSchema.safeParse((value as Record<string, unknown>).data);
  return nested.success ? nested.data : null;
}

function extractAuthError(payload: AuthErrorBody, status: number) {
  const nested =
    payload?.error && typeof payload.error === "object"
      ? payload.error
      : null;
  const code =
    typeof nested?.code === "string"
      ? nested.code
      : typeof payload?.code === "string"
        ? payload.code
        : null;
  const message =
    typeof nested?.message === "string" && nested.message.trim().length > 0
      ? nested.message
      : typeof payload?.message === "string" && payload.message.trim().length > 0
        ? payload.message
        : typeof payload?.error === "string" && payload.error.trim().length > 0
          ? payload.error
          : `Request failed: ${status}`;

  return new AuthApiError(message, status, payload, code);
}

// Rich diagnostics for auth requests. Network-layer failures (Safari
// "Load failed" / Chrome "Failed to fetch") throw a TypeError *before* any
// HTTP response, so they are indistinguishable from a bad password in the UI
// unless we log the resolved request URL + origin here. See PAP-13466.
function resolveAuthUrl(path: string) {
  const relative = `/api/auth${path}`;
  try {
    return new URL(relative, window.location.origin).href;
  } catch {
    return relative;
  }
}

function logAuthNetworkFailure(method: string, path: string, error: unknown) {
  // eslint-disable-next-line no-console
  console.error("[auth] request failed at the network layer (no HTTP response)", {
    method,
    requestUrl: resolveAuthUrl(path),
    pageOrigin: typeof window !== "undefined" ? window.location.origin : "(no window)",
    pageHref: typeof window !== "undefined" ? redactUrlSecrets(window.location.href) : "(no window)",
    credentials: "include",
    online: typeof navigator !== "undefined" ? navigator.onLine : "(no navigator)",
    errorName: error instanceof Error ? error.name : typeof error,
    errorMessage: error instanceof Error ? error.message : String(error),
    error,
    hint:
      "This means the browser never got a response from the server. Common causes: " +
      "the page origin differs from the API host (mixed http/https, wrong hostname/port, " +
      "or a proxy/tunnel that only forwards the page but not /api), an SSL error, or the " +
      "connection was reset. A wrong password would instead return HTTP 401, not this.",
  });
}

function logAuthHttpError(method: string, path: string, status: number, statusText: string, body: unknown) {
  // eslint-disable-next-line no-console
  console.error("[auth] request returned an error status", {
    method,
    requestUrl: resolveAuthUrl(path),
    status,
    statusText,
    body: "[auth response omitted]",
  });
}

async function authPost(path: string, body: Record<string, unknown>): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`/api/auth${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (networkError) {
    logAuthNetworkFailure("POST", path, networkError);
    throw networkError;
  }
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const recovery = tenantSessionRecovery.recoverIfNeeded(res.status, payload);
    if (recovery) return recovery;
    logAuthHttpError("POST", path, res.status, res.statusText, payload);
    throw extractAuthError(payload as AuthErrorBody, res.status);
  }
  return payload;
}

async function authPatch<T>(path: string, body: Record<string, unknown>, parse: (value: unknown) => T): Promise<T> {
  const res = await fetch(`/api/auth${path}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const recovery = tenantSessionRecovery.recoverIfNeeded(res.status, payload);
    if (recovery) return recovery;
    throw extractAuthError(payload as AuthErrorBody, res.status);
  }
  return parse(payload);
}

export const authApi = {
  getSession: async (): Promise<AuthSession | null> => {
    const res = await fetch("/api/auth/get-session", {
      credentials: "include",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const payload = await readApiJson(res);
    if (!res.ok) {
      const recovery = tenantSessionRecovery.recoverIfNeeded(res.status, payload);
      if (recovery) return recovery;
      if (res.status === 401) return null;
      throw extractAuthError(payload as AuthErrorBody, res.status);
    }
    const direct = toSession(payload);
    if (direct) return direct;
    const nested = payload && typeof payload === "object" ? toSession((payload as Record<string, unknown>).data) : null;
    return nested;
  },

  getTwoFactorEnabled: async (): Promise<boolean> => {
    const res = await fetch("/api/auth/get-session", { credentials: "include", headers: { Accept: "application/json" }, cache: "no-store" });
    const payload = await readApiJson(res);
    if (!res.ok) throw extractAuthError(payload as AuthErrorBody, res.status);
    if (!payload || typeof payload !== "object") return false;
    const root = payload as Record<string, unknown>;
    const value = root.user && typeof root.user === "object" ? root.user as Record<string, unknown>
      : root.data && typeof root.data === "object" && (root.data as Record<string, unknown>).user && typeof (root.data as Record<string, unknown>).user === "object"
        ? (root.data as Record<string, unknown>).user as Record<string, unknown> : null;
    return value?.twoFactorEnabled === true;
  },

  signInEmail: async (input: { email: string; password: string }): Promise<TwoFactorSignInResult> => {
    return await authPost("/sign-in/email", input) as TwoFactorSignInResult;
  },

  signUpEmail: async (input: { name: string; email: string; password: string; callbackURL?: string }): Promise<void> => {
    await authPost("/sign-up/email", input);
  },

  getProviderAvailability: async (): Promise<AuthProviderAvailability> => {
    const res = await fetch("/api/auth/provider-availability", { credentials: "include", headers: { Accept: "application/json" }, cache: "no-store" });
    const payload = await readApiJson(res);
    if (!res.ok || !payload || typeof payload !== "object") throw new Error("Could not load sign-in options.");
    const value = payload as Record<string, unknown>;
    return {
      emailDeliveryConfigured: value.emailDeliveryConfigured === true,
      emailVerificationRequired: value.emailVerificationRequired === true,
      googleEnabled: value.googleEnabled === true,
    };
  },

  sendVerificationEmail: async (input: { email: string; callbackURL: string }) => {
    await authPost("/send-verification-email", input);
  },

  signInGoogle: async (callbackURL: string): Promise<{ url: string }> => {
    const payload = await authPost("/sign-in/social", { provider: "google", callbackURL });
    const value = payload && typeof payload === "object" ? payload as Record<string, unknown> : null;
    if (!value || typeof value.url !== "string") throw new Error("Google sign-in did not return a redirect URL.");
    return { url: value.url };
  },

  getProfile: async (): Promise<CurrentUserProfile> => {
    const res = await fetch("/api/auth/profile", {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      const recovery = tenantSessionRecovery.recoverIfNeeded(res.status, payload);
      if (recovery) return recovery;
      throw new Error((payload as { error?: string } | null)?.error ?? `Failed to load profile (${res.status})`);
    }
    return currentUserProfileSchema.parse(payload);
  },

  updateProfile: async (input: UpdateCurrentUserProfile): Promise<CurrentUserProfile> =>
    authPatch("/profile", input, (payload) => currentUserProfileSchema.parse(payload)),

  signOut: async (): Promise<SignOutResult | null> => {
    const payload = await authPost("/sign-out", {});
    if (!payload || typeof payload !== "object") return null;

    const result = payload as Record<string, unknown>;
    return {
      ...(typeof result.success === "boolean" ? { success: result.success } : {}),
      ...(typeof result.redirectTo === "string" ? { redirectTo: result.redirectTo } : {}),
    };
  },

  verifyTotp: async (code: string) => authPost("/two-factor/verify-totp", { code, trustDevice: false }),
  verifyBackupCode: async (code: string) => authPost("/two-factor/verify-backup-code", { code, trustDevice: false }),
  enableTotp: async (password: string) => authPost("/two-factor/enable", { password, method: "totp" }),
  disableTwoFactor: async (password: string) => authPost("/two-factor/disable", { password }),
  generateBackupCodes: async (password: string) => authPost("/two-factor/generate-backup-codes", { password }),
  listSessions: async (): Promise<AuthSessionDevice[]> => {
    const res = await fetch("/api/auth/list-sessions", { credentials: "include", headers: { Accept: "application/json" }, cache: "no-store" });
    const payload = await readApiJson(res);
    if (!res.ok) throw extractAuthError(payload as AuthErrorBody, res.status);
    return Array.isArray(payload) ? payload as AuthSessionDevice[] : [];
  },
  revokeSession: async (token: string) => authPost("/revoke-session", { token }),
};
