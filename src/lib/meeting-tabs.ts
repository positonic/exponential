/**
 * Meeting page sections (`/recording/<id>`): Summary, Transcript, Decisions,
 * Screenshots.
 *
 * The open tab lives in the URL as `?tab=<name>` (Summary when absent) so
 * every section is linkable: the Share button copies the current tab,
 * decision evidence deep-links to the transcript as `?tab=transcript#turn-<n>`
 * (ADR-0060), and the screenshot narrative is shareable the same way.
 */

export const MEETING_TABS = ["summary", "transcript", "decisions", "screenshots"] as const;
export type MeetingTab = (typeof MEETING_TABS)[number];

/** The tab the page opens on when the URL names none. */
export const DEFAULT_MEETING_TAB: MeetingTab = "summary";

export function isMeetingTab(value: string | null | undefined): value is MeetingTab {
  return typeof value === "string" && (MEETING_TABS as readonly string[]).includes(value);
}

/** The tab a `?tab=` value names, or the default for a missing or unknown one. */
export function meetingTabFromParam(value: string | null | undefined): MeetingTab {
  return isMeetingTab(value) ? value : DEFAULT_MEETING_TAB;
}

/**
 * The page URL with `tab` set to `next`. The default tab is left implicit so
 * the canonical link stays bare, other query params survive, and a
 * `#turn-<n>` anchor is dropped: it only means something on the Transcript tab.
 */
export function withMeetingTab(href: string, next: MeetingTab): URL {
  const url = new URL(href);
  if (next === DEFAULT_MEETING_TAB) url.searchParams.delete("tab");
  else url.searchParams.set("tab", next);
  url.hash = "";
  return url;
}
