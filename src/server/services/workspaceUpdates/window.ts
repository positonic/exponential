import type { PrismaClient } from "@prisma/client";

import type { WorkspaceUpdateKind } from "./types";

export const MANUAL_PERIOD_PREFIX = "manual-";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** The period key of an on-demand ("Generate draft now") update. */
export function manualPeriodKey(now: Date): string {
  return `${MANUAL_PERIOD_PREFIX}${now.toISOString()}`;
}

/**
 * Where a window ending at `windowEnd` starts: the end of the latest earlier
 * scheduled update of the same kind (whatever its status — EMPTY and SKIPPED
 * periods still count), so consecutive windows tile with no gap or overlap.
 * On-demand drafts are previews and never move the window. First ever run:
 * the week before `windowEnd`.
 */
export async function resolveWindowStart(
  db: PrismaClient,
  input: { workspaceId: string; kind: WorkspaceUpdateKind; windowEnd: Date },
): Promise<Date> {
  const previous = await db.workspaceUpdate.findFirst({
    where: {
      workspaceId: input.workspaceId,
      kind: input.kind,
      windowEnd: { lte: input.windowEnd },
      NOT: { periodKey: { startsWith: MANUAL_PERIOD_PREFIX } },
    },
    orderBy: { windowEnd: "desc" },
    select: { windowEnd: true },
  });
  return previous?.windowEnd ?? new Date(input.windowEnd.getTime() - WEEK_MS);
}
