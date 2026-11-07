import { describe, expect, it } from "vitest";
import { classifyProviderResponse } from "./google-calendar.js";

describe("provider receipts", () => {
  it("confirms only when the provider returns an id with status confirmed", () => {
    const outcome = classifyProviderResponse({ id: "evt_1", status: "confirmed", hangoutLink: "https://meet.example/x" });
    expect(outcome.status).toBe("confirmed");
    expect(outcome.externalId).toBe("evt_1");
    expect(outcome.meetingLink).toBe("https://meet.example/x");
    expect(outcome.receipt).toMatchObject({ id: "evt_1" });
  });

  it("keeps the booking proposed when there is no receipt", () => {
    expect(classifyProviderResponse(undefined)).toEqual({ externalId: null, status: "proposed", meetingLink: null, receipt: null });
    expect(classifyProviderResponse({ ok: true }).status).toBe("proposed");
  });

  it("keeps the booking proposed when the provider has an id but not a confirmed status", () => {
    const outcome = classifyProviderResponse({ id: "evt_2", status: "tentative" });
    expect(outcome.status).toBe("proposed");
    expect(outcome.externalId).toBe("evt_2");
  });

  it("unwraps an event object returned under event", () => {
    expect(classifyProviderResponse({ event: { id: "evt_3", status: "confirmed" } }).status).toBe("confirmed");
  });

  it("reports cancelled only when the provider says so", () => {
    expect(classifyProviderResponse({ id: "evt_4", status: "cancelled" }, "cancelled").status).toBe("cancelled");
    expect(classifyProviderResponse({ id: "evt_4" }, "cancelled").status).toBe("proposed");
    expect(classifyProviderResponse({ id: "evt_4", status: "cancelled" }, "confirmed").status).toBe("proposed");
  });
});
