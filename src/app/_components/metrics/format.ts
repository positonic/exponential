/** Format a duration in hours as a compact, sensible unit. */
export function formatHours(hours: number): { value: string; unit: string } {
  if (hours < 1)
    return { value: String(Math.max(1, Math.round(hours * 60))), unit: 'min' };
  if (hours < 48) return { value: String(Math.round(hours)), unit: 'h' };
  return { value: (hours / 24).toFixed(1), unit: 'd' };
}

/** Format a duration in minutes as `2h 5m` / `45m` / `3h`. */
export function formatMinutes(totalMins: number): string {
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
