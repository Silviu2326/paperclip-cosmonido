import { registerConversationTransport } from "../messages.js";
import { webchatTransport } from "./webchat.js";

// Importing this module registers the web chat transport. app.ts imports it once (integration).
export function registerWebchatTransport() {
  registerConversationTransport(webchatTransport);
}

registerWebchatTransport();
