import { describe, expect, it } from "vitest";
import { createDefinitionCredentialResolver, hasRequiredDefinitionCredentials } from "../../src/net/credentials.js";
const defs=[{id:"x",credentialEnv:{apiKey:["FIRST","SECOND"]},requiredCredentials:["apiKey"]}];
describe("definition credentials",()=>{it("selects first nonblank environment value",async()=>{const resolver=createDefinitionCredentialResolver(defs,{FIRST:" ",SECOND:"secret"});const creds=await resolver.resolve("x");expect(creds?.apiKey).toBe("secret");expect(hasRequiredDefinitionCredentials(defs[0],creds)).toBe(true);});it("rejects missing required fields",()=>expect(hasRequiredDefinitionCredentials(defs[0],{})).toBe(false));});
