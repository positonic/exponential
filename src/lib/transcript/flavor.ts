import type { TranscriptFlavor, TranscriptParticipant } from "./types";

/**
 * Collect the lowercased names/labels that identify the host ("me") side. Both
 * `name` and `speakerLabel` are considered so a structured transcript can match
 * by either.
 */
export function hostNamesOf(
  participants: TranscriptParticipant[] | null | undefined,
): Set<string> {
  const names = new Set<string>();
  for (const p of participants ?? []) {
    if (!p?.isHost) continue;
    if (p.name) names.add(p.name.trim().toLowerCase());
    if (p.speakerLabel) names.add(p.speakerLabel.trim().toLowerCase());
  }
  return names;
}

/**
 * Build a stable speaker → flavor assigner for a single transcript. The literal
 * label `Me` (case-insensitive) and any host participant map to `me`; every
 * other distinct speaker rotates through `them` / `alt` by first appearance and
 * keeps that flavor for the rest of the transcript.
 */
export function createFlavorAssigner(
  hostNames: Set<string>,
): (speaker: string) => TranscriptFlavor {
  const assigned = new Map<string, TranscriptFlavor>();
  const rotation: TranscriptFlavor[] = ["them", "alt"];
  let rotationIndex = 0;

  return (speaker: string): TranscriptFlavor => {
    const key = speaker.trim().toLowerCase();
    const existing = assigned.get(key);
    if (existing) return existing;

    let flavor: TranscriptFlavor;
    if (key === "me" || hostNames.has(key)) {
      flavor = "me";
    } else {
      flavor = rotation[rotationIndex % rotation.length]!;
      rotationIndex += 1;
    }
    assigned.set(key, flavor);
    return flavor;
  };
}
