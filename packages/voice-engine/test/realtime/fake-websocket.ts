import type { WebSocketLike } from "../../src/core/types.js";

export class FakeWebSocket implements WebSocketLike {
  readyState = 0; binaryType = "arraybuffer"; sent: string[] = [];
  private listeners = new Map<string, Array<(event: any) => void>>();
  addEventListener(type: "open" | "message" | "close" | "error", listener: (event: any) => void) { const a = this.listeners.get(type) ?? []; a.push(listener); this.listeners.set(type, a); }
  removeEventListener(type: "open" | "message" | "close" | "error", listener: (event: any) => void) { this.listeners.set(type, (this.listeners.get(type) ?? []).filter(x => x !== listener)); }
  send(data: string | ArrayBufferLike | ArrayBufferView) { this.sent.push(String(data)); }
  close(code = 1000, reason = "") { this.readyState = 3; this.push("close", { code, reason }); }
  open() { this.readyState = 1; this.push("open", {}); }
  message(value: unknown) { this.push("message", { data: JSON.stringify(value) }); }
  push(type: string, event: any) { for (const fn of this.listeners.get(type) ?? []) fn(event); }
}
