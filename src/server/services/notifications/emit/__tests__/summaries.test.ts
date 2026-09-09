import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import { generateScheduledSummaries } from "~/server/services/notifications/emit/summaries";
import { emitNotification } from "~/server/services/notifications/emit/emitNotification";
import type { CalendarReader } from "~/server/services/notifications/emit/dailySummary";

vi.mock("~/server/services/notifications/emit/emitNotification", () => ({
  emitNotification: vi.fn().mockResolvedValue(undefined),
}));

const db = mockDeep<PrismaClient>();

function pref(overrides: Record<string, unknown> = {}) {
  return {
    userId: "u1",
    timezone: "UTC",
    dailySummaryTime: "09:00",
    dailySummary: true,
    weeklySummary: false,
    weeklyDayOfWeek: 1,
    ...overrides,
  };
}

beforeEach(() => {
  mockReset(db);
  vi.clearAllMocks();
  // Digest data fixtures (real templates render from these).
  db.user.findUnique.mockResolvedValue({ id: "u1", name: "Ada", email: "ada@acme.test" } as never);
  db.action.findMany.mockResolvedValue([] as never);
  db.action.count.mockResolvedValue(0 as never);
  db.project.findMany.mockResolvedValue([] as never);
});

describe("generateScheduledSummaries", () => {
  it("emits a daily summary at the configured local time (within the fire window)", async () => {
    db.notificationPreference.findMany.mockResolvedValue([pref()] as never);

    const result = await generateScheduledSummaries(db, new Date("2026-07-23T09:05:00.000Z"), {
      readCalendar: noEvents,
    });

    expect(emitNotification).toHaveBeenCalledTimes(1);
    expect(emitNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "summary",
        actorUserId: null,
        subject: expect.objectContaining({
          userId: "u1",
          kind: "daily",
          periodKey: "2026-07-23",
        }),
      }),
    );
    expect(result.emitted).toBe(1);
  });

  it("does not emit before the configured time", async () => {
    db.notificationPreference.findMany.mockResolvedValue([pref()] as never);

    await generateScheduledSummaries(db, new Date("2026-07-23T08:00:00.000Z"));

    expect(emitNotification).not.toHaveBeenCalled();
  });

  it("does not emit outside the fire window (well after the configured time)", async () => {
    db.notificationPreference.findMany.mockResolvedValue([pref()] as never);

    await generateScheduledSummaries(db, new Date("2026-07-23T11:00:00.000Z"));

    expect(emitNotification).not.toHaveBeenCalled();
  });

  it("respects the user's timezone (09:00 New York = 13:00 UTC in July)", async () => {
    db.notificationPreference.findMany.mockResolvedValue([
      pref({ timezone: "America/New_York" }),
    ] as never);

    await generateScheduledSummaries(db, new Date("2026-07-23T13:05:00.000Z"), {
      readCalendar: noEvents,
    });

    expect(emitNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.objectContaining({ kind: "daily", periodKey: "2026-07-23" }),
      }),
    );
  });

  it("emits a weekly summary only on the configured weekday, keyed per ISO week", async () => {
    // 2026-07-23 is a Thursday (getDay = 4).
    db.notificationPreference.findMany.mockResolvedValue([
      pref({ dailySummary: false, weeklySummary: true, weeklyDayOfWeek: 4 }),
    ] as never);

    await generateScheduledSummaries(db, new Date("2026-07-23T09:05:00.000Z"));

    expect(emitNotification).toHaveBeenCalledTimes(1);
    expect(emitNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.objectContaining({ kind: "weekly", periodKey: "2026-W30" }),
      }),
    );
  });

  it("does not emit the weekly summary on other weekdays", async () => {
    // Thursday now, but the user's weekly day is Monday (1).
    db.notificationPreference.findMany.mockResolvedValue([
      pref({ dailySummary: false, weeklySummary: true, weeklyDayOfWeek: 1 }),
    ] as never);

    await generateScheduledSummaries(db, new Date("2026-07-23T09:05:00.000Z"));

    expect(emitNotification).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Daily summary digest (ADR-0059): built from the user's data, rendered as
// plain text (`message`) and markdown (`markdown`) for a Europe/Berlin day.
// ---------------------------------------------------------------------------

/** Fixture instant: 2026-09-09 07:05 UTC = 09:05 in Berlin (CEST), inside the 09:00 fire window. */
const BERLIN_NOW = new Date("2026-09-09T07:05:00.000Z");

function berlinAction(overrides: Record<string, unknown>) {
  return {
    id: "a",
    name: "Action",
    status: "ACTIVE",
    priority: "Quick",
    scheduledStart: null,
    dueDate: null,
    projectId: null,
    completedAt: null,
    ...overrides,
  };
}

/** Fixture calendar reader — unit tests must never reach Google/Microsoft. */
const noEvents: CalendarReader = async () => [];

async function emittedDailySubject(readCalendar: CalendarReader = noEvents) {
  db.notificationPreference.findMany.mockResolvedValue([
    pref({ timezone: "Europe/Berlin" }),
  ] as never);
  await generateScheduledSummaries(db, BERLIN_NOW, { readCalendar });
  expect(emitNotification).toHaveBeenCalledTimes(1);
  const call = vi.mocked(emitNotification).mock.calls[0]![0];
  if (call.category !== "summary") throw new Error("expected a summary emit");
  return call.subject;
}

describe("generateScheduledSummaries — daily summary digest", () => {
  beforeEach(() => {
    process.env.NEXTAUTH_URL = "https://app.test";
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      name: "Ada Lovelace",
      email: "ada@acme.test",
      defaultWorkspaceId: null,
    } as never);
  });

  afterEach(() => {
    delete process.env.NEXTAUTH_URL;
  });

  it("lists exactly the partitionActions `todays` bucket, evaluated in the user's local day, with an overdue count", async () => {
    db.action.findMany.mockResolvedValue([
      // Scheduled today with no due date — the "Pay Malte" shape.
      berlinAction({ id: "a1", name: "Pay Malte", scheduledStart: new Date("2026-09-09T06:00:00.000Z") }),
      // 22:30 UTC on the 8th is 00:30 on the 9th in Berlin: today, not overdue.
      berlinAction({ id: "a2", name: "Midnight in Berlin", scheduledStart: new Date("2026-09-08T22:30:00.000Z") }),
      // Due yesterday, never scheduled → overdue (counted, not listed).
      berlinAction({ id: "a3", name: "Old bill", dueDate: new Date("2026-09-08T10:00:00.000Z") }),
      // Scheduled tomorrow → neither.
      berlinAction({ id: "a4", name: "Tomorrow", scheduledStart: new Date("2026-09-10T08:00:00.000Z") }),
    ] as never);

    const subject = await emittedDailySubject();

    expect(subject.kind).toBe("daily");
    expect(subject.title).toBe("☀️ Daily summary");
    expect(subject.message).toContain("☀️ Good morning Ada! 👋");
    expect(subject.message).toContain("✅ Today's actions\n• Pay Malte\n• Midnight in Berlin\n1 overdue → https://app.test/today");
    expect(subject.message).not.toContain("Old bill");
    expect(subject.message).not.toContain("Tomorrow");

    expect(subject.markdown).toContain("**✅ Today's actions**\n- Pay Malte\n- Midnight in Berlin\n1 overdue → [/today](https://app.test/today)");
    // The plain-text message never carries markdown syntax.
    expect(subject.message).not.toMatch(/\*\*|\]\(/);
  });

  it("queries the same ownership set as action.getTodaysActions, cross-workspace", async () => {
    db.action.findMany.mockResolvedValue([] as never);

    await emittedDailySubject();

    expect(db.action.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { createdById: "u1", assignees: { none: {} } },
            { assignees: { some: { userId: "u1" } } },
          ],
          status: "ACTIVE",
        },
      }),
    );
  });

  it("falls back to 'there' when the user has no name and renders the empty states", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u1", name: null, email: "x@y.z", defaultWorkspaceId: null } as never);
    db.action.findMany.mockResolvedValue([] as never);

    const subject = await emittedDailySubject();

    expect(subject.message).toContain("☀️ Good morning there! 👋");
    expect(subject.message).toContain("Nothing scheduled or due today\n0 overdue → https://app.test/today");
    expect(subject.message).toContain("No active cycle");
    expect(subject.message).toContain("Nothing committed to you");
  });

  it("reads the calendar once for [yesterday, tomorrow) local and splits events by local day", async () => {
    db.action.findMany.mockResolvedValue([] as never);
    const readCalendar = vi.fn<CalendarReader>().mockResolvedValue([
      { summary: "CLEAR daily standup", start: { dateTime: "2026-09-08T07:00:00.000Z" }, end: { dateTime: "2026-09-08T07:15:00.000Z" } },
      { summary: "Coffee with Ira", start: { dateTime: "2026-09-08T12:00:00.000Z" }, end: { dateTime: "2026-09-08T12:30:00.000Z" } },
      { summary: "Offsite", start: { date: "2026-09-09" }, end: { date: "2026-09-10" } },
      // 22:30 UTC on the 8th is 00:30 on the 9th in Berlin — today, not yesterday.
      { summary: "Late night", start: { dateTime: "2026-09-08T22:30:00.000Z" }, end: { dateTime: "2026-09-08T23:00:00.000Z" } },
      { summary: "Pipeline sync", start: { dateTime: "2026-09-09T08:00:00.000Z" }, end: { dateTime: "2026-09-09T09:00:00.000Z" } },
    ]);

    const subject = await emittedDailySubject(readCalendar);

    expect(readCalendar).toHaveBeenCalledTimes(1);
    expect(readCalendar).toHaveBeenCalledWith(
      "u1",
      new Date("2026-09-07T22:00:00.000Z"),
      new Date("2026-09-09T22:00:00.000Z"),
    );
    expect(subject.message).toContain(
      "⏪ Yesterday\n1. 09:00 CLEAR daily standup\n2. 14:00 Coffee with Ira\n\n📅 Today's meetings\n1. Offsite\n2. 00:30 Late night\n3. 10:00 Pipeline sync\n",
    );
    expect(subject.markdown).toContain(
      "**📅 Today's meetings**\n1. Offsite\n2. 00:30 Late night\n3. 10:00 Pipeline sync\n",
    );
  });
});
