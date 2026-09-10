import { describe, it, expect, beforeEach } from "vitest";

import { getTestDb } from "~/test/test-db";
import { createUser, createAction } from "~/test/factories";
import { createApiKeyCaller } from "~/test/trpc-helpers";
import { mintVoiceSessionToken } from "~/server/utils/voice-token";

type Db = ReturnType<typeof getTestDb>;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The `DailySummaryDigest` fields this contract pins (see dailyContext.ts). */
interface BriefingShape {
  todayMeetings: unknown[];
  todaysActions: unknown[];
  overdueActions: unknown[];
  overdueCount: number;
  cycles: unknown[];
}

describe("voice get_todays_plan (integration)", () => {
  let db: Db;
  beforeEach(() => {
    db = getTestDb();
  });

  function callerFor(userId: string) {
    return { token: mintVoiceSessionToken({ id: userId }), caller: createApiKeyCaller(null) };
  }

  it("returns a spoken overview naming today's actions and counting the overdue", async () => {
    const user = await createUser(db);
    // Seed one due-today and one overdue action. Use a 2-day offset for overdue
    // so it's before "today" under any reasonable day-boundary interpretation.
    await createAction(db, {
      createdById: user.id,
      name: "ship the release",
      dueDate: new Date(),
    });
    await createAction(db, {
      createdById: user.id,
      name: "reply to the auditor",
      dueDate: new Date(Date.now() - 2 * DAY_MS),
    });

    const { token, caller } = callerFor(user.id);
    const res = await caller.voice.dispatch({
      token,
      toolName: "get_todays_plan",
      args: { timezone: "UTC" },
    });

    // Read-only: never gates.
    expect(res.needsConfirmation).toBe(false);

    // Bounded, and names the action rather than only counting it.
    expect(res.speakable.length).toBeGreaterThan(0);
    expect(res.speakable.length).toBeLessThanOrEqual(700);
    expect(res.speakable).toContain("1 action for today: ship the release.");
    expect(res.speakable).toContain("1 action overdue.");

    // Reuses the Daily summary digest: structured payload carries it.
    const structured = res.structured as {
      briefing: BriefingShape;
      focus: string;
      timezone: string;
    };
    expect(structured.focus).toBe("overview");
    expect(structured.timezone).toBe("UTC");
    expect(structured.briefing.todaysActions.length).toBe(1);
    expect(structured.briefing.overdueActions.length).toBe(1);
    expect(structured.briefing.overdueCount).toBe(1);
  });

  it("reads the overdue actions by name when asked for that focus", async () => {
    const user = await createUser(db);
    await createAction(db, {
      createdById: user.id,
      name: "reply to the auditor",
      dueDate: new Date(Date.now() - 2 * DAY_MS),
    });

    const { token, caller } = callerFor(user.id);
    const res = await caller.voice.dispatch({
      token,
      toolName: "get_todays_plan",
      args: { focus: "overdue", timezone: "UTC" },
    });

    expect(res.needsConfirmation).toBe(false);
    expect(res.speakable).toBe("1 action overdue: reply to the auditor.");
    expect((res.structured as { focus: string }).focus).toBe("overdue");
  });

  it("reports an all-clear when nothing is due or overdue", async () => {
    const user = await createUser(db);
    const { token, caller } = callerFor(user.id);

    const res = await caller.voice.dispatch({ token, toolName: "get_todays_plan" });

    expect(res.needsConfirmation).toBe(false);
    expect(res.speakable.toLowerCase()).toContain("nothing scheduled or due today");
    expect(res.speakable.toLowerCase()).toContain("nothing overdue");
    const briefing = (res.structured as { briefing: BriefingShape }).briefing;
    expect(briefing.todaysActions.length).toBe(0);
    expect(briefing.overdueActions.length).toBe(0);
  });

  it("rejects a briefing call with no valid voice-session token", async () => {
    await expect(
      createApiKeyCaller(null).voice.dispatch({ token: "garbage", toolName: "get_todays_plan" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
