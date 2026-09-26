import { describe, expect, it, vi } from "vitest";
import type { Ceremony, CeremonyOccurrence, PrismaClient } from "@prisma/client";
import { mockDeep } from "vitest-mock-extended";
import type { CalendarReader } from "~/server/services/notifications/emit/dailySummary/calendar";
import { driProjectsSection } from "../sections/dri_projects";
import { todaysActionsSection } from "../sections/todays_actions";
import { todaysMeetingsSection } from "../sections/todays_meetings";
import { yesterdaySection } from "../sections/yesterday";
import type { SectionContext } from "../types";

const { reportHandledErrorServer } = vi.hoisted(() => ({ reportHandledErrorServer: vi.fn() }));
vi.mock("~/server/utils/reportHandledErrorServer", () => ({ reportHandledErrorServer }));

// 08:00 Berlin on Wed 9 Sep 2026.
const start = new Date("2026-09-09T06:00:00.000Z");

function ctx(db: PrismaClient, overrides: Partial<SectionContext> = {}): SectionContext {
  return {
    db,
    workspaceId: "ws-1",
    ceremony: { id: "cer-1", workspaceId: "ws-1", projectId: null, productId: null, ownerId: "u-owner", timezone: "Europe/Berlin" } as Ceremony,
    occurrence: { id: "occ-1", scheduledStart: start } as CeremonyOccurrence,
    previousOccurrence: null,
    participantUserIds: ["u-1"],
    now: start,
    workspacePath: "/w/acme",
    ...overrides,
  };
}

function withUsers(db: ReturnType<typeof mockDeep<PrismaClient>>, users: Array<{ id: string; name: string | null }>) {
  db.user.findMany.mockResolvedValue(users as never);
}

describe("daily brief people", () => {
  it("falls back to the ceremony owner when a template-created brief has no participants yet", async () => {
    const db = mockDeep<PrismaClient>();
    withUsers(db, [{ id: "u-owner", name: "James" }]);
    db.project.findMany.mockResolvedValue([] as never);
    await driProjectsSection.run(ctx(db, { participantUserIds: [] }), { key: "dri", type: "dri_projects", title: "Your projects" });
    expect(db.project.findMany.mock.calls[0]![0]!.where).toMatchObject({ driId: "u-owner", status: "ACTIVE", workspaceId: "ws-1" });
  });
});

describe("dri_projects section", () => {
  it("lists the participant's DRI projects in the workspace with their state, goal chip and link", async () => {
    const db = mockDeep<PrismaClient>();
    withUsers(db, [{ id: "u-1", name: "James" }]);
    db.project.findMany.mockResolvedValue([
      {
        id: "p-1", name: "Exponential GTM", slug: "exponential_gtm", priority: "HIGH", progress: 40.4,
        reviewDate: new Date("2026-09-01T00:00:00.000Z"), endDate: new Date("2026-12-31T00:00:00.000Z"),
        workspace: { slug: "acme" },
        actions: [{ dueDate: new Date("2026-09-01T00:00:00.000Z") }, { dueDate: null }],
      },
      {
        id: "p-2", name: "Reading", slug: "reading", priority: "NONE", progress: 10,
        reviewDate: null, endDate: null, workspace: { slug: "acme" }, actions: [],
      },
    ] as never);
    db.goal.findMany.mockResolvedValue([{ id: 98, title: "Reach B1", projects: [{ id: "p-1" }] }] as never);

    const items = await driProjectsSection.run(ctx(db), { key: "dri", type: "dri_projects", title: "Your projects" });

    expect(items.map((i) => i.id)).toEqual(["dri:project:p-1", "dri:project:p-2"]);
    expect(items[0]).toMatchObject({
      title: "⚠️ Exponential GTM",
      refType: "project",
      refId: "p-1",
      goalId: 98,
      goalTitle: "Reach B1",
      detail: "40% · 2 open, 1 overdue · review overdue (1 Sept) · ends 31 Dec",
      href: "/w/acme/projects/exponential_gtm-p-1",
    });
    expect(items[1]).toMatchObject({ title: "Reading", detail: "10% · 0 open", goalId: null });
  });

  it("prefixes items with the person's name when the brief has several participants", async () => {
    const db = mockDeep<PrismaClient>();
    withUsers(db, [{ id: "u-1", name: "James" }, { id: "u-2", name: "Andi" }]);
    db.project.findMany.mockResolvedValue([
      { id: "p-1", name: "GTM", slug: "gtm", priority: "NONE", progress: 0, reviewDate: null, endDate: null, workspace: { slug: "acme" }, actions: [] },
    ] as never);
    db.goal.findMany.mockResolvedValue([] as never);
    const items = await driProjectsSection.run(ctx(db, { participantUserIds: ["u-1", "u-2"] }), { key: "dri", type: "dri_projects", title: "Your projects" });
    expect(items.map((i) => i.title)).toEqual(["James · GTM", "Andi · GTM"]);
  });
});

describe("todays_actions section", () => {
  it("lists today's actions then the overdue ones, using the /today ownership set in the ceremony's timezone", async () => {
    const db = mockDeep<PrismaClient>();
    withUsers(db, [{ id: "u-1", name: "James" }]);
    const base = { status: "ACTIVE", priority: "Quick", projectId: null, completedAt: null, scheduledStart: null, dueDate: null };
    db.action.findMany.mockResolvedValue([
      { ...base, id: "a-today", name: "Pay Malte", scheduledStart: new Date("2026-09-09T12:00:00.000Z") },
      { ...base, id: "a-old", name: "Old bill", dueDate: new Date("2026-09-07T10:00:00.000Z") },
      { ...base, id: "a-later", name: "Next week", dueDate: new Date("2026-09-20T10:00:00.000Z") },
    ] as never);

    const items = await todaysActionsSection.run(ctx(db), { key: "acts", type: "todays_actions", title: "Today's actions" });

    const where = db.action.findMany.mock.calls[0]![0]!.where!;
    expect(where).toMatchObject({ status: "ACTIVE" });
    expect(where.OR).toEqual([
      { createdById: "u-1", assignees: { none: {} } },
      { assignees: { some: { userId: "u-1" } } },
    ]);
    expect(items.map((i) => i.id)).toEqual(["acts:action:a-today", "acts:action:a-old"]);
    expect(items[0]).toMatchObject({ title: "Pay Malte", detail: null, href: "/w/acme/actions/a-today" });
    expect(items[1]!.detail).toBe("overdue · due 7 Sept");
  });
});

describe("todays_meetings and yesterday sections", () => {
  const readCalendar: CalendarReader = async () => [
    { summary: "CLEAR daily standup", start: { dateTime: "2026-09-08T07:00:00.000Z" }, end: { dateTime: "2026-09-08T07:15:00.000Z" } },
    { summary: "Offsite", start: { date: "2026-09-09" }, end: { date: "2026-09-10" } },
    { summary: "Pipeline sync", start: { dateTime: "2026-09-09T08:00:00.000Z" }, end: { dateTime: "2026-09-09T08:30:00.000Z" } },
  ];

  it("lists today's calendar events as text items, all-day first, in the ceremony's timezone", async () => {
    const db = mockDeep<PrismaClient>();
    withUsers(db, [{ id: "u-1", name: "James" }]);
    const items = await todaysMeetingsSection.run(ctx(db, { readCalendar }), { key: "mtg", type: "todays_meetings", title: "Today's meetings" });
    expect(items.map((i) => i.title)).toEqual(["Offsite", "10:00 Pipeline sync"]);
    expect(items[0]).toMatchObject({ refType: "text", refId: "mtg:text:u-1:0" });
  });

  it("lists yesterday's events, linking the recording that overlaps one and appending unmatched recordings", async () => {
    const db = mockDeep<PrismaClient>();
    withUsers(db, [{ id: "u-1", name: "James" }]);
    db.transcriptionSession.findMany.mockResolvedValue([
      { id: "rec-standup", title: "CLEAR daily standup", meetingDate: new Date("2026-09-08T07:02:00.000Z") },
      { id: "rec-sync", title: "Pipeline sync", meetingDate: new Date("2026-09-08T14:30:00.000Z") },
    ] as never);
    const items = await yesterdaySection.run(ctx(db, { readCalendar }), { key: "yday", type: "yesterday", title: "Yesterday" });
    expect(db.transcriptionSession.findMany.mock.calls[0]![0]!.where).toMatchObject({
      AND: [expect.anything(), { workspaceId: "ws-1" }, { meetingDate: { gte: new Date("2026-09-07T22:00:00.000Z"), lt: new Date("2026-09-08T22:00:00.000Z") } }],
    });
    expect(items).toMatchObject([
      { id: "yday:meeting:rec-standup", title: "09:00 CLEAR daily standup", refType: "meeting", href: "/recording/rec-standup", detail: "recorded" },
      { id: "yday:meeting:rec-sync", title: "16:30 Pipeline sync", refType: "meeting", href: "/recording/rec-sync" },
    ]);
  });

  it("degrades a failing calendar read to an empty section instead of throwing", async () => {
    const db = mockDeep<PrismaClient>();
    withUsers(db, [{ id: "u-1", name: "James" }]);
    const failing: CalendarReader = async () => { throw new Error("token expired"); };
    const items = await todaysMeetingsSection.run(ctx(db, { readCalendar: failing }), { key: "mtg", type: "todays_meetings", title: "Today's meetings" });
    expect(items).toEqual([]);
    expect(reportHandledErrorServer).toHaveBeenCalledOnce();
  });
});
