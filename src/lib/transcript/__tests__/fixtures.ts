/** Test fixtures for the transcript parser registry. */

/**
 * A device / manual `Me:` / `Them:` paste in the shape that currently renders as
 * a wall of text — the "Melissa" transcript from the feature. Header block above
 * a `Transcript:` marker, identity-relative labels, no timestamps, one
 * multi-line turn and one `[SCREENSHOT]` marker.
 */
export const MELISSA_PLAIN_TEXT = [
  "Meeting Title: Sync with Melissa",
  "Date: 04 Jun 2026",
  "Meeting participants: Me, Melissa",
  "Transcript:",
  "Me: Hey Melissa, thanks for hopping on.",
  "Them: Of course! I wanted to walk through the onboarding flow",
  "and the couple of edge cases we hit last week.",
  "Me: Perfect. [SCREENSHOT] Here's where it breaks.",
  "Them: Got it — that lines up with what I saw.",
].join("\n");

/** A Fireflies `sentencesJson` array: real names + timestamps. */
export const FIREFLIES_SENTENCES = [
  { text: "Welcome everyone.", speaker_name: "Alice", start_time: 0, end_time: 2 },
  { text: "Thanks for joining.", speaker_name: "Alice", start_time: 2, end_time: 4 },
  { text: "Happy to be here.", speaker_name: "Bob", start_time: 4, end_time: 6 },
  { text: "Let me share an update.", speaker_name: "Carol", start_time: 6, end_time: 9 },
];

/** The same Fireflies data as a `{ sentences: [...] }` JSON blob. */
export const FIREFLIES_BLOB = JSON.stringify({ sentences: FIREFLIES_SENTENCES });
