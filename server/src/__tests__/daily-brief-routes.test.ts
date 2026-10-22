import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPreference, updatePreference, compose, log } = vi.hoisted(() => ({
  getPreference: vi.fn(),
  updatePreference: vi.fn(),
  compose: vi.fn(),
  log: vi.fn(),
}));
vi.mock("../services/daily-brief.js", () => ({
  dailyBriefService: () => ({ getPreference, updatePreference, compose, tick: vi.fn() }),
}));
vi.mock("../services/activity-log.js", () => ({ logActivity: log }));

import { dailyBriefRoutes } from "../routes/daily-brief.js";
import { errorHandler } from "../middleware/index.js";

const COMPANY = "00000000-0000-4000-8000-000000000001";

function app(actor: Record<string, unknown>) {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => { (req as any).actor = actor; next(); });
  server.use("/api", dailyBriefRoutes({} as any));
  server.use(errorHandler);
  return server;
}

const board = { type: "board", userId: "user-1", companyIds: [COMPANY], source: "local_implicit", isInstanceAdmin: true };
const agent = { type: "agent", agentId: "00000000-0000-4000-8000-000000000002", companyId: COMPANY };

describe("daily brief routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not let agent actors change the preference (403)", async () => {
    const response = await request(app(agent))
      .patch(`/api/companies/${COMPANY}/daily-brief/preferences`)
      .send({ enabled: true });
    expect(response.status).toBe(403);
    expect(updatePreference).not.toHaveBeenCalled();
  });

  it("does not let agent actors read the preview (403)", async () => {
    const response = await request(app(agent)).get(`/api/companies/${COMPANY}/daily-brief/preview`);
    expect(response.status).toBe(403);
    expect(compose).not.toHaveBeenCalled();
  });

  it("rejects an invalid hour with 422 and does not write", async () => {
    const response = await request(app(board))
      .patch(`/api/companies/${COMPANY}/daily-brief/preferences`)
      .send({ hourLocal: 24 });
    expect(response.status).toBe(422);
    expect(updatePreference).not.toHaveBeenCalled();
  });

  it("rejects a malformed preview date with 422", async () => {
    const response = await request(app(board)).get(`/api/companies/${COMPANY}/daily-brief/preview?date=21-10-2026`);
    expect(response.status).toBe(422);
    expect(compose).not.toHaveBeenCalled();
  });

  it("updates the signed-in user's preference and logs the activity", async () => {
    updatePreference.mockResolvedValue({ id: "pref-1", enabled: true, hourLocal: 7 });
    const response = await request(app(board))
      .patch(`/api/companies/${COMPANY}/daily-brief/preferences`)
      .send({ enabled: true, hourLocal: 7 });
    expect(response.status).toBe(200);
    expect(updatePreference).toHaveBeenCalledWith(COMPANY, "user-1", { enabled: true, hourLocal: 7 });
    expect(log).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "daily_brief.preferences_updated", companyId: COMPANY }));
  });

  it("previews with the stored timezone", async () => {
    getPreference.mockResolvedValue({ timezone: "America/Mexico_City" });
    compose.mockResolvedValue({ date: "2026-10-21", markdown: "# Resumen de 2026-10-21" });
    const response = await request(app(board)).get(`/api/companies/${COMPANY}/daily-brief/preview?date=2026-10-21`);
    expect(response.status).toBe(200);
    expect(compose).toHaveBeenCalledWith(COMPANY, "user-1", { date: "2026-10-21", timezone: "America/Mexico_City" });
  });
});
