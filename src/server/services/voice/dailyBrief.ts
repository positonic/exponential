/**
 * Daily brief module (ticket #3) — the `get_todays_plan` coarse tool's server
 * side.
 *
 * Wraps the existing morning-briefing summary builder
 * (`generateBriefingData` — read-only, no LLM, no DB writes) and renders a
 * CONCISE speakable briefing (due today, overdue, projects needing attention)
 * via the speakable formatter from ticket #2. Deliberately a short summary,
 * not a full list readout — voice stays useful (PRD §5.2, §5.15).
 *
 * Read-only: never raises the confirmation gate.
 */
import type { PrismaClient } from "@prisma/client";

import {
  generateBriefingData,
  type BriefingData,
} from "~/server/services/briefingService";
import {
  boundLength,
  speakableCount,
  stripMarkdown,
} from "~/server/services/voice/speakable";

export interface DailyBriefResult {
  speakable: string;
  data: BriefingData;
}

/**
 * Build the spoken briefing for a user. Reuses the briefing builder for the
 * data (so the voice briefing always matches the web one) and only formats it
 * for speech here.
 */
export async function getTodaysPlan(
  userId: string,
  db: PrismaClient,
  options?: { workspaceId?: string; timezone?: string },
): Promise<DailyBriefResult> {
  const data = await generateBriefingData(userId, db, options);
  return { speakable: buildDailyBriefSpeakable(data), data };
}

/**
 * Pure: structured BriefingData → short spoken string. Names at most the two
 * earliest-due due-today actions (dueTodayActions is ordered dueDate ascending
 * by generateBriefingData) to stay useful without becoming a readout; everything
 * else is rendered as counts. Bounded by the speakable ceiling.
 */
export function buildDailyBriefSpeakable(data: BriefingData): string {
  const dueToday = data.dueTodayActions;
  const overdueCount = data.overdueActions.length;
  const attentionCount = data.projectsNeedingAttention.length;

  const parts: string[] = [];

  if (dueToday.length === 0 && overdueCount === 0) {
    parts.push("Nothing's due today and nothing's overdue.");
  } else {
    if (dueToday.length > 0) {
      const names = dueToday.slice(0, 2).map((a) => stripMarkdown(a.name));
      let sentence = `${capitalize(speakableCount(dueToday.length, "action"))} due today`;
      if (dueToday.length <= 2) {
        sentence += `: ${listPhrase(names)}`;
      } else {
        sentence += `, including ${listPhrase(names)}`;
      }
      parts.push(sentence + ".");
    }
    if (overdueCount > 0) {
      parts.push(`${capitalize(speakableCount(overdueCount, "action"))} overdue.`);
    }
  }

  if (attentionCount > 0) {
    parts.push(
      `${capitalize(speakableCount(attentionCount, "project"))} needing attention.`,
    );
  }

  return boundLength(parts.join(" "));
}

/** "a", "a and b", "a, b, and c" */
function listPhrase(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}
