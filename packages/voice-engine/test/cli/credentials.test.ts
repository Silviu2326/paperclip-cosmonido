import { describe, expect, it } from "vitest";
import { availableProviderIds, credentialRequirements } from "../../src/cli/credentials.js";
import { createFakeEngine, fakeDefinition } from "./fake-engine.js";

describe("credential diagnostics", () => {
  it("requires either key or token when the catalog declares alternatives", async () => {
    const definition = { ...fakeDefinition, id: "google", requiredCredentials: [], credentialEnv: { apiKey: ["GOOGLE_TTS_API_KEY", "GOOGLE_API_KEY"], accessToken: ["GOOGLE_ACCESS_TOKEN"], project: ["GOOGLE_CLOUD_PROJECT"] } };
    expect(credentialRequirements(definition)).toEqual([["GOOGLE_TTS_API_KEY", "GOOGLE_API_KEY", "GOOGLE_ACCESS_TOKEN"]]);
    const context = { engine: createFakeEngine({ providers: () => [definition] }), json: false, outDir: ".", io: { env: { GOOGLE_CLOUD_PROJECT: "project-only" } as Record<string, string>, cwd: ".", stdout: () => {}, stderr: () => {} } };
    expect(await availableProviderIds(context)).toEqual(new Set());
    context.io.env.GOOGLE_ACCESS_TOKEN = "token";
    expect(await availableProviderIds(context)).toEqual(new Set(["google"]));
  });
  it("accepts credential aliases but not whitespace or missing required identifiers", async () => {
    const definition = { ...fakeDefinition, requiredCredentials: ["apiKey", "region"] };
    const context = { engine: createFakeEngine({ providers: () => [definition] }), json: false, outDir: ".", io: { env: { FAKE_KEY: "key", FAKE_REGION: "  " }, cwd: ".", stdout: () => {}, stderr: () => {} } };
    expect(await availableProviderIds(context)).toEqual(new Set());
    context.io.env.FAKE_REGION = "west";
    expect(await availableProviderIds(context)).toEqual(new Set(["fake"]));
  });
});
