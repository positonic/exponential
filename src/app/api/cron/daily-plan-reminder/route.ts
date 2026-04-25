import { type NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "~/server/db";
import { sendPushToUser } from "~/server/services/notifications/WebPushService";
import { startOfDay, endOfDay } from "date-fns";

/**
 * Cron endpoint: sends a morning push notification to all users with push subscriptions.
 * Tells them how many actions they have planned for today.
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
    const dayStart = startOfDay(today);
    const dayEnd = endOfDay(today);

    const results = [];

    for (const user of usersWithPush) {
      // Count today's planned actions
      const actionCount = await db.dailyPlanAction.count({
        where: {
          dailyPlan: {
            userId: user.id,
            date: {
              gte: dayStart,
              lte: dayEnd,
            },
          },
        },
      });

      const firstName = user.name?.split(" ")[0] ?? "there";
      const body =
        actionCount > 0
          ? `You have ${actionCount} action${actionCount === 1 ? "" : "s"} planned for today. Let's go!`
          : `No actions planned yet. Start your day by planning what to focus on.`;

      const pushResult = await sendPushToUser(
        user.id,
        {
          title: `Good morning, ${firstName}!`,
          body,
          tag: "daily-plan",
          url: "/today",
        },
        db,
      );

      results.push({
        userId: user.id,
        actionCount,
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
