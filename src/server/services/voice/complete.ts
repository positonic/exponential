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
 *   - one match, confirm  → mark COMPLETED through the Action write module
 *                           (status, completedAt, and the card to DONE), confirmed.
 *
 * The mutation is scoped to the user's accessible actions, so a confirm can only
 * ever complete an action the user could already edit.
 */
import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";

import { buildActionAccessWhere } from "~/server/services/access";
import { applyActionUpdate } from "~/server/services/actions";
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
 * Complete exactly one action by id. The candidate is looked up within the
 * user's access, not yet completed, and (defence in depth) in the session's
 * workspace — so a pinned confirm can only ever reach an action the user
 * could already see, and never one resolved from a different workspace. The
 * write itself is the Action module's: central edit gate, the kanban ⇄
 * status lockstep and the activity event. When the action sits on a board
 * its card moves to DONE alongside the status, which the old set-based
 * updateMany never could.
 */
async function completeById(
  id: string,
  userId: string,
  db: PrismaClient,
  workspaceId?: string,
  knownName?: string,
): Promise<CompleteResult> {
  const candidate = await db.action.findFirst({
    where: {
      AND: [
        { id },
        buildActionAccessWhere(userId),
        { status: { notIn: ["COMPLETED", "DELETED"] } },
        ...(workspaceId ? [{ workspaceId }] : []),
      ],
    },
    select: { id: true, name: true, kanbanStatus: true },
  });

  // Resolve a name for the spoken reply even when nothing can be completed.
  let name = knownName ?? candidate?.name;
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

  let outcome: "completed" | "forbidden" | "unavailable" = "unavailable";
  if (candidate) {
    try {
      await applyActionUpdate({ db, actor: { userId, isAdmin: false } }, candidate.id, {
        status: "COMPLETED",
        // A card on a board moves to DONE with the status (the status → column
        // direction is otherwise not synced; here the caller asks for it).
        ...(candidate.kanbanStatus ? { kanbanStatus: "DONE" } : {}),
      });
      outcome = "completed";
    } catch (err) {
      if (err instanceof TRPCError && err.code === "FORBIDDEN") {
        // Readable but not editable: the access where-clause above is wider
        // than the edit gate. Say so, and leave a trace — a voice user who
        // keeps hitting this is a permissions question, not a lost turn.
        console.warn("[voice.complete] edit refused", { actionId: candidate.id, userId });
        outcome = "forbidden";
      } else if (err instanceof TRPCError && err.code === "NOT_FOUND") {
        // Gone between the lookup and the write — the same race updateMany
        // answered with a zero count.
        outcome = "unavailable";
      } else {
        throw err;
      }
    }
  }

  if (outcome === "forbidden") {
    return {
      speakable: boundLength(
        `I can't edit "${stripMarkdown(name)}" — you have read-only access to it.`,
      ),
      structured: { resolution: "one", completed: false, id, error: "forbidden" },
      needsConfirmation: false,
    };
  }

  if (outcome === "unavailable") {
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
