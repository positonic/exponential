import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Ceremony, CeremonyOccurrence, PrismaClient } from "@prisma/client";
import { mockDeep } from "vitest-mock-extended";
import type { CalendarReader } from "~/server/services/notifications/emit/dailySummary/calendar";
import { activityTodaySection } from "../sections/activity_today";
import { completedTodaySection } from "../sections/completed_today";
import { timeTodaySection } from "../sections/time_today";
import { tomorrowSection } from "../sections/tomorrow";
import { yesterdaySection } from "../sections/yesterday";
import type { SectionContext } from "../types";

const { reportHandledErrorServer, dayReport } = vi.hoisted(() => ({ reportHandledErrorServer: vi.fn(), dayReport: vi.fn() }));
vi.mock("~/server/utils/reportHandledErrorServer", () => ({ reportHandledErrorServer }));
vi.mock("~/server/services/timeEntry/TimeEntryService", () => ({
  TimeEntryService: class {
    dayReport = dayReport;
  },
}));

// 19:00 Berlin on Wed 9 Sep 2026; the local day is [8 Sep 22:00Z, 9 Sep 22:00Z).
const start = new Date("2026-09-09T17:00:00.000Z");
const todayStart = new Date("2026-09-08T22:00:00.000Z");
const tomorrowStart = new Date("2026-09-09T22:00:00.000Z");

type Db = ReturnType<typeof mockDeep<PrismaClient>>;

function ctx(db: PrismaClient, overrides: Partial<SectionContext> = {}): SectionContext {
  return {
    db,
    workspaceId: "ws-personal",
    ceremony: { id: "cer-1", workspaceId: "ws-personal", productId: null, ownerId: "u-1", timezone: "Europe/Berlin" } as Ceremony,
    occurrence: { id: "occ-1", scheduledStart: start } as CeremonyOccurrence,
    previousOccurrence: null,
    participantUserIds: ["u-1"],
    projectIds: [],
    now: start,
    workspacePath: "/w/personal-abc",
    ...overrides,
  };
}

function setup(type: "personal" | "team" = "personal"): Db {
  const db = mockDeep<PrismaClient>();
  db.user.findMany.mockResolvedValue([{ id: "u-1", name: "James" }] as never);
  db.workspace.findUnique.mockResolvedValue({ type } as never);
  db.workspace.findMany.mockResolvedValue([{ id: "ws-personal" }, { id: "ws-acme" }] as never);
  return db;
}

beforeEach(() => {
  reportHandledErrorServer.mockReset();
  dayReport.mockReset();
});

describe("completed_today section", () => {
  it("lists today's completed actions across every accessible workspace when the ceremony is personal", async () => {
    const db = setup();
    db.action.findMany.mockResolvedValue([
      { id: "a-1", name: "Ship <b>PR</b>", completedAt: new Date("2026-09-09T08:15:00.000Z"), workspace: { slug: "acme", name: "Acme" } },
      { id: "a-2", name: "Pay rent", completedAt: new Date("2026-09-09T12:00:00.000Z"), workspace: { slug: "personal-abc", name: "Personal" } },
    ] as never);

    const items = await completedTodaySection.run(ctx(db), { key: "done", type: "completed_today", title: "Done today" });

    const where = db.action.findMany.mock.calls[0]![0]!.where!;
    expect(where.AND).toEqual([
      { OR: [{ createdById: "u-1", assignees: { none: {} } }, { assignees: { some: { userId: "u-1" } } }] },
      { status: "COMPLETED" },
      { completedAt: { gte: todayStart, lt: tomorrowStart } },
      { workspaceId: { in: ["ws-personal", "ws-acme"] } },
    ]);
    expect(items).toMatchObject([
      { id: "done:action:a-1", title: "Ship PR", detail: "Acme · done 10:15", href: "/w/acme/actions/a-1" },
      { id: "done:action:a-2", title: "Pay rent", detail: "Personal · done 14:00", href: "/w/personal-abc/actions/a-2" },
    ]);
  });

  it("stays inside its own workspace when the ceremony is not in a personal workspace", async () => {
    const db = setup("team");
    db.action.findMany.mockResolvedValue([] as never);
    await completedTodaySection.run(ctx(db, { workspaceId: "ws-team" }), { key: "done", type: "completed_today", title: "Done today" });
    expect(db.workspace.findMany).not.toHaveBeenCalled();
    expect(db.action.findMany.mock.calls[0]![0]!.where!.AND).toContainEqual({ workspaceId: { in: ["ws-team"] } });
  });
});

describe("activity_today section", () => {
  it("collapses repeats, skips completions and bookkeeping, and labels each line with verb and noun", async () => {
    const db = setup();
    db.workspaceActivityEvent.findMany.mockResolvedValue([
      { entityType: "ticket_comment", entityId: "t-1", action: "commented", metadata: { title: "Login bug" }, workspace: { name: "Acme" } },
      { entityType: "ticket_comment", entityId: "t-1", action: "commented", metadata: { title: "Login bug" }, workspace: { name: "Acme" } },
      { entityType: "action", entityId: "a-1", action: "completed", metadata: { name: "Ship PR" }, workspace: { name: "Acme" } },
      { entityType: "time_entry", entityId: "te-1", action: "created", metadata: null, workspace: { name: "Acme" } },
      { entityType: "decision", entityId: "d-1", action: "accepted", metadata: { title: "Use Postgres" }, workspace: { name: "Personal" } },
    ] as never);

    const items = await activityTodaySection.run(ctx(db), { key: "moved", type: "activity_today", title: "What moved" });

    expect(db.workspaceActivityEvent.findMany.mock.calls[0]![0]!.where).toEqual({
      userId: "u-1",
      workspaceId: { in: ["ws-personal", "ws-acme"] },
      createdAt: { gte: todayStart, lt: tomorrowStart },
    });
    expect(items.map((i) => [i.title, i.detail])).toEqual([
      ["Commented on ticket: Login bug", "Acme · ×2"],
      ["Accepted decision: Use Postgres", "Personal"],
    ]);
  });
});

describe("time_today section", () => {
  it("reads the day report across workspaces and lists total, products, proposed and forgotten timers", async () => {
    const db = setup();
    dayReport.mockResolvedValue({
      entries: [{ id: "e-1", action: { name: "Deep work" } }],
      attentionMinutes: 310,
      agentRunMinutes: 45,
      byProduct: [{ name: "Exponential", minutes: 250 }, { name: "Unassigned", minutes: 60 }, { name: "Idle", minutes: 0 }],
      proposedCount: 2,
      flags: [{ entryId: "e-1", flag: "forgotten-timer" }],
    });

    const items = await timeTodaySection.run(ctx(db), { key: "time", type: "time_today", title: "Time" });

    expect(dayReport).toHaveBeenCalledWith({ userId: "u-1", dayStart: todayStart, dayEnd: tomorrowStart, workspaceId: null });
    expect(items.map((i) => [i.title, i.detail])).toEqual([
      ["5h 10m of attention", "plus 45m of agent runs"],
      ["Exponential", "4h 10m"],
      ["Unassigned", "1h"],
      ["2 proposed entries to confirm", null],
      ["Timer may still be running: Deep work", "stop it or fix its end"],
    ]);
  });

  it("shows nothing for a day with no entries, and degrades a failing report to nothing", async () => {
    const db = setup();
    dayReport.mockResolvedValueOnce({ entries: [], attentionMinutes: 0, agentRunMinutes: 0, byProduct: [], proposedCount: 0, flags: [] });
    expect(await timeTodaySection.run(ctx(db), { key: "time", type: "time_today", title: "Time" })).toEqual([]);
    dayReport.mockRejectedValueOnce(new Error("db down"));
    expect(await timeTodaySection.run(ctx(db), { key: "time", type: "time_today", title: "Time" })).toEqual([]);
    expect(reportHandledErrorServer).toHaveBeenCalledOnce();
  });
});

describe("tomorrow section", () => {
  it("lists tomorrow's events then the actions in tomorrow's /today set", async () => {
    const db = setup();
    const base = { status: "ACTIVE", priority: "Quick", projectId: null, completedAt: null, scheduledStart: null, dueDate: null };
    db.action.findMany.mockResolvedValue([
      { ...base, id: "a-sched", name: "Write proposal", scheduledStart: new Date("2026-09-10T07:00:00.000Z") },
      { ...base, id: "a-due", name: "Invoice", dueDate: new Date("2026-09-10T10:00:00.000Z") },
      { ...base, id: "a-today", name: "Still today", dueDate: new Date("2026-09-09T10:00:00.000Z") },
    ] as never);
    const calls: Array<[Date, Date]> = [];
    const readCalendar: CalendarReader = async (_u, min, max) => {
      calls.push([min, max]);
      return [{ summary: "Board call", start: { dateTime: "2026-09-10T08:00:00.000Z" }, end: { dateTime: "2026-09-10T09:00:00.000Z" } }];
    };

    const items = await tomorrowSection.run(ctx(db, { readCalendar }), { key: "tmrw", type: "tomorrow", title: "Tomorrow" });

    expect(calls).toEqual([[tomorrowStart, new Date("2026-09-10T22:00:00.000Z")]]);
    // Events first; the actions keep the shared partition's order, so tomorrow's brief agrees.
    expect(items[0]).toMatchObject({ title: "10:00 Board call", detail: "meeting" });
    expect(items.slice(1).map((i) => [i.title, i.detail])).toEqual(
      expect.arrayContaining([["Write proposal", "scheduled"], ["Invoice", "due"]]),
    );
    expect(items).toHaveLength(3);
  });
});

describe("yesterday section in today mode", () => {
  it("reads the occurrence's own day and looks for recordings across accessible workspaces", async () => {
    const db = setup();
    db.transcriptionSession.findMany.mockResolvedValue([] as never);
    const readCalendar: CalendarReader = async () => [
      { summary: "Pipeline sync", start: { dateTime: "2026-09-09T08:00:00.000Z" }, end: { dateTime: "2026-09-09T08:30:00.000Z" } },
    ];
    const items = await yesterdaySection.run(ctx(db, { readCalendar }), {
      key: "mtg", type: "yesterday", title: "Today's meetings", config: { day: "today" },
    });
    expect(db.transcriptionSession.findMany.mock.calls[0]![0]!.where).toMatchObject({
      AND: [expect.anything(), { workspaceId: { in: ["ws-personal", "ws-acme"] } }, { meetingDate: { gte: todayStart, lt: tomorrowStart } }],
    });
    expect(items.map((i) => i.title)).toEqual(["10:00 Pipeline sync"]);
  });
});
