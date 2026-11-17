/**
 * The plugin timer's "What's this for?" targets: URL parsing (pure), the
 * search's ordering and grouping, and URL resolution. Mocked Prisma only —
 * no real DB (CLAUDE.md "Test database safety").
 */
import { describe, it, expect, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import {
  parseTimerTargetUrl,
  resolveTimerTarget,
  searchTimerTargets,
} from "../timerTargets";

const USER_ID = "user-1";
const WS = { id: "ws-1", slug: "exponential" };
const NOW = new Date("2026-11-17T12:00:00Z");

function ticketRow(id: string, status: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: `Ticket ${id}`,
    number: 12,
    shortId: `${id}.whale`,
    status,
    feature: { name: "Log timer time against Tickets", goal: { title: "Ship time tracking" } },
    product: { slug: "exponential", name: "Exponential", funTicketIds: true, workspace: WS },
    ...overrides,
  };
}

function projectRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `Project ${id}`,
    slug: `project-${id}`,
    status: "ACTIVE",
    goals: [{ title: "Grow revenue" }],
    workspace: WS,
    ...overrides,
  };
}

describe("parseTimerTargetUrl", () => {
  it.each([
    [
      "https://www.exponential.im/w/exponential/products/exponential/tickets/crisp.whale",
      { kind: "ticket", workspaceSlug: "exponential", productSlug: "exponential", identifier: "crisp.whale" },
    ],
    [
      "https://self.example.org/w/clear/products/clear/tickets/241?tab=activity#c1",
      { kind: "ticket", workspaceSlug: "clear", productSlug: "clear", identifier: "241" },
    ],
    [
      "https://www.exponential.im/w/exponential/projects/mvp_development-cmlf3zmw40005l804w0eg28p4?tab=tasks",
      { kind: "project", workspaceSlug: "exponential", projectSlug: "mvp_development-cmlf3zmw40005l804w0eg28p4" },
    ],
    [
      "https://github.com/exponential-im/exponential-app/pull/1174/files#diff-abc",
      { kind: "pullRequest", prUrl: "https://github.com/exponential-im/exponential-app/pull/1174" },
    ],
  ])("%s", (url, expected) => {
    expect(parseTimerTargetUrl(url)).toEqual(expected);
  });

  it.each([
    "not a url",
    "chrome://extensions",
    "https://www.exponential.im/w/exponential/products/exponential/tickets/new",
    "https://www.exponential.im/w/exponential/products/exponential/cycles",
    "https://www.exponential.im/w/exponential/today",
    "https://github.com/exponential-im/exponential-app/issues/12",
    "https://github.com/exponential-im/exponential-app/pull/abc",
  ])("%s → null", (url) => {
    expect(parseTimerTargetUrl(url)).toBeNull();
  });
});

describe("searchTimerTargets", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = mockDeep<PrismaClient>();
    mockReset(db);
    db.workspaceUser.findUnique.mockResolvedValue({ userId: USER_ID } as never); // a member, not a guest
  });

  it("empty query: in-flight current-cycle tickets first (IN_PROGRESS before COMMITTED), then recently timed", async () => {
    db.timeEntry.findMany.mockResolvedValue([
      { action: { ticketId: "recent", projectId: null } },
      { action: { ticketId: "prog", projectId: null } }, // already in the cycle group
      { action: { ticketId: null, projectId: "p-recent" } },
    ] as never);
    db.ticket.findMany.mockImplementation((async (args: { where: { AND: unknown[] } }) => {
      const json = JSON.stringify(args.where);
      if (json.includes('"status":"IN_PROGRESS"')) return [ticketRow("prog", "IN_PROGRESS")];
      if (json.includes('"status":"COMMITTED"')) return [ticketRow("committed", "COMMITTED")];
      return [ticketRow("prog", "IN_PROGRESS"), ticketRow("recent", "QA")];
    }) as never);
    db.project.findMany.mockImplementation((async (args: { where: { id?: unknown } }) =>
      args.where.id ? [projectRow("p-recent")] : [projectRow("p-active"), projectRow("p-recent")]) as never);

    const result = await searchTimerTargets(db as unknown as PrismaClient, USER_ID, {
      workspaceId: WS.id,
      now: NOW,
    });

    expect(result.tickets.map((t) => t.id)).toEqual(["prog", "committed", "recent"]);
    expect(result.projects.map((p) => p.id)).toEqual(["p-recent", "p-active"]);
    // The context line is derived, never picked.
    expect(result.tickets[0]).toMatchObject({
      kind: "ticket",
      label: "prog.whale",
      context: "Log timer time against Tickets · Ship time tracking",
      url: "/w/exponential/products/exponential/tickets/prog.whale",
    });
    expect(result.projects[0]).toMatchObject({
      kind: "project",
      label: null,
      context: "Grow revenue",
      url: "/w/exponential/projects/project-p-recent",
    });
    // The cycle group is the caller's own tickets in the current cycle.
    const cycleCall = db.ticket.findMany.mock.calls.find(([a]) =>
      JSON.stringify(a?.where).includes('"assigneeId"'),
    );
    expect(JSON.stringify(cycleCall?.[0]?.where)).toContain('"listType":"SPRINT"');
  });

  it("an IN_PROGRESS ticket is never pushed past the limit by a more recently touched COMMITTED one", async () => {
    db.timeEntry.findMany.mockResolvedValue([] as never);
    db.ticket.findMany.mockImplementation((async (args: { where: unknown }) => {
      const json = JSON.stringify(args.where);
      if (json.includes('"status":"IN_PROGRESS"')) return [ticketRow("older-prog", "IN_PROGRESS")];
      if (json.includes('"status":"COMMITTED"')) return [ticketRow("fresh-committed", "COMMITTED")];
      return [];
    }) as never);
    db.project.findMany.mockResolvedValue([] as never);

    const result = await searchTimerTargets(db as unknown as PrismaClient, USER_ID, {
      workspaceId: WS.id,
      limit: 1,
      now: NOW,
    });

    expect(result.tickets.map((t) => t.id)).toEqual(["older-prog"]);
  });

  it("with a query: tickets and projects matched, archived tickets excluded, scoped to the workspace", async () => {
    db.ticket.findMany.mockResolvedValue([ticketRow("hit", "BACKLOG")] as never);
    db.project.findMany.mockResolvedValue([projectRow("p-hit")] as never);

    const result = await searchTimerTargets(db as unknown as PrismaClient, USER_ID, {
      workspaceId: WS.id,
      query: "timer",
    });

    expect(result.tickets.map((t) => t.id)).toEqual(["hit"]);
    expect(result.projects.map((p) => p.id)).toEqual(["p-hit"]);
    const where = JSON.stringify(db.ticket.findMany.mock.calls[0]![0]!.where);
    expect(where).toContain('"status":{"not":"ARCHIVED"}');
    expect(where).toContain(`"workspaceId":"${WS.id}"`);
    expect(db.timeEntry.findMany).not.toHaveBeenCalled();
  });

  it("a workspace guest only sees projects they are a member of", async () => {
    db.workspaceUser.findUnique.mockResolvedValue(null);
    db.teamUser.findFirst.mockResolvedValue(null);
    db.ticket.findMany.mockResolvedValue([] as never);
    db.project.findMany.mockResolvedValue([] as never);

    await searchTimerTargets(db as unknown as PrismaClient, USER_ID, { workspaceId: WS.id, query: "x" });

    expect(db.project.findMany.mock.calls[0]![0]!.where).toEqual({
      AND: [
        { AND: [{ workspaceId: WS.id }, { projectMembers: { some: { userId: USER_ID } } }] },
        { name: { contains: "x", mode: "insensitive" } },
      ],
    });
  });
});

describe("resolveTimerTarget", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = mockDeep<PrismaClient>();
    mockReset(db);
    db.workspaceUser.findUnique.mockResolvedValue({ userId: USER_ID } as never);
  });

  it("an Exponential ticket page resolves within its product, by any URL id form", async () => {
    db.product.findFirst.mockResolvedValue({ id: "prod-1" } as never);
    db.ticket.findFirst.mockResolvedValue(ticketRow("t1", "IN_PROGRESS") as never);

    const target = await resolveTimerTarget(
      db as unknown as PrismaClient,
      USER_ID,
      "https://www.exponential.im/w/exponential/products/exponential/tickets/12",
    );

    expect(target).toMatchObject({ kind: "ticket", id: "t1" });
    expect(db.product.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: "exponential", workspace: { slug: "exponential" } } }),
    );
    expect(JSON.stringify(db.ticket.findFirst.mock.calls[0]![0]!.where)).toContain(
      '{"productId":"prod-1","number":12}',
    );
  });

  it("a GitHub PR resolves to the ticket carrying that PR, tolerating stored suffixes", async () => {
    db.ticket.findFirst.mockResolvedValue(ticketRow("t-pr", "QA") as never);

    const target = await resolveTimerTarget(
      db as unknown as PrismaClient,
      USER_ID,
      "https://github.com/exponential-im/exponential-app/pull/1174/commits",
    );

    expect(target).toMatchObject({ kind: "ticket", id: "t-pr" });
    const where = JSON.stringify(db.ticket.findFirst.mock.calls[0]![0]!.where);
    const pr = "https://github.com/exponential-im/exponential-app/pull/1174";
    expect(where).toContain(`{"prUrl":{"equals":"${pr}","mode":"insensitive"}}`);
    expect(where).toContain(`{"prUrl":{"startsWith":"${pr}/","mode":"insensitive"}}`);
  });

  it("a project page resolves within its workspace", async () => {
    db.workspace.findUnique.mockResolvedValue({ id: WS.id } as never);
    db.project.findFirst.mockResolvedValue(projectRow("p1") as never);

    const target = await resolveTimerTarget(
      db as unknown as PrismaClient,
      USER_ID,
      "https://www.exponential.im/w/exponential/projects/project-p1?tab=tasks",
    );

    expect(target).toMatchObject({ kind: "project", id: "p1", context: "Grow revenue" });
    const where = db.project.findFirst.mock.calls[0]![0]!.where as { AND: unknown[] };
    expect(where.AND[0]).toEqual({ OR: [{ id: "project-p1" }, { slug: "project-p1" }] });
    expect(where.AND[1]).toMatchObject({ AND: [{ workspaceId: WS.id }, expect.anything()] });
  });

  it("the app's compound slug-cuid project link resolves by its CUID suffix", async () => {
    db.workspace.findUnique.mockResolvedValue({ id: WS.id } as never);
    db.project.findFirst.mockResolvedValue(projectRow("cmlf3zmw40005l804w0eg28p4") as never);

    await resolveTimerTarget(
      db as unknown as PrismaClient,
      USER_ID,
      "https://www.exponential.im/w/exponential/projects/mvp_development-cmlf3zmw40005l804w0eg28p4?tab=tasks",
    );

    const where = db.project.findFirst.mock.calls[0]![0]!.where as { AND: unknown[] };
    expect(where.AND[0]).toEqual({
      OR: [
        { id: "mvp_development-cmlf3zmw40005l804w0eg28p4" },
        { slug: "mvp_development-cmlf3zmw40005l804w0eg28p4" },
        { id: "cmlf3zmw40005l804w0eg28p4" },
      ],
    });
    expect(where.AND[1]).toMatchObject({ AND: [{ workspaceId: WS.id }, expect.anything()] });
  });

  it("anything unknown or out of reach is null, not an error", async () => {
    db.product.findFirst.mockResolvedValue(null);
    db.ticket.findFirst.mockResolvedValue(null);

    const call = (url: string) => resolveTimerTarget(db as unknown as PrismaClient, USER_ID, url);
    await expect(call("https://news.ycombinator.com/")).resolves.toBeNull();
    await expect(
      call("https://www.exponential.im/w/other/products/secret/tickets/1"),
    ).resolves.toBeNull();
    await expect(call("https://github.com/acme/app/pull/9")).resolves.toBeNull();
  });
});
