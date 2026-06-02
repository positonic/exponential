/**
 * Speakable formatter (ticket #2) — pure, no I/O.
 *
 * Converts structured/markdown content into a short, spoken-style string the
 * voice transport can read back. Strips markdown, collapses whitespace, renders
 * dates and counts speakably, and bounds the overall length so a turn never
 * becomes a long readout (voice stays useful — PRD §5, §8).
 *
 * Pure functions only: deterministic, cheap, heavily unit-tested.
 */

/** Default ceiling for a spoken read-back. Long enough for a confirmation,
 *  short enough to stay snappy. */
export const DEFAULT_MAX_SPEAKABLE_LENGTH = 240;

/**
 * Strip Markdown formatting down to plain spoken text.
 * Handles headings, bold/italic/strikethrough, inline code + code fences,
 * links/images (keep the visible text, drop the URL), list/quote markers, and
 * collapses all whitespace runs to single spaces.
 */
export function stripMarkdown(input: string): string {
  let s = input;

  // Fenced code blocks → keep inner text, drop the fences.
  s = s.replace(/```[^\n]*\n?([\s\S]*?)```/g, "$1");
  // Images ![alt](url) → alt
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  // Links [text](url) → text
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  // Inline code `code` → code
  s = s.replace(/`([^`]+)`/g, "$1");
  // Bold/italic/strikethrough markers (**, __, *, _, ~~)
  s = s.replace(/(\*\*|__|~~|\*|_)(.*?)\1/g, "$2");
  // Heading hashes at line start
  s = s.replace(/^[ \t]*#{1,6}[ \t]+/gm, "");
  // Blockquote markers
  s = s.replace(/^[ \t]*>[ \t]?/gm, "");
  // Unordered list markers (-, *, +) at line start
  s = s.replace(/^[ \t]*[-*+][ \t]+/gm, "");
  // Ordered list markers (1. 2)) at line start
  s = s.replace(/^[ \t]*\d+[.)][ \t]+/gm, "");
  // Stray leftover emphasis characters
  s = s.replace(/[*_~`]/g, "");
  // Collapse all whitespace (incl. newlines) to single spaces
  s = s.replace(/\s+/g, " ").trim();

  return s;
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function sameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Render a date the way a person would say it relative to `now`:
 * "today", "tomorrow", "yesterday", a weekday if within the coming week,
 * else "Month Dnth" (with year if it differs from now's year).
 *
 * `now` is injectable so the function stays pure and testable.
 */
export function speakableDate(date: Date, now: Date = new Date()): string {
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.round(
    (startOfDay(date).getTime() - startOfDay(now).getTime()) / dayMs,
  );

  if (sameCalendarDay(date, now)) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays === -1) return "yesterday";
  if (diffDays > 1 && diffDays < 7) return `on ${WEEKDAYS[date.getDay()]}`;

  const month = MONTHS[date.getMonth()];
  const day = ordinal(date.getDate());
  const base = `on ${month} ${day}`;
  return date.getFullYear() === now.getFullYear()
    ? base
    : `${base}, ${date.getFullYear()}`;
}

/** "1st", "2nd", "3rd", "4th", … */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** "no actions" / "1 action" / "3 actions" — count + correctly-pluralised noun. */
export function speakableCount(n: number, singular: string, plural?: string): string {
  const word = n === 1 ? singular : (plural ?? `${singular}s`);
  const number = n === 0 ? "no" : String(n);
  return `${number} ${word}`;
}

/**
 * Bound a spoken string to `max` characters without cutting mid-word. Adds a
 * trailing ellipsis when truncated. Never returns more than `max` characters.
 */
export function boundLength(text: string, max: number = DEFAULT_MAX_SPEAKABLE_LENGTH): string {
  if (text.length <= max) return text;
  const ellipsis = "…";
  const budget = max - ellipsis.length;
  const slice = text.slice(0, budget);
  const lastSpace = slice.lastIndexOf(" ");
  const trimmed = (lastSpace > 0 ? slice.slice(0, lastSpace) : slice).trimEnd();
  return trimmed + ellipsis;
}

/**
 * The main entry point: turn arbitrary structured/markdown text into a bounded,
 * plain spoken string. Compose with the helpers above for date/count rendering.
 */
export function toSpeakable(
  input: string,
  max: number = DEFAULT_MAX_SPEAKABLE_LENGTH,
): string {
  return boundLength(stripMarkdown(input), max);
}

/**
 * Build the spoken read-back for a freshly captured Action (ticket #2 AC:
 * "returns a speakable read-back"). Mentions the name, the due date if any, and
 * where it landed (named project or inbox).
 */
export function speakableCaptureConfirmation(params: {
  name: string;
  dueDate: Date | null;
  projectName: string | null;
  now?: Date;
}): string {
  const name = stripMarkdown(params.name);
  const due = params.dueDate
    ? ` due ${speakableDate(params.dueDate, params.now ?? new Date())}`
    : "";
  const where = params.projectName
    ? ` in ${stripMarkdown(params.projectName)}`
    : " to your inbox";
  return boundLength(`Added "${name}"${due}${where}.`);
}
