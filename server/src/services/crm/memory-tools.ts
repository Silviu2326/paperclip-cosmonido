import { z } from "zod";
import { badRequest } from "../../errors.js";

/**
 * Agent tools for customer memory (Sprint 2 pista K). Like `project-tools.ts`, every call
 * goes through the authenticated HTTP API, so the route's isolation check and activity log
 * apply to agent calls exactly as to board calls. The customer must be the one linked to the run.
 */
export const customerMemoryGetInputSchema = z.object({
  customerId: z.string().uuid(),
});

export const customerMemoryAppendInputSchema = z.object({
  customerId: z.string().uuid(),
  key: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(4000),
  validUntil: z.string().datetime({ offset: true }).optional(),
  idempotencyKey: z.string().min(1).max(255),
});

export const CUSTOMER_MEMORY_TOOL_NAMES = ["customer_memory_get", "customer_memory_append"] as const;

export function customerMemoryToolDefinitions() {
  return [
    {
      name: "customer_memory_get",
      description: "Lista las notas vigentes de memoria del cliente vinculado a esta ejecución, ordenadas por clave y fecha.",
      inputSchema: z.toJSONSchema(customerMemoryGetInputSchema),
    },
    {
      name: "customer_memory_append",
      description: "Añade una nota nueva a la memoria del cliente vinculado a esta ejecución. Nunca sobrescribe notas anteriores.",
      inputSchema: z.toJSONSchema(customerMemoryAppendInputSchema),
    },
  ];
}

/** Executes one customer memory tool call against the authenticated API. */
export async function callCustomerMemoryTool(input: {
  name: string; arguments: Record<string, unknown>; apiUrl: string; token: string;
}) {
  let method: "GET" | "POST";
  let path: string;
  let body: unknown;
  if (input.name === "customer_memory_get") {
    const args = customerMemoryGetInputSchema.parse(input.arguments);
    method = "GET";
    path = `/customers/${args.customerId}/memory`;
  } else if (input.name === "customer_memory_append") {
    const args = customerMemoryAppendInputSchema.parse(input.arguments);
    method = "POST";
    path = `/customers/${args.customerId}/memory`;
    const { customerId: _customerId, ...rest } = args;
    body = rest;
  } else throw badRequest("Unknown customer memory tool");
  const response = await fetch(`${input.apiUrl.replace(/\/+$/, "").replace(/\/api$/, "")}/api${path}`, {
    method,
    headers: { Authorization: `Bearer ${input.token}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(60_000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : `Customer memory tool failed (${response.status})`);
  return result;
}
