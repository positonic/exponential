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
    db.transcriptionSession.findMany.mockResolvedValue([] as never);
    db.workspace.findUnique.mockResolvedValue({ id: "ws1", slug: "acme" } as never);
    db.product.findMany.mockResolvedValue([] as never);
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
    expect(subject.message).toContain("No meetings yesterday");
    expect(subject.message).toContain("No meetings today");
    expect(subject.message).toContain("No active cycle");
    expect(subject.message).toContain("Nothing committed to you");
    // No default workspace → no workspace-scoped reads at all.
    expect(db.workspace.findUnique).not.toHaveBeenCalled();
    expect(db.product.findMany).not.toHaveBeenCalled();
  });

  it("renders the exact plain-text and markdown digest for a full Europe/Berlin fixture day", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "u1", name: "Ada Lovelace", email: "ada@acme.test", defaultWorkspaceId: "ws1",
    } as never);
    db.action.findMany.mockResolvedValue([
      berlinAction({ id: "a1", name: "Pay Malte", scheduledStart: new Date("2026-09-09T06:00:00.000Z") }),
      berlinAction({ id: "a2", name: "Old bill", dueDate: new Date("2026-09-08T10:00:00.000Z") }),
    ] as never);
    db.transcriptionSession.findMany.mockResolvedValue([
      { id: "rec-standup", title: "CLEAR daily standup", meetingDate: new Date("2026-09-08T07:02:00.000Z") },
      { id: "rec-sync", title: "Pipeline sync", meetingDate: new Date("2026-09-08T14:30:00.000Z") },
    ] as never);
    db.product.findMany.mockResolvedValue([
      { id: "p1", name: "CLEAR", slug: "clear", funTicketIds: true },
    ] as never);
    db.list.findFirst.mockResolvedValue({
      id: "cy1", name: "Cycle 15", status: "ACTIVE",
      startDate: new Date("2026-09-02T22:00:00.000Z"), endDate: new Date("2026-09-16T22:00:00.000Z"),
    } as never);
    const tk = (over: Record<string, unknown>) => ({
      id: "t", shortId: null, number: 0, title: "t", status: "COMMITTED", points: null,
      assigneeId: "u2", updatedAt: new Date("2026-09-01T00:00:00.000Z"), ...over,
    });
    db.ticket.findMany.mockResolvedValue([
      tk({ id: "t1", shortId: "red.ridge", number: 532, title: "x.com signals - poc", status: "IN_PROGRESS", points: 2, assigneeId: "u1" }),
      tk({ id: "t2", shortId: "new.nest", number: 154, title: "Specify a pipeline testing thunderdome", status: "COMMITTED", assigneeId: "u1" }),
      tk({ id: "t3", shortId: "raw.reef", number: 3, title: "Raw idea", status: "BACKLOG", assigneeId: "u1" }),
      tk({ id: "t4", shortId: "done.deal", number: 4, title: "Shipped", status: "DONE", points: 3 }),
      tk({ id: "t5", shortId: "busy.bee", number: 5, title: "Theirs", status: "IN_PROGRESS", points: 5 }),
    ] as never);
    const readCalendar: CalendarReader = async () => [
      { summary: "CLEAR daily standup", start: { dateTime: "2026-09-08T07:00:00.000Z" }, end: { dateTime: "2026-09-08T07:15:00.000Z" } },
      { summary: "Coffee with Ira", start: { dateTime: "2026-09-08T12:00:00.000Z" }, end: { dateTime: "2026-09-08T12:30:00.000Z" } },
      { summary: "Offsite", start: { date: "2026-09-09" }, end: { date: "2026-09-10" } },
      { summary: "Pipeline sync", start: { dateTime: "2026-09-09T08:00:00.000Z" }, end: { dateTime: "2026-09-09T09:00:00.000Z" } },
    ];

    const subject = await emittedDailySubject(readCalendar);

    expect(subject.title).toBe("☀️ Daily summary");
    expect(subject.message).toBe(
      [
        "☀️ Good morning Ada! 👋",
        "",
        "⏪ Yesterday",
        "1. 09:00 CLEAR daily standup — recording",
        "   https://app.test/recording/rec-standup",
        "2. 14:00 Coffee with Ira",
        "3. 16:30 Pipeline sync (recorded) — recording",
        "   https://app.test/recording/rec-sync",
        "",
        "📅 Today's meetings",
        "1. Offsite",
        "2. 10:00 Pipeline sync",
        "",
        "✅ Today's actions",
        "• Pay Malte",
        "1 overdue → https://app.test/today",
        "",
        "🔄 Current cycle — Cycle 15 · 3 Sep – 17 Sep · 8 days left",
        "3 / 10 pts done · 46% elapsed · Behind pace",
        "   https://app.test/w/acme/products/clear/cycles/cy1",
        "Your in-flight tickets:",
        "• red.ridge x.com signals - poc — In progress",
        "   https://app.test/w/acme/products/clear/tickets/t1",
        "",
        "⏭ Up next",
        "1. new.nest Specify a pipeline testing thunderdome",
        "   https://app.test/w/acme/products/clear/tickets/t2",
        "1 of your cycle tickets still needs refinement",
        "",
        "💪 Have a productive day!",
      ].join("\n"),
    );
    expect(subject.markdown).toBe(
      [
        "☀️ Good morning Ada! 👋",
        "",
        "**⏪ Yesterday**",
        "1. 09:00 CLEAR daily standup — [recording](https://app.test/recording/rec-standup)",
        "2. 14:00 Coffee with Ira",
        "3. 16:30 Pipeline sync (recorded) — [recording](https://app.test/recording/rec-sync)",
        "",
        "**📅 Today's meetings**",
        "1. Offsite",
        "2. 10:00 Pipeline sync",
        "",
        "**✅ Today's actions**",
        "- Pay Malte",
        "1 overdue → [/today](https://app.test/today)",
        "",
        "**🔄 Current cycle** — [Cycle 15](https://app.test/w/acme/products/clear/cycles/cy1) · 3 Sep – 17 Sep · 8 days left",
        "3 / 10 pts done · 46% elapsed · Behind pace",
        "Your in-flight tickets:",
        "- [red.ridge x.com signals - poc](https://app.test/w/acme/products/clear/tickets/t1) — In progress",
        "",
        "**⏭ Up next**",
        "1. [new.nest Specify a pipeline testing thunderdome](https://app.test/w/acme/products/clear/tickets/t2)",
        "1 of your cycle tickets still needs refinement",
        "",
        "💪 Have a productive day!",
      ].join("\n"),
    );
    // Dedup key input is untouched: one summary per user per local day.
    expect(subject.periodKey).toBe("2026-09-09");
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

  it("attaches yesterday's recorded Meetings to their events and appends unmatched ones as recorded", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "u1", name: "Ada Lovelace", email: "ada@acme.test", defaultWorkspaceId: "ws1",
    } as never);
    db.action.findMany.mockResolvedValue([] as never);
    db.transcriptionSession.findMany.mockResolvedValue([
      { id: "rec-standup", title: "CLEAR daily standup", meetingDate: new Date("2026-09-08T07:02:00.000Z") },
      { id: "rec-sync", title: "Pipeline sync", meetingDate: new Date("2026-09-08T14:30:00.000Z") },
      { id: "rec-nodate", title: "Undated", meetingDate: null },
    ] as never);
    const readCalendar: CalendarReader = async () => [
      { summary: "CLEAR daily standup", start: { dateTime: "2026-09-08T07:00:00.000Z" }, end: { dateTime: "2026-09-08T07:15:00.000Z" } },
      { summary: "Coffee with Ira", start: { dateTime: "2026-09-08T12:00:00.000Z" }, end: { dateTime: "2026-09-08T12:30:00.000Z" } },
    ];

    const subject = await emittedDailySubject(readCalendar);

    // Scoped to the summary workspace and yesterday's local window, through the shared access where.
    expect(db.transcriptionSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            expect.objectContaining({ OR: expect.any(Array) }),
            { workspaceId: "ws1" },
            { meetingDate: { gte: new Date("2026-09-07T22:00:00.000Z"), lt: new Date("2026-09-08T22:00:00.000Z") } },
          ],
        },
      }),
    );
    expect(subject.message).toContain(
      "⏪ Yesterday\n1. 09:00 CLEAR daily standup — recording\n   https://app.test/recording/rec-standup\n2. 14:00 Coffee with Ira\n3. 16:30 Pipeline sync (recorded) — recording\n   https://app.test/recording/rec-sync\n",
    );
    expect(subject.markdown).toContain(
      "**⏪ Yesterday**\n1. 09:00 CLEAR daily standup — [recording](https://app.test/recording/rec-standup)\n2. 14:00 Coffee with Ira\n3. 16:30 Pipeline sync (recorded) — [recording](https://app.test/recording/rec-sync)\n",
    );
  });

  it("skips the recordings query when the user has no default workspace", async () => {
    db.action.findMany.mockResolvedValue([] as never);
    await emittedDailySubject();
    expect(db.transcriptionSession.findMany).not.toHaveBeenCalled();
  });

  describe("current cycle", () => {
    const cycle = {
      id: "cy1",
      name: "Cycle 15",
      status: "ACTIVE",
      startDate: new Date("2026-09-02T22:00:00.000Z"), // 3 Sep 00:00 Berlin
      endDate: new Date("2026-09-16T22:00:00.000Z"), // 17 Sep 00:00 Berlin
    };
    const tk = (over: Record<string, unknown>) => ({
      id: "t", shortId: null, number: 0, title: "t", status: "COMMITTED", points: null,
      assigneeId: "u2", updatedAt: new Date("2026-09-01T00:00:00.000Z"), ...over,
    });

    beforeEach(() => {
      db.user.findUnique.mockResolvedValue({
        id: "u1", name: "Ada Lovelace", email: "ada@acme.test", defaultWorkspaceId: "ws1",
      } as never);
      db.action.findMany.mockResolvedValue([] as never);
      db.product.findMany.mockResolvedValue([
        { id: "p1", name: "CLEAR", slug: "clear", funTicketIds: true },
      ] as never);
    });

    it("renders the condensed hero from the shared rollup with the user's in-flight tickets", async () => {
      db.list.findFirst.mockResolvedValue(cycle as never);
      db.ticket.findMany.mockResolvedValue([
        tk({ id: "t1", shortId: "red.ridge", number: 532, title: "x.com signals - poc", status: "IN_PROGRESS", points: 2, assigneeId: "u1" }),
        tk({ id: "t2", shortId: "blue.bay", number: 100, title: "Fix login", status: "BLOCKED", points: 1, assigneeId: "u1" }),
        tk({ id: "t3", shortId: "done.deal", number: 101, title: "Shipped", status: "DONE", points: 3, assigneeId: "u1" }),
        tk({ id: "t4", shortId: "not.mine", number: 102, title: "Someone else's", status: "IN_PROGRESS", points: 4 }),
      ] as never);

      const subject = await emittedDailySubject();

      // Products where the user holds tickets, in the summary workspace only.
      expect(db.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: "ws1", tickets: { some: { assigneeId: "u1" } } },
          orderBy: { name: "asc" },
        }),
      );
      // The cycle hero: points, 3 Sep–16 Sep window, 7 days left, 50% elapsed → 3/10 done = behind.
      expect(subject.message).toContain(
        "🔄 Current cycle — Cycle 15 · 3 Sep – 17 Sep · 8 days left\n3 / 10 pts done · 46% elapsed · Behind pace\n   https://app.test/w/acme/products/clear/cycles/cy1\nYour in-flight tickets:\n• red.ridge x.com signals - poc — In progress\n   https://app.test/w/acme/products/clear/tickets/t1\n• blue.bay Fix login — Blocked\n   https://app.test/w/acme/products/clear/tickets/t2\n",
      );
      expect(subject.markdown).toContain(
        "**🔄 Current cycle** — [Cycle 15](https://app.test/w/acme/products/clear/cycles/cy1) · 3 Sep – 17 Sep · 8 days left\n3 / 10 pts done · 46% elapsed · Behind pace\nYour in-flight tickets:\n- [red.ridge x.com signals - poc](https://app.test/w/acme/products/clear/tickets/t1) — In progress\n- [blue.bay Fix login](https://app.test/w/acme/products/clear/tickets/t2) — Blocked\n",
      );
      expect(subject.message).not.toContain("Someone else's");
      expect(subject.message).not.toContain("Shipped");
    });

    it("uses ticket units and Linear-style ids when the product has no fun ids", async () => {
      db.product.findMany.mockResolvedValue([
        { id: "p1", name: "Clear Pipeline", slug: "clear", funTicketIds: false },
      ] as never);
      db.list.findFirst.mockResolvedValue(cycle as never);
      db.ticket.findMany.mockResolvedValue([
        tk({ id: "t1", number: 7, title: "Thunderdome", status: "QA", assigneeId: "u1" }),
        tk({ id: "t2", number: 8, title: "Other", status: "DEPLOYED" }),
      ] as never);

      const subject = await emittedDailySubject();

      expect(subject.message).toContain("1 / 2 tickets done");
      expect(subject.message).toContain("• CP-7 Thunderdome — QA");
    });

    it("lists the user's COMMITTED cycle tickets under Up next (latest touched first) with an unrefined count", async () => {
      db.list.findFirst.mockResolvedValue(cycle as never);
      db.ticket.findMany.mockResolvedValue([
        tk({ id: "t1", shortId: "old.oak", number: 1, title: "Define delivery playbook", status: "COMMITTED", assigneeId: "u1", updatedAt: new Date("2026-09-01T00:00:00.000Z") }),
        tk({ id: "t2", shortId: "new.nest", number: 2, title: "Specify a pipeline testing thunderdome", status: "COMMITTED", assigneeId: "u1", updatedAt: new Date("2026-09-08T00:00:00.000Z") }),
        tk({ id: "t3", shortId: "raw.reef", number: 3, title: "Raw idea", status: "BACKLOG", assigneeId: "u1" }),
        tk({ id: "t4", shortId: "fuzzy.fen", number: 4, title: "Needs shaping", status: "NEEDS_REFINEMENT", assigneeId: "u1" }),
        tk({ id: "t5", shortId: "prep.pine", number: 5, title: "Ready", status: "READY_TO_PLAN", assigneeId: "u1" }),
        tk({ id: "t6", shortId: "busy.bee", number: 6, title: "In flight", status: "IN_PROGRESS", assigneeId: "u1" }),
        tk({ id: "t7", shortId: "not.mine", number: 7, title: "Theirs", status: "COMMITTED" }),
      ] as never);

      const subject = await emittedDailySubject();

      expect(subject.message).toContain(
        "⏭ Up next\n1. new.nest Specify a pipeline testing thunderdome\n   https://app.test/w/acme/products/clear/tickets/t2\n2. old.oak Define delivery playbook\n   https://app.test/w/acme/products/clear/tickets/t1\n3 of your cycle tickets still need refinement\n",
      );
      expect(subject.markdown).toContain(
        "**⏭ Up next**\n1. [new.nest Specify a pipeline testing thunderdome](https://app.test/w/acme/products/clear/tickets/t2)\n2. [old.oak Define delivery playbook](https://app.test/w/acme/products/clear/tickets/t1)\n3 of your cycle tickets still need refinement\n",
      );
      // Refinement-stage and in-flight tickets never appear under Up next; the count excludes in-flight.
      for (const absent of ["Raw idea", "Needs shaping", "Ready", "Theirs"]) {
        expect(subject.message).not.toContain(absent);
      }
      expect(subject.message).toContain("• busy.bee In flight — In progress");
    });

    it("renders the empty state when no product has a current cycle", async () => {
      db.list.findFirst.mockResolvedValue(null as never);

      const subject = await emittedDailySubject();

      expect(db.list.findFirst).toHaveBeenCalledTimes(2); // own cycle, then legacy shared fallback
      expect(db.ticket.findMany).not.toHaveBeenCalled();
      expect(subject.message).toContain("🔄 Current cycle\nNo active cycle\n");
    });
  });
});
