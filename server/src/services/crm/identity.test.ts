import { describe, expect, it } from "vitest";
import { normalizeEmail, normalizeHandle, normalizeIdentifier, normalizePhoneE164 } from "./identity.js";

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Ana.Lopez@Example.COM ")).toBe("ana.lopez@example.com");
  });

  it("rejects implausible addresses", () => {
    expect(normalizeEmail("no-arroba")).toBeNull();
    expect(normalizeEmail("a b@c.com")).toBeNull();
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
  });
});

describe("normalizePhoneE164", () => {
  it("reads nine Spanish national digits as +34", () => {
    expect(normalizePhoneE164("612 34 56 78")).toBe("+34612345678");
    expect(normalizePhoneE164("912-345-678")).toBe("+34912345678");
  });

  it("keeps an explicit +34 international number", () => {
    expect(normalizePhoneE164("+34 612 345 678")).toBe("+34612345678");
    expect(normalizePhoneE164("34612345678")).toBe("+34612345678");
  });

  it("turns a 00 prefix into +", () => {
    expect(normalizePhoneE164("0034 612345678")).toBe("+34612345678");
  });

  it("keeps other international numbers with a leading +", () => {
    expect(normalizePhoneE164("+1 (415) 555-0100")).toBe("+14155550100");
  });

  it("rejects values that cannot be a phone number", () => {
    expect(normalizePhoneE164("abc")).toBeNull();
    expect(normalizePhoneE164("+12")).toBeNull();
    expect(normalizePhoneE164("12345")).toBeNull();
    expect(normalizePhoneE164("")).toBeNull();
    expect(normalizePhoneE164(null)).toBeNull();
  });
});

describe("normalizeHandle", () => {
  it("removes leading @ and lowercases", () => {
    expect(normalizeHandle("  @Ana_Lopez ")).toBe("ana_lopez");
  });

  it("returns null for empty handles", () => {
    expect(normalizeHandle("   ")).toBeNull();
    expect(normalizeHandle("@")).toBeNull();
  });
});

describe("normalizeIdentifier", () => {
  it("dispatches by channel", () => {
    expect(normalizeIdentifier("email", "A@B.com")).toBe("a@b.com");
    expect(normalizeIdentifier("whatsapp", "612345678")).toBe("+34612345678");
    expect(normalizeIdentifier("telegram", "@Bot_User")).toBe("bot_user");
  });
});
