import { describe, expect, it } from "vitest";
import { createTwilioMediaStreamTransport, parseTwilioMessage, serializeTwilioMessage } from "../../src/agent/transports/twilio.js";
class FakeSocket {
  readyState = 1; binaryType = ""; sent: string[] = []; listeners = new Map<string, ((e: any) => void)[]>();
  send(v: string) { this.sent.push(v); } close() { this.fire("close", {}); }
  addEventListener(t: "open" | "message" | "close" | "error", f: (e: any) => void) { this.listeners.set(t, [...(this.listeners.get(t) ?? []), f]); }
  fire(t: string, e: any) { for (const f of this.listeners.get(t) ?? []) f(e); }
}
describe("Twilio media transport", () => {
  it("parses messages and emits media, mark and clear protocol messages", async () => { const socket = new FakeSocket(); const transport = createTwilioMediaStreamTransport(socket); socket.fire("message", { data: JSON.stringify({ event: "start", start: { streamSid: "MZ1", callSid: "CA1", customParameters: { x: "y" } } }) }); expect((await transport.info).callSid).toBe("CA1"); transport.sendAudio({ data: new Uint8Array(160), encoding: "mulaw", sampleRate: 8000, channels: 1 }); const first = parseTwilioMessage(socket.sent[0]!); expect(first.event).toBe("media"); transport.mark("m1"); transport.clearPlayback(); expect(JSON.parse(serializeTwilioMessage({ event: "clear" })).event).toBe("clear"); await transport.close(); });
});
