import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { errorHandler } from "../middleware/index.js";
import { deliverableReviewRoutes } from "../routes/deliverable-reviews.js";

function app(actor: Record<string, unknown>) {
  const server = express(); server.use(express.json());
  server.use((req, _res, next) => { (req as any).actor = actor; next(); });
  server.use("/api", deliverableReviewRoutes({} as any)); server.use(errorHandler); return server;
}

describe("deliverable review routes", () => {
  it("rejects agent resolution before looking up review state", async () => {
    const response = await request(app({ type: "agent", agentId: "agent" })).post("/api/deliverable-reviews/review/resolve").send({ state: "accepted" });
    expect(response.status).toBe(403);
  });
  it("requires a reason when requesting changes", async () => {
    const response = await request(app({ type: "board", userId: "user", source: "local_implicit", isInstanceAdmin: true })).post("/api/deliverable-reviews/review/resolve").send({ state: "changes_requested" });
    expect(response.status).toBe(422);
  });
});
