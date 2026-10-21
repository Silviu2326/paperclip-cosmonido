import { finished, pipeline } from "node:stream/promises";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Router } from "express";
import { z } from "zod";
import {
  AGENT_PALETTE_IDS, AGENT_AVATAR_SIZES, CHARACTER_STATES, LPC_CHARACTER_VERSION, appearanceForLpc, appearanceForPalette, decodeLpcSpec,
  type AgentAvatarSize,
} from "@paperclipai/shared";
import { AvatarAdmissionError, createAgentAvatarService, type AgentAvatarRequest } from "../services/agent-avatars.js";
import { LPC_ASSET_ROOT } from "../services/lpc-character-renderer.js";
import { createStorageProviderFromConfig } from "../storage/provider-registry.js";
import { loadConfig } from "../config.js";
import { logger } from "../middleware/logger.js";

const sizeSchema = z.string().regex(/^\d+$/).default("512").transform(Number).refine(n => (AGENT_AVATAR_SIZES as readonly number[]).includes(n));
const commonQuery = {
  size: sizeSchema,
  scale: z.enum(["1", "2"]).default("1"),
  background: z.enum(["transparent", "paperclip-dark"]).default("transparent"),
};
const capSchema = z.object({
  version: z.literal("cap-v1"),
  preset: z.enum([...AGENT_PALETTE_IDS, "muted-dream"]),
  pose: z.enum(CHARACTER_STATES),
  ...commonQuery,
}).strict();
const lpcSchema = z.object({
  version: z.literal(LPC_CHARACTER_VERSION),
  /** Encoded layer spec; decodeLpcSpec validates every token against the frozen catalog. */
  preset: z.string().regex(/^[a-z0-9_.]{1,200}$/),
  pose: z.enum([...CHARACTER_STATES, "sheet"]),
  muted: z.enum(["0", "1"]).default("0"),
  ...commonQuery,
}).strict();
const QUERY_KEYS: Record<string, readonly string[]> = { "cap-v1": ["size", "scale", "background"], [LPC_CHARACTER_VERSION]: ["size", "scale", "background", "muted"] };

function parseRequest(params: { version: string; preset: string; file: string }, query: Record<string, unknown>): AgentAvatarRequest | null {
  if (!params.file.endsWith(".png")) return null;
  const allowed = QUERY_KEYS[params.version];
  if (!allowed || Object.keys(query).some(key => !allowed.includes(key))) return null;
  const input = { ...query, version: params.version, preset: params.preset, pose: params.file.slice(0, -4) };
  if (params.version === "cap-v1") {
    const parsed = capSchema.safeParse(input);
    if (!parsed.success) return null;
    const { preset, pose, size, scale, background } = parsed.data;
    return { appearance: appearanceForPalette(preset === "muted-dream" ? AGENT_PALETTE_IDS[0] : preset), muted: preset === "muted-dream", pose, size: size as AgentAvatarSize, scale: Number(scale) as 1 | 2, background };
  }
  const parsed = lpcSchema.safeParse(input);
  if (!parsed.success) return null;
  const character = decodeLpcSpec(parsed.data.preset);
  if (!character) return null;
  const { pose, size, scale, background, muted } = parsed.data;
  if (pose === "sheet") {
    // The sheet is native resolution; size/scale/background do not apply.
    if (Object.keys(query).some(key => key !== "muted")) return null;
    return { appearance: appearanceForLpc(character), muted: muted === "1", pose: "rest", size: 512, scale: 1, sheet: true };
  }
  return { appearance: appearanceForLpc(character), muted: muted === "1", pose, size: size as AgentAvatarSize, scale: Number(scale) as 1 | 2, background };
}

/**
 * Public preset artwork only. No agent lookup or tenant data is exposed.
 *
 * The service (and its worker pool) is created on the first request, so an
 * instance that never serves an avatar never starts a worker; `close` lets
 * the application's orderly shutdown end the pool instead of leaving renders
 * running past HTTP teardown.
 */
export function agentAvatarRoutes(injected?: ReturnType<typeof createAgentAvatarService>): { router: ReturnType<typeof Router>; close(): Promise<void> } {
  const router = Router();
  let service = injected;
  // Attribution for the vendored Liberated Pixel Cup artwork (CC-BY / CC-BY-SA / OGA-BY require reachable credits).
  router.get(`/agent-avatars/${LPC_CHARACTER_VERSION}/credits`, async (_req, res) => {
    const file = new URL("CREDITS.csv", LPC_ASSET_ROOT);
    try {
      const info = await stat(file);
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.setHeader("Content-Length", info.size);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.type("text/csv; charset=utf-8");
      await pipeline(createReadStream(file), res);
    } catch (error) {
      if (res.headersSent || res.destroyed) { res.destroy(); return; }
      logger.warn({ err: error }, "Could not serve LPC credits");
      res.status(503).json({ error: "Credits temporarily unavailable" });
    }
  });
  router.get("/agent-avatars/:version/:preset/:file", async (req, res) => {
    const request = parseRequest({ version: String(req.params.version), preset: String(req.params.preset), file: String(req.params.file) }, req.query as Record<string, unknown>);
    if (!request) {
      res.setHeader("Cache-Control", "no-store");
      res.status(400).json({ error: "Unsupported avatar version, preset, pose, size, or scale" }); return;
    }
    try {
      service ??= createAgentAvatarService(createStorageProviderFromConfig(loadConfig()));
      const { stream, byteSize, etag } = await service.get(request, req.ip || req.socket.remoteAddress || "unknown");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.setHeader("ETag", etag);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.type("png");
      const validators = req.get("if-none-match")?.split(",").map(value => value.trim().replace(/^W\//, ""));
      if (validators?.some(value => value === "*" || value === etag)) {
        // ReadStream opens asynchronously. Await disposal so a concurrent cache
        // deletion cannot emit an unhandled open error after the 304 is sent.
        stream.destroy();
        await finished(stream, { cleanup: true }).catch(() => {});
        res.status(304).end(); return;
      }
      res.setHeader("Content-Length", byteSize);
      await pipeline(stream, res);
    } catch (error) {
      if (!(error instanceof AvatarAdmissionError)) logger.warn({ err: error }, "Could not render agent avatar");
      if (res.headersSent || res.destroyed) { res.destroy(); return; }
      res.removeHeader("Content-Length");
      res.removeHeader("ETag");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Retry-After", String(error instanceof AvatarAdmissionError ? error.retryAfterSeconds : 5));
      res.status(error instanceof AvatarAdmissionError ? 429 : 503).json({ error: "Avatar temporarily unavailable" });
    }
  });
  return { router, close: async () => { await service?.close(); } };
}
