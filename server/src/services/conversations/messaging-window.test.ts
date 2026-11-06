import { describe, expect, it } from "vitest";
import { MESSAGING_WINDOW_MS, messagingWindow } from "./messaging-window.js";

const now = new Date("2026-11-06T12:00:00Z");

describe("customer messaging window", () => {
  it.each(["whatsapp", "messenger", "instagram"])("expires exactly at 24 hours on %s", (channel) => {
    const inbound = new Date(now.getTime() - MESSAGING_WINDOW_MS);
    expect(messagingWindow({ channel, lastInboundAt: inbound }, now)).toMatchObject({ freeReplyAllowed: false, expiresAt: now.toISOString(), reason: "expired" });
    expect(messagingWindow({ channel, lastInboundAt: new Date(inbound.getTime() + 1).toISOString() }, now).freeReplyAllowed).toBe(true);
  });

  it.each([null, "invalid", "2026-11-07T12:00:00Z"])("fails closed for missing, invalid or future inbound time: %s", (lastInboundAt) => {
    expect(messagingWindow({ channel: "whatsapp", lastInboundAt }, now)).toMatchObject({ freeReplyAllowed: false, requiresTemplate: true });
  });

  it.each(["email", "webchat", "telegram", "sms", "voice"])("does not restrict %s", (channel) => {
    expect(messagingWindow({ channel }, now)).toMatchObject({ freeReplyAllowed: true, expiresAt: null, requiresTemplate: false, reason: "unrestricted" });
  });

  it("reopens on a fresh inbound and only recommends templates for WhatsApp", () => {
    expect(messagingWindow({ channel: "whatsapp", lastInboundAt: now }, now).requiresTemplate).toBe(false);
    expect(messagingWindow({ channel: "instagram" }, now).requiresTemplate).toBe(false);
  });
});
