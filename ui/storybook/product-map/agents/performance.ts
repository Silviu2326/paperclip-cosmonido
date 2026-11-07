import type { TeamAgent } from "./demo-data";

/**
 * Performance figures for the comparison table. They do not exist per agent in
 * the API today: the page would derive them from finished runs and tasks in the
 * last 30 days. Hand-written for the demo team, hashed for generated agents.
 */
export interface AgentPerformance {
  tasksDone: number;
  avgMinutes: number;
  /** Share of tasks accepted without corrections, 0–100. */
  successRate: number;
  costPerTaskCents: number;
  /** Tasks closed per day, last 14 days, oldest first. */
  trend: number[];
}

const HAND: Record<string, AgentPerformance> = {
  marta: { tasksDone: 41, avgMinutes: 22, successRate: 93, costPerTaskCents: 117, trend: [2, 3, 2, 4, 3, 1, 0, 3, 4, 3, 5, 4, 2, 5] },
  diego: { tasksDone: 18, avgMinutes: 48, successRate: 85, costPerTaskCents: 127, trend: [1, 1, 2, 0, 1, 1, 0, 2, 1, 2, 2, 1, 0, 3] },
  leo: { tasksDone: 12, avgMinutes: 74, successRate: 78, costPerTaskCents: 137, trend: [0, 1, 0, 1, 2, 0, 0, 1, 1, 0, 2, 1, 1, 0] },
  nora: { tasksDone: 16, avgMinutes: 15, successRate: 61, costPerTaskCents: 58, trend: [2, 2, 1, 2, 1, 0, 0, 3, 2, 1, 2, 2, 0, 0] },
  iris: { tasksDone: 4, avgMinutes: 95, successRate: 100, costPerTaskCents: 75, trend: [0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0] },
};

function hash(text: string) {
  return [...text].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7);
}

export function performanceOf(agent: TeamAgent): AgentPerformance {
  const known = HAND[agent.id];
  if (known) return known;
  const seed = hash(agent.id + agent.name);
  const tasksDone = 3 + (seed % 40);
  const costPerTaskCents = 40 + (seed % 160);
  return {
    tasksDone,
    avgMinutes: 10 + (seed % 90),
    successRate: 55 + (seed % 46),
    costPerTaskCents,
    trend: Array.from({ length: 14 }, (_, index) => (seed >> (index % 12)) % 5),
  };
}
