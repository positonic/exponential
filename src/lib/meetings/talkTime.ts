/** Tolerant extraction of per-speaker talk-time from Fireflies analyticsJson.
 *  Fireflies stores `{ speakers: [{ name, duration }] }`; we sum durations to a
 *  percentage. Returns a name→"NN%" record, empty when the shape isn't present.
 *
 *  Runs server-side in `transcription.getDetail` so the meeting page receives
 *  this small record instead of the raw analytics blob. */
export function extractTalkTime(analyticsJson: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (!analyticsJson || typeof analyticsJson !== "object") return result;
  const speakers = (analyticsJson as { speakers?: unknown }).speakers;
  if (!Array.isArray(speakers)) return result;

  const rows = speakers
    .map((s) => {
      if (!s || typeof s !== "object") return null;
      const obj = s as Record<string, unknown>;
      const name = typeof obj.name === "string" ? obj.name : null;
      const durationRaw =
        typeof obj.duration === "number"
          ? obj.duration
          : typeof obj.duration_pct === "number"
            ? obj.duration_pct
            : null;
      if (!name || durationRaw === null) return null;
      return { name, duration: durationRaw };
    })
    .filter((r): r is { name: string; duration: number } => r !== null);

  const total = rows.reduce((sum, r) => sum + r.duration, 0);
  if (total <= 0) return result;
  for (const row of rows) {
    result[row.name] = `${Math.round((row.duration / total) * 100)}%`;
  }
  return result;
}
