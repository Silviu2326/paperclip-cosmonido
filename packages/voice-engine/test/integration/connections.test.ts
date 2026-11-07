import { describe, expect, it, vi } from "vitest";
import { fakeDefinition } from "../cli/fake-engine.js";

vi.mock("../../src/providers/index.js", async () => {
  const { fakeDefinition } = await import("../cli/fake-engine.js");
  return { allProviders: [fakeDefinition] };
});
import { connectionCredentialResolver, connectionSpecs, VOICE_CONNECTION_SPECS } from "../../src/integration/connections.js";

describe("connections", () => {
  it("derives env aliases, required fields and secret controls", () => {
    const spec = VOICE_CONNECTION_SPECS.fake;
    expect(spec.fields).toContainEqual(expect.objectContaining({ key: "apiKey", secret: true, required: true, placeholder: "FAKE_API_KEY", envNames: ["FAKE_API_KEY", "FAKE_KEY"] }));
    expect(spec.fields).toContainEqual(expect.objectContaining({ key: "region", secret: false, required: false, envNames: ["FAKE_REGION"] }));
    expect(spec.helpUrl).toBe(fakeDefinition.docsUrl);
  });
  it("keeps nonsecret identifiers nonsecret and includes required unmapped fields", () => {
    const fields = connectionSpecs([{ ...fakeDefinition, credentialEnv: { userId: ["USER_ID"], groupId: ["GROUP_ID"] }, requiredCredentials: ["apiKey", "userId"] }]).fake.fields;
    expect(fields.find(field => field.key === "apiKey")).toMatchObject({ required: true, secret: true });
    expect(fields.filter(field => ["userId", "groupId"].includes(field.key)).every(field => !field.secret)).toBe(true);
  });
  it("forwards provider and company exactly and copies credentials", async () => {
    const stored = { apiKey: "secret" };
    const lookup = vi.fn(async () => stored);
    const result = await connectionCredentialResolver(lookup).resolve("fake", { companyId: "co-1" });
    expect(lookup).toHaveBeenCalledExactlyOnceWith("fake", "co-1");
    expect(result).toEqual(stored);
    expect(result).not.toBe(stored);
  });
  it("fails closed without a company and does not fall back on missing credentials", async () => {
    const lookup = vi.fn(async () => undefined);
    const resolver = connectionCredentialResolver(lookup);
    await expect(resolver.resolve("fake")).rejects.toMatchObject({ code: "auth" });
    expect(lookup).not.toHaveBeenCalled();
    await expect(resolver.resolve("fake", { companyId: "co-2" })).resolves.toBeUndefined();
  });
});
