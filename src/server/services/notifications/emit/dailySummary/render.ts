import { STATUS_LABELS } from "~/lib/ticket-statuses";
import type {
  DailySummaryCycle,
  DailySummaryDigest,
  DailySummaryPace,
} from "./types";

/**
 * Pure renderers for the Daily summary digest (ADR-0059). Both walk the same
 * section order and render every section — a section with nothing in it
 * collapses to its one-line empty state rather than disappearing, so the
 * message always answers "yesterday / today / this cycle" even when the
 * answer is "nothing".
 *
 * - markdown: bold headings, numbered lists, `[label](url)` links. The Matrix
 *   gateway renders it with `breaks: true`, so single newlines survive.
 * - plain text: the same lines with no markup; a linked item is followed by
 *   its bare URL on its own line (most clients auto-link it).
 */

type Mode = "markdown" | "plain";

export const DAILY_SUMMARY_TITLE = "☀️ Daily summary";

export const DAILY_SUMMARY_HEADINGS = {
  yesterday: "⏪ Yesterday",
  todayMeetings: "📅 Today's meetings",
  todaysActions: "✅ Today's actions",
  cycle: "🔄 Current cycle",
  upNext: "⏭ Up next",
} as const;

export const DAILY_SUMMARY_EMPTY = {
  yesterday: "No meetings yesterday",
  todayMeetings: "No meetings today",
  todaysActions: "Nothing scheduled or due today",
  cycle: "No active cycle",
  inFlight: "Nothing in flight for you",
  upNext: "Nothing committed to you",
} as const;

const PACE_LABELS: Record<DailySummaryPace, string> = {
  ahead: "Ahead",
  ontrack: "On pace",
  behind: "Behind pace",
};

function heading(mode: Mode, text: string): string {
  return mode === "markdown" ? `**${text}**` : text;
}

function link(mode: Mode, label: string, url: string): string {
  return mode === "markdown" ? `[${label}](${url})` : label;
}

/** Plain text carries the URL on its own line under the item; markdown inlines it. */
function urlLine(mode: Mode, url: string): string[] {
  return mode === "markdown" ? [] : [`   ${url}`];
}

function bullet(mode: Mode): string {
  return mode === "markdown" ? "- " : "• ";
}

function timePrefix(startLocal: string | null): string {
  return startLocal ? `${startLocal} ` : "";
}

function daysLeftLabel(daysLeft: number): string {
  const n = Math.abs(daysLeft);
  const unit = n === 1 ? "day" : "days";
  return daysLeft < 0 ? `${n} ${unit} over` : `${n} ${unit} left`;
}

function present(parts: Array<string | null>): string[] {
  return parts.filter((p): p is string => p !== null);
}

function cycleLines(mode: Mode, cycle: DailySummaryCycle, showProduct: boolean): string[] {
  const lines: string[] = [];
  const name = link(mode, cycle.name, cycle.cycleUrl);
  const headline = present([
    showProduct ? `${cycle.productName}: ${name}` : name,
    cycle.range,
    cycle.daysLeft !== null ? daysLeftLabel(cycle.daysLeft) : null,
  ]).join(" · ");
  lines.push(`${heading(mode, DAILY_SUMMARY_HEADINGS.cycle)} — ${headline}`);

  if (cycle.committed === 0) {
    lines.push("No tickets committed yet");
  } else {
    lines.push(
      present([
        `${cycle.completed} / ${cycle.committed} ${cycle.unit} done`,
        cycle.elapsedPct !== null ? `${cycle.elapsedPct}% elapsed` : null,
        cycle.pace ? PACE_LABELS[cycle.pace] : null,
      ]).join(" · "),
    );
  }
  lines.push(...urlLine(mode, cycle.cycleUrl));

  if (cycle.inFlight.length === 0) {
    lines.push(DAILY_SUMMARY_EMPTY.inFlight);
  } else {
    lines.push("Your in-flight tickets:");
    for (const t of cycle.inFlight) {
      const status = STATUS_LABELS[t.status] ?? t.status;
      lines.push(`${bullet(mode)}${link(mode, t.label, t.url)} — ${status}`);
      lines.push(...urlLine(mode, t.url));
    }
  }
  return lines;
}

function render(digest: DailySummaryDigest, mode: Mode): string {
  const lines: string[] = [`☀️ Good morning ${digest.firstName}! 👋`, ""];

  // ---- Yesterday ----
  lines.push(heading(mode, DAILY_SUMMARY_HEADINGS.yesterday));
  if (digest.yesterday.length === 0) {
    lines.push(DAILY_SUMMARY_EMPTY.yesterday);
  } else {
    digest.yesterday.forEach((item, i) => {
      const recorded = item.source === "recording" ? " (recorded)" : "";
      const text = `${i + 1}. ${timePrefix(item.startLocal)}${item.title}${recorded}`;
      if (item.recordingUrl) {
        lines.push(`${text} — ${link(mode, "recording", item.recordingUrl)}`);
        lines.push(...urlLine(mode, item.recordingUrl));
      } else {
        lines.push(text);
      }
    });
  }
  lines.push("");

  // ---- Today's meetings ----
  lines.push(heading(mode, DAILY_SUMMARY_HEADINGS.todayMeetings));
  if (digest.todayMeetings.length === 0) {
    lines.push(DAILY_SUMMARY_EMPTY.todayMeetings);
  } else {
    digest.todayMeetings.forEach((m, i) => {
      lines.push(`${i + 1}. ${timePrefix(m.startLocal)}${m.title}`);
    });
  }
  lines.push("");

  // ---- Today's actions ----
  lines.push(heading(mode, DAILY_SUMMARY_HEADINGS.todaysActions));
  if (digest.todaysActions.length === 0) {
    lines.push(DAILY_SUMMARY_EMPTY.todaysActions);
  } else {
    for (const a of digest.todaysActions) lines.push(`${bullet(mode)}${a.name}`);
  }
  lines.push(
    mode === "markdown"
      ? `${digest.overdueCount} overdue → ${link(mode, "/today", digest.todayUrl)}`
      : `${digest.overdueCount} overdue → ${digest.todayUrl}`,
  );
  lines.push("");

  // ---- Current cycle (one block per product) ----
  if (digest.cycles.length === 0) {
    lines.push(heading(mode, DAILY_SUMMARY_HEADINGS.cycle), DAILY_SUMMARY_EMPTY.cycle);
  } else {
    digest.cycles.forEach((cycle, i) => {
      if (i > 0) lines.push("");
      lines.push(...cycleLines(mode, cycle, digest.cycles.length > 1));
    });
  }
  lines.push("");

  // ---- Up next (the user's COMMITTED tickets across the cycle blocks) ----
  lines.push(heading(mode, DAILY_SUMMARY_HEADINGS.upNext));
  const upNext = digest.cycles.flatMap((c) => c.upNext);
  if (upNext.length === 0) {
    lines.push(DAILY_SUMMARY_EMPTY.upNext);
  } else {
    upNext.forEach((t, i) => {
      lines.push(`${i + 1}. ${link(mode, t.label, t.url)}`);
      lines.push(...urlLine(mode, t.url));
    });
  }
  const unrefined = digest.cycles.reduce((s, c) => s + c.unrefinedCount, 0);
  if (unrefined > 0) {
    lines.push(
      unrefined === 1
        ? "1 of your cycle tickets still needs refinement"
        : `${unrefined} of your cycle tickets still need refinement`,
    );
  }

  lines.push("", "💪 Have a productive day!");
  return lines.join("\n");
}

/** Markdown rendering — the variant the Matrix channel prefers (rides in `metadata.markdown`). */
export function renderDailySummaryMarkdown(digest: DailySummaryDigest): string {
  return render(digest, "markdown");
}

/** Plain-text rendering with bare absolute URLs — the notification's `message`. */
export function renderDailySummaryPlainText(digest: DailySummaryDigest): string {
  return render(digest, "plain");
}
