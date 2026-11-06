import { VoiceEngineError } from "../core/errors.js";
import type { WebSocketFactory, WebSocketLike } from "../core/types.js";

/**
 * Default WebSocket factory backed by the runtime global (Node 22+/24 ships an undici
 * WebSocket that accepts `{ headers, protocols }` as its second argument).
 */
export const defaultWebSocketFactory: WebSocketFactory = (url, options = {}) => {
  const Ctor = (globalThis as { WebSocket?: new (url: string, init?: unknown) => WebSocketLike }).WebSocket;
  if (!Ctor) {
    throw new VoiceEngineError("No global WebSocket available; inject ProviderContext.webSocket", { code: "unsupported" });
  }
  const init = options.headers ? { headers: options.headers, protocols: options.protocols } : options.protocols;
  const socket = new Ctor(url, init);
  socket.binaryType = "arraybuffer";
  return socket;
};

export const WS_READY_STATE = { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 } as const;
