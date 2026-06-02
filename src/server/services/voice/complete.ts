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
  options?: { confirm?: boolean; pendingId?: string; workspaceId?: string },
): Promise<CompleteResult> {
  // Confirm pinned to the action the gate originally proposed: complete exactly
  // that id, never re-resolve the phrase. Re-resolving on confirm could land on
  // a DIFFERENT action if the user's data changed between the gate and the "yes"
  // — the confirmation the user gave was for the suggested action, not whatever
  // the phrase now matches.
  if (options?.confirm && options.pendingId) {
    return completeById(options.pendingId, userId, db, options.workspaceId);
  }

  const resolution = await resolveActionByDescription(
    phrase,
    userId,
    db,
    options?.workspaceId,
  );

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

  // Confirmed without a pinned id (legacy confirm path): complete the resolved
  // single match. We already know its name, so pass it to avoid a re-fetch.
  return completeById(action.id, userId, db, options?.workspaceId, action.name);
}

/**
 * Complete exactly one action by id. Scope the update by the user's access so a
 * confirm can only ever complete an action the user may edit (defence in depth
 * on top of the resolver already being user-scoped). updateMany returns a count,
 * so a race or access mismatch completes 0 rows rather than the wrong row.
 */
async function completeById(
  id: string,
  userId: string,
  db: PrismaClient,
  workspaceId?: string,
  knownName?: string,
): Promise<CompleteResult> {
  const res = await db.action.updateMany({
    where: {
      AND: [
        { id },
        buildActionAccessWhere(userId),
        { status: { notIn: ["COMPLETED", "DELETED"] } },
        // Defence in depth: a pinned confirm can only complete an action in the
        // session's workspace, never one resolved from a different workspace.
        ...(workspaceId ? [{ workspaceId }] : []),
      ],
    },
    data: { status: "COMPLETED", completedAt: new Date() },
  });

  // Resolve a name for the spoken reply. On the pinned path we don't have it yet;
  // look it up within the user's access (falls back gracefully if not visible).
  let name = knownName;
  if (name === undefined) {
    const found = await db.action.findFirst({
      where: {
        AND: [
          { id },
          buildActionAccessWhere(userId),
          ...(workspaceId ? [{ workspaceId }] : []),
        ],
      },
      select: { name: true },
    });
    name = found?.name ?? "that action";
  }

  if (res.count === 0) {
    return {
      speakable: boundLength(
        `I couldn't complete "${stripMarkdown(name)}" — it may already be done.`,
      ),
      structured: { resolution: "one", completed: false, id },
      needsConfirmation: false,
    };
  }

  return {
    speakable: boundLength(`Marked "${stripMarkdown(name)}" as done.`),
    structured: { resolution: "one", completed: true, id, name },
    needsConfirmation: false,
  };
}

/** "a", "a or b", "a, b, or c" */
function joinOr(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} or ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, or ${items[items.length - 1]}`;
}
