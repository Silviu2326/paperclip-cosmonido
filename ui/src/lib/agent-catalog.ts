import type { CatalogTeam, CatalogTeamImportOptions } from "@paperclipai/shared";

type CatalogTranslator = (key: string, fallback: string) => string;
const identity: CatalogTranslator = (_key, fallback) => fallback;
const normalizeSearch = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase();

export function agentCatalogOptions(slug: string, name?: string): CatalogTeamImportOptions {
  return {
    agents: [slug],
    include: { company: false, agents: true, projects: false, issues: false, skills: true },
    collisionStrategy: "rename",
    ...(name ? { nameOverrides: { [slug]: name } } : {}),
    sourcePolicy: { allowExternalSources: false, allowLocalPathSources: false, allowUnpinnedOptionalSources: false },
  };
}

export function catalogAgentPresentation(team: CatalogTeam, slug: string, translate: CatalogTranslator = identity) {
  const fallbackName = slug.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  return {
    name: translate(`agentCatalog.roles.${slug}.name`, fallbackName),
    description: translate(`agentCatalog.roles.${slug}.description`, team.description),
    teamName: translate(`agentCatalog.teams.${team.slug}.name`, team.name),
  };
}

export function catalogAgents(teams: CatalogTeam[], search: string, category: string, translate: CatalogTranslator = identity) {
  const query = normalizeSearch(search.trim());
  return teams.flatMap((team) => team.agentSlugs.map((slug) => ({ team, slug, ...catalogAgentPresentation(team, slug, translate) })))
    .filter(({ team, slug, name, description, teamName }) => (!category || team.category === category) && (!query || normalizeSearch(`${name} ${description} ${teamName} ${slug} ${team.name} ${team.description} ${team.tags.join(" ")}`).includes(query)));
}
