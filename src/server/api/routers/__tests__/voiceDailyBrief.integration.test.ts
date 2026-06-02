import { describe, it, expect, beforeEach } from "vitest";

import { getTestDb } from "~/test/test-db";
import { createUser, createAction } from "~/test/factories";
import { createApiKeyCaller } from "~/test/trpc-helpers";
import { mintVoiceSessionToken } from "~/server/utils/voice-token";

type Db = ReturnType<typeof getTestDb>;

const DAY_MS = 24 * 60 * 60 * 1000;

interface BriefingShape {
  dueTodayActions: unknown[];
  overdueActions: unknown[];
  projectsNeedingAttention: unknown[];
}

describe("voice get_todays_plan (integration)", () => {
  let db: Db;
  beforeEach(() => {
    db = getTestDb();
  });

  function callerFor(userId: string) {
    return { token: mintVoiceSessionToken({ id: userId }), caller: createApiKeyCaller(null) };
  }

  it("returns a concise spoken briefing covering due-today and overdue", async () => {
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
    const res = await caller.voice.dispatch({ token, toolName: "get_todays_plan" });

    // Read-only: never gates.
    expect(res.needsConfirmation).toBe(false);

    // Concise + bounded, not a long readout.
    expect(res.speakable.length).toBeGreaterThan(0);
    expect(res.speakable.length).toBeLessThanOrEqual(240);
    expect(res.speakable.toLowerCase()).toContain("due today");
    expect(res.speakable.toLowerCase()).toContain("overdue");

    // Reuses the briefing builder: structured payload carries its data.
    const briefing = (res.structured as { briefing: BriefingShape }).briefing;
    expect(briefing.dueTodayActions.length).toBe(1);
    expect(briefing.overdueActions.length).toBe(1);
  });

  it("reports an all-clear when nothing is due or overdue", async () => {
    const user = await createUser(db);
    const { token, caller } = callerFor(user.id);

    const res = await caller.voice.dispatch({ token, toolName: "get_todays_plan" });

    expect(res.needsConfirmation).toBe(false);
    expect(res.speakable.toLowerCase()).toContain("nothing");
    const briefing = (res.structured as { briefing: BriefingShape }).briefing;
    expect(briefing.dueTodayActions.length).toBe(0);
    expect(briefing.overdueActions.length).toBe(0);
  });

  it("rejects a briefing call with no valid voice-session token", async () => {
    await expect(
      createApiKeyCaller(null).voice.dispatch({ token: "garbage", toolName: "get_todays_plan" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
