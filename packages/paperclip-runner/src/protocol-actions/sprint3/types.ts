/** Shape of one Sprint 3 agent tool definition. Each work package owns one file in this folder. */
export interface Sprint3ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly effect: "read" | "write";
  readonly inputSchema: Record<string, unknown>;
  readonly example: Record<string, unknown>;
}
