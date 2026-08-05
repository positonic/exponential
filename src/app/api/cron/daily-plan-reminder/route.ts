import { type NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "~/server/db";
import { sendPushToUser } from "~/server/services/notifications/WebPushService";
import { partitionActions } from "~/lib/actions/partition";
import { groupOverdueCohorts } from "~/lib/actions/triage";
import { buildMorningNudge } from "~/server/services/morningNudge";

/**
 * Cron endpoint: the morning nudge.
 *
 * Describes what is actually on the user's plate, using the same partition the
 * /today page renders ([ADR-0034]) and the same cohort analysis as
 * `action.getOverdueTriage` ([ADR-0052]).
 *
 * This used to count `DailyPlanAction` rows — a *fourth* definition of "today",
 * populated only when someone ran the /daily-plan wizard. Users who never ran
 * the wizard got "No actions planned yet. Start your day by planning what to
 * focus on." every single morning while dozens of real actions sat overdue, and
 * the notification never mentioned overdue work at all.
 *
 * Deliberately no LLM here: this is a one-line push that fires for every user
 * with a subscription, and a template gets the numbers right at zero cost and
 * zero latency. The generated briefing is a separate, user-triggered path
 * (`scheduling.getSchedulingSuggestions`).
 *
 * Call via: GET /api/cron/daily-plan-reminder
 * Vercel cron or external scheduler, protected by CRON_SECRET.
 */

export async function GET(_request: NextRequest) {
  try {
    const headersList = await headers();
    const authHeader = headersList.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Find all users who have at least one push subscription
    const usersWithPush = await db.user.findMany({
      where: {
        pushSubscriptions: { some: {} },
      },
      select: {
        id: true,
        name: true,
      },
    });

    const today = new Date();
    const results = [];

    for (const user of usersWithPush) {
      // Same ownership rule as action.getTodaysActions: created-by-me with no
      // assignees, or assigned to me. Cross-workspace, like /today.
      const actions = await db.action.findMany({
        where: {
          OR: [
            { createdById: user.id, assignees: { none: {} } },
            { assignees: { some: { userId: user.id } } },
          ],
          status: "ACTIVE",
        },
        select: {
          id: true,
          name: true,
          status: true,
          priority: true,
          scheduledStart: true,
          dueDate: true,
          projectId: true,
          completedAt: true,
          project: { select: { name: true } },
        },
      });

      const { overdue, todays } = partitionActions(actions, { today });
      const triage = groupOverdueCohorts(overdue, { today });

      const { title, body } = buildMorningNudge({
        firstName: user.name?.split(" ")[0] ?? "there",
        todayCount: todays.length,
        overdueCount: overdue.length,
        cohortCount: triage.cohortCount,
      });

      const pushResult = await sendPushToUser(
        user.id,
        {
          title,
          body,
          tag: "daily-plan",
          url: "/today",
        },
        db,
      );

      results.push({
        userId: user.id,
        todayCount: todays.length,
        overdueCount: overdue.length,
        cohortCount: triage.cohortCount,
        ...pushResult,
      });
    }

    return NextResponse.json({
      success: true,
      usersNotified: results.length,
      results,
    });
  } catch (error) {
    console.error("[daily-plan-reminder] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
