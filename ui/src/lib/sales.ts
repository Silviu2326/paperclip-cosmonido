/** Keep local date/time inputs in the user's timezone; the API receives ISO instants. */
export function salesDateInput(value: string | Date | null | undefined, dateOnly = false): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString();
  return local.slice(0, dateOnly ? 10 : 16);
}

export function salesDateValue(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

export function salesOwnerValue(userId: string | null, agentId: string | null): string {
  return userId ? `user:${userId}` : agentId ? `agent:${agentId}` : "";
}

export function salesOwnerIds(value: string) {
  return {
    userId: value.startsWith("user:") ? value.slice(5) : null,
    agentId: value.startsWith("agent:") ? value.slice(6) : null,
  };
}
