// Web chat constants (pista F). No imports on purpose: the public route and the transport both
// read them at module load, and they sit in an import cycle through routes/public-surface.ts.

export const WEBCHAT_PROVIDER = "webchat";
export const WEBCHAT_SESSION_PURPOSE = "webchat-session";
export const WEBCHAT_SESSION_TTL_SECONDS = 24 * 60 * 60;
export const WEBCHAT_MAX_MESSAGE_CHARS = 4000;
export const WEBCHAT_PAGE_SIZE = 100;
