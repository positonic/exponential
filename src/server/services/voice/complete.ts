/**
 * Complete module (ticket #5) — the `complete_action` coarse tool's server side
 * and the confirmation gate.
 *
 * complete_action is the one DESTRUCTIVE v1 tool. The gate guarantees an Action
 * is never marked done from the voice layer alone:
 *   - resolve the spoken description (actionResolver — never silently guesses);
 *   - no match            → graceful "couldn't find it", nothing mutated;
 *   - several matches     → ask which one, nothing mutated;
 *   - one match, !confirm → return needsConfirmation=true, voice asks to confirm,
 *                           NOTHING is mutated;
 *   - one match, confirm  → mark COMPLETED (status + completedAt, mirroring the
 *                           existing action.update completion path), confirmed.
 *
 * The mutation is scoped to the user's accessible actions, so a confirm can only
 * ever complete an action the user could already edit.
 */
import type { PrismaClient } from "@prisma/client";

import { buildActionAccessWhere } from "~/server/services/access";
import { resolveActionByDescription } from "~/server/services/voice/actionResolver";
// (resolveActionByDescription internally uses the pure matcher in actionMatch.ts)
import { boundLength, stripMarkdown } from "~/server/services/voice/speakable";

export interface CompleteResult {
  speakable: string;
  structured: unknown;
  needsConfirmation: boolean;
}

export async function completeAction(
  phrase: string,
  userId: string,
  db: PrismaClient,
  options?: { confirm?: boolean },
): Promise<CompleteResult> {
  const resolution = await resolveActionByDescription(phrase, userId, db);

  if (resolution.kind === "none") {
    return {
      speakable: boundLength(
        `I couldn't find an open action matching "${stripMarkdown(phrase)}".`,
      ),
      structured: { resolution: "none" },
      needsConfirmation: false,
    };
  }

  if (resolution.kind === "ambiguous") {
    const names = resolution.actions.map((a) => stripMarkdown(a.name));
    const shown = names.slice(0, 3);
    return {
      speakable: boundLength(
        `I found a few that match: ${joinOr(shown)}. Which one?`,
      ),
      structured: {
        resolution: "ambiguous",
        options: resolution.actions,
      },
      needsConfirmation: false,
    };
  }

  // Exactly one match.
  const action = resolution.action;

  if (!options?.confirm) {
    // Gate: do NOT mutate. Ask for a single-word confirm.
    return {
      speakable: boundLength(
        `I'll mark "${stripMarkdown(action.name)}" as done — say yes to confirm.`,
      ),
      structured: {
        resolution: "one",
        pendingCompletion: { id: action.id, name: action.name },
      },
      needsConfirmation: true,
    };
  }

  // Confirmed: complete it. Scope the update by the user's access so a confirm
  // can only ever complete an action the user may edit (defence in depth on top
  // of the resolver already being user-scoped). updateMany returns a count, so a
  // race or access mismatch completes 0 rows rather than the wrong row.
  const res = await db.action.updateMany({
    where: {
      AND: [
        { id: action.id },
        buildActionAccessWhere(userId),
        { status: { notIn: ["COMPLETED", "DELETED"] } },
      ],
    },
    data: { status: "COMPLETED", completedAt: new Date() },
  });

  if (res.count === 0) {
    return {
      speakable: boundLength(
        `I couldn't complete "${stripMarkdown(action.name)}" — it may already be done.`,
      ),
      structured: { resolution: "one", completed: false, id: action.id },
      needsConfirmation: false,
    };
  }

  return {
    speakable: boundLength(`Marked "${stripMarkdown(action.name)}" as done.`),
    structured: { resolution: "one", completed: true, id: action.id, name: action.name },
    needsConfirmation: false,
  };
}

/** "a", "a or b", "a, b, or c" */
function joinOr(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} or ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, or ${items[items.length - 1]}`;
}
