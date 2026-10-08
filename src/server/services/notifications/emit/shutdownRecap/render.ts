/**
 * Pure renderers for the Shutdown recap: markdown (Matrix, email), plain
 * text (push and every other channel), the reply hint only Matrix shows, and
 * the agent context the Matrix gateway keeps so a reply's numbers resolve to
 * actions. Section order follows the Shutdown routine template.
 */
import type { RecapNumberedAction, ShutdownRecap } from "./types";

type Mode = "markdown" | "plain";

/** Lines of "What moved" shown before "and N more". */
const MOVED_SHOWN = 5;

export const SHUTDOWN_RECAP_TITLE = "🌙 Shutdown recap";

export const SHUTDOWN_RECAP_HEADINGS = {
  done: "✅ Done today",
  moved: "🔀 What moved",
  time: "⏱ Time",
  leftUndone: "📋 Left undone",
  tomorrow: "🌅 Tomorrow",
} as const;

/** Shown only where a reply reaches the agent (Matrix). */
export const SHUTDOWN_RECAP_REPLY_HINT =
  "_Reply to sort the numbered ones, e.g. “1, 3 tomorrow · drop 2 · 4 done”._";

const NO_BREAK_SPACE = " ";

/** Same gap the Daily summary uses: Element shows `<p>`s with no margin. */
function sectionGap(mode: Mode): string[] {
  return mode === "markdown" ? ["", NO_BREAK_SPACE, ""] : [""];
}

function heading(mode: Mode, text: string): string {
  return mode === "markdown" ? `**${text}**` : text;
}

/** Brackets in a title would end the link label early. */
function linked(mode: Mode, title: string, url: string | null): string {
  if (mode === "plain" || !url) return title;
  return `[${title.replace(/[[\]]/g, "")}](${url})`;
}

function numberedLine(mode: Mode, a: RecapNumberedAction): string {
  return `${a.n}. ${linked(mode, a.title, a.url)}${a.detail ? ` — ${a.detail}` : ""}`;
}

function render(recap: ShutdownRecap, opening: string, mode: Mode): string {
  const bullet = mode === "markdown" ? "- " : "• ";
  const out: string[] = [opening];

  out.push(...sectionGap(mode), heading(mode, SHUTDOWN_RECAP_HEADINGS.done));
  if (recap.done.length === 0) out.push("Nothing ticked off today.");
  for (const d of recap.done) {
    const context = d.keyResultTitle ?? d.goalTitle ?? d.projectName;
    out.push(`${bullet}${linked(mode, d.title, d.url)}${context ? ` — ${context}` : ""}`);
  }

  if (recap.moved.length > 0) {
    out.push(...sectionGap(mode), heading(mode, SHUTDOWN_RECAP_HEADINGS.moved));
    for (const m of recap.moved.slice(0, MOVED_SHOWN)) out.push(`${bullet}${m}`);
    const hidden = recap.moved.length - MOVED_SHOWN;
    if (hidden > 0) out.push(`${bullet}and ${hidden} more`);
  }

  if (recap.time.length > 0) {
    out.push(...sectionGap(mode), heading(mode, SHUTDOWN_RECAP_HEADINGS.time));
    for (const t of recap.time) out.push(`${bullet}${t}`);
  }

  out.push(...sectionGap(mode), heading(mode, SHUTDOWN_RECAP_HEADINGS.leftUndone));
  if (recap.leftUndone.length === 0 && recap.moreOverdue === 0) out.push("Nothing left open. Clean slate.");
  for (const a of recap.leftUndone) out.push(numberedLine(mode, a));
  if (recap.moreOverdue > 0) {
    out.push(`…and ${recap.moreOverdue} more overdue on ${linked(mode, "Today", recap.todayUrl)}`);
  }

  out.push(...sectionGap(mode), heading(mode, SHUTDOWN_RECAP_HEADINGS.tomorrow));
  if (recap.tomorrowMeetings.length === 0 && recap.tomorrowActions.length === 0) {
    out.push("Nothing on the calendar or your list yet.");
  }
  for (const m of recap.tomorrowMeetings) out.push(`${bullet}📅 ${m}`);
  for (const a of recap.tomorrowActions) out.push(numberedLine(mode, a));

  return out.join("\n");
}

export function renderShutdownRecapMarkdown(recap: ShutdownRecap, opening: string): string {
  return render(recap, opening, "markdown");
}

export function renderShutdownRecapPlainText(recap: ShutdownRecap, opening: string): string {
  return render(recap, opening, "plain");
}

/**
 * What the Matrix gateway stores beside the recap in the person's DM
 * memory: the numbers in the message mapped to action ids. The person never
 * sees it; the agent reads it when they reply "1, 3 tomorrow".
 */
export function renderShutdownRecapAgentContext(recap: ShutdownRecap): string | null {
  const all = [...recap.leftUndone, ...recap.tomorrowActions];
  if (all.length === 0) return null;
  const lines = [
    `Shutdown recap for ${recap.dayKey} (${recap.timezone}). Numbers in that message refer to these actions:`,
    ...recap.leftUndone.map((a) => `${a.n} = action ${a.actionId} "${a.title}" (left undone today${a.detail ? `, ${a.detail}` : ""})`),
    ...recap.tomorrowActions.map((a) => `${a.n} = action ${a.actionId} "${a.title}" (already on tomorrow's list${a.detail ? `, ${a.detail}` : ""})`),
  ];
  return lines.join("\n");
}
