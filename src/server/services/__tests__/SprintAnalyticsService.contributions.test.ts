/**
 * Tests for the Metrics page's per-person view: the member filter on the
 * all-cycles roll-up and the `getContributions` breakdown.
 *
 * These pin attribution (tickets → assignee, PRs/commits → linked GitHub
 * login, time → who logged it), the cycle-window bounds, and that filtering
 * never drops a cycle from the trend series.
 */

import { describe, it, expect, vi } from "vitest";

vi.hoisted(() => {
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.NODE_ENV ??= "test";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.DATABASE_ENCRYPTION_KEY ??= "0".repeat(64);
});

import type { PrismaClient } from "@prisma/client";
import { SprintAnalyticsService } from "../SprintAnalyticsService";

interface TicketRow {
  cycleId: string;
  status: string;
  points: number | null;
  assigneeId: string | null;
}

interface ActivityRow {
  eventType: "pull_request" | "push";
  eventAction?: string;
  prNumber?: number;
  repoFullName?: string;
  prMergedAt?: Date;
  prAuthor?: string;
  /** Full commit SHA (ingestion keeps only 7 chars in `commitSha`). */
  externalId?: string;
  commitAuthor?: string;
  eventTimestamp: Date;
}

const CYCLES = [
  {
    id: "c1",
    name: "Cycle 1",
    status: "COMPLETED",
    startDate: new Date("2026-01-01"),
    endDate: new Date("2026-01-14"),
    createdAt: new Date("2025-12-01"),
  },
  {
    id: "c2",
    name: "Cycle 2",
    status: "ACTIVE",
    startDate: new Date("2026-01-15"),
    endDate: new Date("2026-01-28"),
    createdAt: new Date("2025-12-02"),
  },
];

const USERS = [
  { id: "alice", name: "Alice", email: "alice@x.test", image: null },
  { id: "bob", name: "Bob", email: "bob@x.test", image: null },
  { id: "carol", name: "Carol", email: "carol@x.test", image: null },
];

/** Logins: Alice and Bob linked GitHub; Carol didn't. */
const GITHUB = [
  { userId: "alice", login: "Alice-GH" },
  { userId: "bob", login: "bobby" },
];

function makeService(opts: {
  tickets: TicketRow[];
  activity?: ActivityRow[];
  time?: { userId: string; startedAt: Date; endedAt: Date }[];
  members?: string[];
}) {
  const activity = opts.activity ?? [];
  const prisma = {
    list: {
      findMany: vi
        .fn()
        .mockImplementation((args: { where: { id?: string } }) =>
          Promise.resolve(
            args.where.id ? CYCLES.filter((c) => c.id === args.where.id) : CYCLES,
          ),
        ),
    },
    ticket: { findMany: vi.fn().mockResolvedValue(opts.tickets) },
    workspaceUser: {
      findMany: vi
        .fn()
        .mockResolvedValue((opts.members ?? ["alice", "bob", "carol"]).map((userId) => ({ userId }))),
    },
    teamUser: { findMany: vi.fn().mockResolvedValue([]) },
    user: {
      findMany: vi
        .fn()
        .mockImplementation((args: { where: { id: { in: string[] } } }) =>
          Promise.resolve(USERS.filter((u) => args.where.id.in.includes(u.id))),
        ),
    },
    integration: {
      findMany: vi
        .fn()
        .mockImplementation((args: { where: { userId: { in: string[] } } }) =>
          Promise.resolve(
            GITHUB.filter((g) => args.where.userId.in.includes(g.userId)).map((g) => ({
              userId: g.userId,
              credentials: [{ key: JSON.stringify({ githubUsername: g.login }) }],
            })),
          ),
        ),
    },
    timeEntry: { findMany: vi.fn().mockResolvedValue(opts.time ?? []) },
    gitHubActivity: {
      findMany: vi
        .fn()
        .mockImplementation(
          (args: {
            where: {
              eventType: string;
              eventAction?: string;
              prMergedAt?: { gte?: Date; lte?: Date };
              eventTimestamp?: { gte?: Date; lte?: Date };
            };
          }) => {
            const { where } = args;
            if (where.eventType === "push") {
              const { gte, lte } = where.eventTimestamp ?? {};
              return Promise.resolve(
                activity.filter(
                  (a) =>
                    a.eventType === "push" &&
                    (!gte || a.eventTimestamp >= gte) &&
                    (!lte || a.eventTimestamp <= lte),
                ),
              );
            }
            if (where.eventAction === "opened") {
              return Promise.resolve(
                activity.filter((a) => a.eventType === "pull_request" && a.eventAction === "opened"),
              );
            }
            const { gte, lte } = where.prMergedAt ?? {};
            return Promise.resolve(
              activity.filter(
                (a) =>
                  a.eventType === "pull_request" &&
                  a.prMergedAt &&
                  (!gte || a.prMergedAt >= gte) &&
                  (!lte || a.prMergedAt <= lte),
              ),
            );
          },
        ),
    },
  } as unknown as PrismaClient;

  return new SprintAnalyticsService(prisma);
}

const TICKETS: TicketRow[] = [
  { cycleId: "c1", status: "DONE", points: 3, assigneeId: "alice" },
  { cycleId: "c1", status: "IN_PROGRESS", points: 2, assigneeId: "alice" },
  { cycleId: "c1", status: "DEPLOYED", points: 5, assigneeId: "bob" },
  { cycleId: "c2", status: "DONE", points: 1, assigneeId: "bob" },
  { cycleId: "c2", status: "BACKLOG", points: null, assigneeId: null },
];

const merged = (n: number, author: string, at: string): ActivityRow => ({
  eventType: "pull_request",
  prNumber: n,
  repoFullName: "acme/app",
  prMergedAt: new Date(at),
  prAuthor: author,
  eventTimestamp: new Date(at),
});

describe("SprintAnalyticsService.getAllCyclesMetrics — member filter", () => {
  it("narrows tickets to the members' assignments but keeps every cycle on the series", async () => {
    const service = makeService({ tickets: TICKETS });

    const result = await service.getAllCyclesMetrics("ws-1", { memberIds: ["alice"] });

    // Alice had nothing in c2, yet c2 stays on the chart with zeros.
    expect(result.cycles.map((c) => c.cycleId)).toEqual(["c1", "c2"]);
    expect(result.cycles[1]).toMatchObject({ totalTickets: 0, completedTickets: 0 });
    expect(result.totalTickets).toBe(2);
    expect(result.completedTickets).toBe(1);
    expect(result.completedPoints).toBe(3);
    expect(result.completionRate).toBeCloseTo(50);
  });

  it("counts only PRs authored by the filtered members' GitHub logins (case-insensitive)", async () => {
    const service = makeService({
      tickets: TICKETS,
      activity: [
        merged(1, "alice-gh", "2026-01-05"),
        merged(2, "bobby", "2026-01-06"),
        merged(3, "stranger", "2026-01-07"),
      ],
    });

    const alice = await service.getAllCyclesMetrics("ws-1", { memberIds: ["alice"] });
    expect(alice.mergedPrCount).toBe(1);

    const everyone = await service.getAllCyclesMetrics("ws-1");
    expect(everyone.mergedPrCount).toBe(3);
  });

  it("treats an empty member list as no filter", async () => {
    const service = makeService({ tickets: TICKETS });
    const result = await service.getAllCyclesMetrics("ws-1", { memberIds: [] });
    expect(result.totalTickets).toBe(5);
  });

  it("counts no PRs for a filtered member without a linked GitHub login", async () => {
    const service = makeService({
      tickets: TICKETS,
      activity: [merged(1, "alice-gh", "2026-01-05")],
    });
    const result = await service.getAllCyclesMetrics("ws-1", { memberIds: ["carol"] });
    expect(result.mergedPrCount).toBe(0);
  });
});

describe("SprintAnalyticsService.getContributions", () => {
  it("attributes tickets by assignee, PRs/commits by GitHub login and time by logger", async () => {
    const service = makeService({
      tickets: TICKETS,
      activity: [
        merged(1, "Alice-GH", "2026-01-05"),
        merged(2, "bobby", "2026-01-20"),
        merged(3, "alice-gh", "2026-03-01"), // outside every cycle window
        { eventType: "push", externalId: "a1", commitAuthor: "alice-gh", eventTimestamp: new Date("2026-01-03") },
        { eventType: "push", externalId: "a1", commitAuthor: "alice-gh", eventTimestamp: new Date("2026-01-04") }, // same SHA
        { eventType: "push", externalId: "b1", commitAuthor: "bobby", eventTimestamp: new Date("2026-01-16") },
        { eventType: "push", externalId: "x1", commitAuthor: "stranger", eventTimestamp: new Date("2026-01-16") },
      ],
      time: [
        { userId: "carol", startedAt: new Date("2026-01-02T09:00:00Z"), endedAt: new Date("2026-01-02T10:30:00Z") },
      ],
    });

    const { rows } = await service.getContributions("ws-1");
    const byId = new Map(rows.map((r) => [r.userId, r]));

    expect(byId.get("alice")).toMatchObject({
      assignedTickets: 2,
      completedTickets: 1,
      completedPoints: 3,
      totalPoints: 5,
      mergedPrs: 1,
      commits: 1,
      githubLinked: true,
      isMember: true,
    });
    expect(byId.get("bob")).toMatchObject({
      assignedTickets: 2,
      completedTickets: 2,
      completedPoints: 6,
      mergedPrs: 1,
      commits: 1,
    });
    expect(byId.get("carol")).toMatchObject({
      assignedTickets: 0,
      minutesLogged: 90,
      githubLinked: false,
    });
    expect(byId.get(null)).toMatchObject({ assignedTickets: 1, completedTickets: 0 });
  });

  it("dedups commits by full SHA, so a shared 7-char prefix still counts twice", async () => {
    const service = makeService({
      tickets: TICKETS,
      activity: [
        { eventType: "push", externalId: "abc1234aaaa", commitAuthor: "bobby", eventTimestamp: new Date("2026-01-16") },
        { eventType: "push", externalId: "abc1234bbbb", commitAuthor: "bobby", eventTimestamp: new Date("2026-01-17") },
      ],
    });
    const { rows } = await service.getContributions("ws-1");
    expect(rows.find((r) => r.userId === "bob")?.commits).toBe(2);
  });

  it("excludes time starting exactly at the cycle end, like untracked work", async () => {
    const service = makeService({
      tickets: TICKETS,
      time: [
        // c2 ends 2026-01-28T00:00Z and no later cycle covers that instant.
        { userId: "carol", startedAt: new Date("2026-01-28T00:00:00Z"), endedAt: new Date("2026-01-28T01:00:00Z") },
        { userId: "carol", startedAt: new Date("2026-01-27T23:00:00Z"), endedAt: new Date("2026-01-27T23:30:00Z") },
      ],
    });
    const { rows } = await service.getContributions("ws-1", "c2");
    expect(rows.find((r) => r.userId === "carol")?.minutesLogged).toBe(30);
  });

  it("sorts by completed tickets with Unassigned last", async () => {
    const service = makeService({ tickets: TICKETS });
    const { rows } = await service.getContributions("ws-1");
    expect(rows.map((r) => r.userId)).toEqual(["bob", "alice", "carol", null]);
  });

  it("scopes to a single cycle and its window", async () => {
    const service = makeService({
      tickets: TICKETS,
      activity: [merged(1, "alice-gh", "2026-01-05"), merged(2, "bobby", "2026-01-20")],
    });

    const { rows } = await service.getContributions("ws-1", "c2");
    const byId = new Map(rows.map((r) => [r.userId, r]));

    expect(byId.get("alice")).toMatchObject({ assignedTickets: 0, mergedPrs: 0 });
    expect(byId.get("bob")).toMatchObject({ assignedTickets: 1, mergedPrs: 1 });
  });

  it("includes a non-member assignee, flagged as a former member", async () => {
    const service = makeService({ tickets: TICKETS, members: ["alice", "carol"] });
    const { rows } = await service.getContributions("ws-1");
    expect(rows.find((r) => r.userId === "bob")).toMatchObject({
      isMember: false,
      completedTickets: 2,
    });
  });

  it("resolves the GitHub link of a former member who only logged time", async () => {
    const service = makeService({
      tickets: TICKETS.filter((t) => t.assigneeId !== "bob"),
      members: ["alice", "carol"],
      activity: [merged(1, "bobby", "2026-01-05")],
      time: [{ userId: "bob", startedAt: new Date("2026-01-02T09:00:00Z"), endedAt: new Date("2026-01-02T10:00:00Z") }],
    });
    const { rows } = await service.getContributions("ws-1");
    expect(rows.find((r) => r.userId === "bob")).toMatchObject({
      isMember: false,
      githubLinked: true,
      mergedPrs: 1,
      minutesLogged: 60,
    });
  });

  it("omits the Unassigned row when every ticket has an owner", async () => {
    const service = makeService({
      tickets: TICKETS.filter((t) => t.assigneeId != null),
    });
    const { rows } = await service.getContributions("ws-1");
    expect(rows.some((r) => r.userId == null)).toBe(false);
  });
});
