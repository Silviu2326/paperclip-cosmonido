import type { Db } from "@paperclipai/db";
import { registerConversationTransport } from "../messages.js";
import { createMetaTransport } from "./meta.js";
import { createTelegramTransport } from "./telegram.js";
import { createTwilioTransport } from "./twilio.js";

// Registers the customer channel transports (Meta, Telegram, Twilio). app.ts calls this once at
// boot, after the database is created. Registration is process-wide: a later call replaces the
// transports for the same channels.
export function registerChannelTransports(db: Db) {
  registerConversationTransport(createMetaTransport(db));
  registerConversationTransport(createTelegramTransport(db));
  registerConversationTransport(createTwilioTransport(db));
}
