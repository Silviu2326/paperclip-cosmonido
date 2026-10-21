import { parentPort } from "node:worker_threads";
import sharp from "sharp";
import { renderAgentSvg } from "@paperclipai/shared/cliplab/static";
import { PAPERCLIP_DARK_AVATAR_BACKGROUND, isLpcAppearance } from "@paperclipai/shared";
import { renderLpcFrame, renderLpcSheet } from "./lpc-character-renderer.js";
import type { AgentAvatarRequest } from "./agent-avatars.js";

parentPort!.on("message", async (request: AgentAvatarRequest) => {
  try {
    if (isLpcAppearance(request.appearance)) {
      const png = request.sheet
        ? await renderLpcSheet(request.appearance.lpc, request.muted)
        : await renderLpcFrame({ character: request.appearance.lpc, pose: request.pose, size: request.size, scale: request.scale, muted: request.muted, background: request.background });
      parentPort!.postMessage({ png });
      return;
    }
    const svg = renderAgentSvg(request.appearance, request.size, request.scale, request.pose, request.muted);
    const image = sharp(Buffer.from(svg));
    if (request.background === "paperclip-dark") image.flatten({ background: PAPERCLIP_DARK_AVATAR_BACKGROUND });
    const png = await image.png().toBuffer();
    parentPort!.postMessage({ png });
  } catch (error) {
    parentPort!.postMessage({ error: error instanceof Error ? error.message : "Avatar rendering failed" });
  }
});
