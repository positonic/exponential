/**
 * Action resolver (ticket #5) — the safety-critical core of "zero destructive
 * mistakes". Maps a spoken description ("the JWT refactor", "mark the investor
 * update as done") to EXACTLY ONE open Action, or returns an ambiguity set, or
 * none. It NEVER silently picks one when several plausibly match.
 *
 * The pure matching logic lives in actionMatch.ts (unit-tested in any env);
 * this module adds the DB query, reusing the existing action read conventions:
 *   - scope to the user via buildActionAccessWhere (parity with action.searchByTitle)
 *   - only OPEN actions are completable (exclude COMPLETED/DELETED/DRAFT/CANCELLED)
 *   - case-insensitive substring candidate fetch, then pure ranking decides.
 */
import type { PrismaClient } from "@prisma/client";

import { buildActionAccessWhere } from "~/server/services/access";
import { decideResolution, normalizeDescription } from "~/server/services/voice/actionMatch";

export interface ResolvableAction {
  id: string;
  name: string;
  projectName: string | null;
}

export type ResolveResult =
  | { kind: "one"; action: ResolvableAction }
  | { kind: "ambiguous"; actions: ResolvableAction[] }
  | { kind: "none" };

/** Statuses that are NOT completable by voice. */
const NON_OPEN_STATUSES = ["COMPLETED", "DELETED", "DRAFT", "CANCELLED"];

/**
 * Resolve a spoken description to one open Action for the user. Over-fetches
 * loosely by token, then applies the pure decision. Returns "ambiguous" rather
 * than guessing when multiple equally match.
 */
export async function resolveActionByDescription(
  phrase: string,
  userId: string,
  db: PrismaClient,
): Promise<ResolveResult> {
  const normalized = normalizeDescription(phrase);
  if (!normalized) return { kind: "none" };

  const tokens = normalized.split(" ").filter((t) => t.length >= 3);
  const nameOr =
    tokens.length > 0
      ? tokens.map((t) => ({ name: { contains: t, mode: "insensitive" as const } }))
      : [{ name: { contains: normalized, mode: "insensitive" as const } }];

  const rows = await db.action.findMany({
    where: {
      AND: [
        buildActionAccessWhere(userId),
        { status: { notIn: NON_OPEN_STATUSES } },
        { OR: nameOr },
      ],
    },
    select: {
      id: true,
      name: true,
      project: { select: { name: true } },
    },
    take: 25,
  });

  const candidates: ResolvableAction[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    projectName: r.project?.name ?? null,
  }));

  const decision = decideResolution(phrase, candidates);
  if (decision.kind === "none") return { kind: "none" };
  if (decision.kind === "one") return { kind: "one", action: decision.item };
  return { kind: "ambiguous", actions: decision.items };
}
