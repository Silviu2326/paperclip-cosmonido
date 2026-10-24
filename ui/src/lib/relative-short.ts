/** Short relative time in the viewer's language, e.g. "hace 4 min". Null when the date is invalid. */
export function relativeShort(value: string | Date, language: string): string | null {
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return null;
  const minutes = Math.round((then - Date.now()) / 60_000);
  const formatter = new Intl.RelativeTimeFormat(language, { numeric: "auto", style: "short" });
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
}
