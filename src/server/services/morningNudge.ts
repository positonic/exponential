/**
 * Phrasing for the morning push notification.
 *
 * Split out of the cron route so it can be unit-tested without importing the
 * route module, which pulls in the Prisma client and therefore the whole env.
 */

export interface MorningNudge {
  title: string;
  body: string;
}

/**
 * Pure, so the phrasing is testable without a database or a clock.
 *
 * Leads with the reframe when most of the overdue pile is bulk-written. "43
 * overdue" is a number that produces avoidance; "21 of those were created in
 * one batch" is a number that produces a decision.
 */
export function buildMorningNudge(args: {
  firstName: string;
  todayCount: number;
  overdueCount: number;
  cohortCount: number;
}): MorningNudge {
  const { firstName, todayCount, overdueCount, cohortCount } = args;
  const title = `Good morning, ${firstName}!`;

  const todayPart =
    todayCount > 0
      ? `${todayCount} action${todayCount === 1 ? "" : "s"} scheduled today`
      : "Nothing scheduled today";

  if (overdueCount === 0) {
    return {
      title,
      body:
        todayCount > 0
          ? `${todayPart}. Nothing overdue — nice.`
          : `${todayPart}, and nothing overdue.`,
    };
  }

  // Only reframe when the bulk-written share is the majority. Below that the
  // overdue count really is mostly real commitments, and softening it would lie.
  if (cohortCount > overdueCount / 2) {
    return {
      title,
      body: `${todayPart}, and ${overdueCount} overdue — but ${cohortCount} of those were created in one batch and were probably never really due. Worth two minutes to clear out.`,
    };
  }

  return {
    title,
    body: `${todayPart}, and ${overdueCount} overdue.`,
  };
}
