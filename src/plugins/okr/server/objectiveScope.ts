import type { Prisma } from "@prisma/client";

/**
 * Which Objectives belong to a period on the Goals page.
 *
 * Both list procedures the page reads (`goal.getAllMyGoals` for the Table
 * view, `okr.getByObjective` for the OKRs and Timeline views) build their
 * `where` from this one rule, so switching view never changes which
 * objectives are in the list:
 *
 * - a quarter or Annual period holds every objective whose own `period`
 *   matches **or** that has a key result in it (legacy period-less objectives
 *   with period-specific KRs stay visible; an Annual objective never leaks
 *   onto a quarter);
 * - `period: null` ("All") drops the period clause entirely — it is the only
 *   place a period-less objective appears;
 * - archived objectives are never returned, on any view;
 * - "Mine" keeps the objectives the caller is the DRI on, directly or via one
 *   of their key results. Being the creator (`userId`) is not enough.
 *
 * `period` may be a list (the `includePairedPeriod` callers of
 * `getByObjective` pass the quarter plus its parent year), in which case
 * membership in any of them counts.
 */
export interface ObjectiveScopeInput {
  period: string | readonly string[] | null;
  onlyMine: boolean;
  userId: string;
}

export function objectiveScopeWhere({
  period,
  onlyMine,
  userId,
}: ObjectiveScopeInput): Prisma.GoalWhereInput {
  // One shape that is valid against both `Goal.period` (nullable) and
  // `KeyResult.period` (required).
  const periodClause: string | { in: string[] } | null =
    period === null
      ? null
      : typeof period === "string"
        ? period
        : { in: [...period] };

  const and: Prisma.GoalWhereInput[] = [];
  if (periodClause !== null) {
    and.push({
      OR: [
        { period: periodClause },
        { keyResults: { some: { period: periodClause } } },
      ],
    });
  }
  if (onlyMine) {
    and.push({
      OR: [
        { driUserId: userId },
        { keyResults: { some: { driUserId: userId } } },
      ],
    });
  }

  return {
    status: { not: "archived" },
    ...(and.length > 0 ? { AND: and } : {}),
  };
}
