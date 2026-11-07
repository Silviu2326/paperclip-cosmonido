import { agentAvatarUrl, agentWorldSheetUrl, isLpcAppearance, LPC_WORLD_SHEET, resolveAgentAppearance, type AgentAppearance, type LpcDirection } from "@paperclipai/shared";

/** Native frame size of every LPC sheet (contract 4). */
export const WORLD_FRAME_SIZE = 64;
export const WORLD_SHEET_COLUMNS = LPC_WORLD_SHEET.columns;
export const WORLD_SHEET_ROWS = LPC_WORLD_SHEET.rows;

/** Sheet URL for an agent when it uses lpc-v1 (shared `agentWorldSheetUrl`), otherwise null: the engine draws the portrait. */
export function agentWorldUrl(appearance: AgentAppearance | null | undefined, agentId: string): string | null {
  const resolved = resolveAgentAppearance(appearance, agentId);
  return isLpcAppearance(resolved) && !resolved.customAvatarAssetId ? agentWorldSheetUrl(resolved) : null;
}

/** 64 px portrait used for agents without an lpc-v1 sheet. */
export function agentPortraitUrl(appearance: AgentAppearance | null | undefined, agentId: string): string {
  return agentAvatarUrl(resolveAgentAppearance(appearance, agentId), 64, 1, "rest");
}

/** Sheet column/row for a frame: rows 0-3 walk (or idle column 0), rows 4-7 sit. */
export function worldSheetCell(direction: LpcDirection, frame: number, sitting: boolean): { column: number; row: number } {
  const row = sitting ? LPC_WORLD_SHEET.sitRow(direction) : LPC_WORLD_SHEET.moveRow(direction);
  return { column: sitting ? 0 : Math.min(Math.max(frame, 0), WORLD_SHEET_COLUMNS - 1), row };
}
