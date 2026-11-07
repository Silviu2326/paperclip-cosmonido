import { describe, expect, it } from "vitest";
import { agentCatalogOptions, catalogAgents, catalogAgentPresentation } from "./agent-catalog";
import { i18n } from "../i18n";
import es from "../i18n/locales/es.json";
import en from "../i18n/locales/en.json";
import manifest from "../../../packages/teams-catalog/generated/catalog.json";
import { sampleTeam } from "../pages/TeamCatalog.fixtures";

describe("agent catalog", () => {
  it("selects exactly one agent without importing company settings, projects or tasks", () => {
    const options = agentCatalogOptions("cto");
    expect(options.agents).toEqual(["cto"]);
    expect(options.include).toEqual({ company: false, agents: true, projects: false, issues: false, skills: true });
    expect(options.collisionStrategy).toBe("rename");
    expect(options.sourcePolicy?.allowExternalSources).toBe(false);
    expect(options.sourcePolicy?.allowLocalPathSources).toBe(false);
  });
  it("exposes individual agents from the existing packages", () => {
    expect(catalogAgents([sampleTeam], "", "").map((agent) => agent.slug)).toEqual(sampleTeam.agentSlugs);
  });
  it("combines search with category filtering", () => {
    expect(catalogAgents([{ ...sampleTeam, description: "Specialists" }], "  CTO ", sampleTeam.category).map((agent) => agent.slug)).toEqual(["cto"]);
    expect(catalogAgents([sampleTeam], "cto", "other")).toEqual([]);
    expect(catalogAgents([sampleTeam], "unknown", "")).toEqual([]);
  });
  it("translates all shipped team and agent entries in Spanish and English", () => {
    for (const team of manifest.teams) {
      expect(Object.hasOwn(es.agentCatalog.teams, team.slug)).toBe(true);
      expect(Object.hasOwn(en.agentCatalog.teams, team.slug)).toBe(true);
      for (const slug of team.agentSlugs) {
        expect(Object.hasOwn(es.agentCatalog.roles, slug)).toBe(true);
        expect(Object.hasOwn(en.agentCatalog.roles, slug)).toBe(true);
      }
    }
  });
  it("searches translated names and descriptions without requiring accents", () => {
    const team = { ...sampleTeam, slug: "agency-content", agentSlugs: ["account-manager", "writer"] };
    const translate = (key: string, fallback: string) => i18n.t(key, { lng: "es", defaultValue: fallback });
    const [entry] = catalogAgents([team], "responsable de cuentas", "", translate);
    expect(entry.name).toBe("Responsable de cuentas");
    expect(entry.teamName).toBe("Agencia de contenido");
    expect(entry.description).toContain("solicitudes del cliente");
    expect(catalogAgents([team], "redacta", "", translate).map((agent) => agent.slug)).toEqual(["writer"]);
    const supportTeam = { ...team, agentSlugs: ["support-agent"] };
    expect(catalogAgents([supportTeam], "atencion", "", translate)).toHaveLength(1);
    expect(agentCatalogOptions(entry.slug, entry.name).nameOverrides).toEqual({ "account-manager": "Responsable de cuentas" });
  });
  it("keeps readable source names for unknown external templates", () => {
    expect(catalogAgentPresentation(sampleTeam, "custom-helper")).toMatchObject({ name: "Custom Helper", description: sampleTeam.description, teamName: sampleTeam.name });
  });

});
