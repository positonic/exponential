import { describe, it, expect, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import { matchesWhere } from "~/test/prismaWhere";
import { classifyQuery, describeActions, runQuery } from "../query";

describe("classifyQuery", () => {
  it("flags goals / OKRs / objectives / key results as out of scope", () => {
    for (const q of [
      "how are my goals?",
      "what's my progress on the Q2 objective?",
      "show my OKRs",
      "any key results at risk?",
      "what's my kpi",
    ]) {
      expect(classifyQuery(q).outOfScope).toBe(true);
    }
  });

  it("flags blockers / dependencies / tickets as out of scope", () => {
    for (const q of [
      "what's blocking the launch?",
      "what am I blocked on?",
      "what does this depend on?",
      "what am I waiting on?",
      "show my tickets",
    ]) {
      expect(classifyQuery(q).outOfScope).toBe(true);
    }
  });

  it("classifies overdue", () => {
    expect(classifyQuery("what's overdue?")).toMatchObject({
      outOfScope: false,
      temporal: "overdue",
      inbox: false,
    });
    expect(classifyQuery("anything past due").temporal).toBe("overdue");
  });

  it("classifies inbox", () => {
    expect(classifyQuery("what's in my inbox?")).toMatchObject({
      outOfScope: false,
      inbox: true,
    });
  });

  it("classifies due this week and due today", () => {
    expect(classifyQuery("what's due this week in Acme?").temporal).toBe(
      "due_this_week",
    );
    expect(classifyQuery("what's due today?").temporal).toBe("due_today");
  });

  it("overdue takes precedence over a bare week mention", () => {
    expect(classifyQuery("what's overdue this week?").temporal).toBe("overdue");
  });

  it("returns no temporal/inbox for a vague question", () => {
    expect(classifyQuery("tell me about the Acme project")).toMatchObject({
      outOfScope: false,
      temporal: null,
      inbox: false,
    });
  });
});

describe("describeActions", () => {
  it("reports an empty inbox specially", () => {
    expect(describeActions("in your inbox", true, [])).toBe("Your inbox is empty.");
  });

  it("reports nothing for an empty scoped result", () => {
    expect(describeActions("overdue", false, [])).toBe("You have nothing overdue.");
  });

  it("names up to two results inline", () => {
    expect(describeActions("overdue", false, ["call Sam", "send report"])).toBe(
      "You have 2 actions overdue: call Sam and send report.",
    );
  });

  it("enumerates up to five results inline", () => {
    expect(
      describeActions("due this week in Acme", false, ["a", "b", "c", "d"]),
    ).toBe("You have 4 actions due this week in Acme: a, b, c and d.");
  });

  it("caps the list and counts the rest beyond five", () => {
    expect(
      describeActions("overdue", false, ["a", "b", "c", "d", "e", "f", "g"]),
    ).toBe("You have 7 actions overdue: a, b, c, d and e, and 2 more.");
  });

  it("phrases the inbox lead differently", () => {
    expect(describeActions("in your inbox", true, ["loose thought"])).toBe(
      "Your inbox has 1 action: loose thought.",
    );
  });

  it("strips markdown from names", () => {
    expect(describeActions("overdue", false, ["**ship** it"])).toBe(
      "You have 1 action overdue: ship it.",
    );
  });
});

describe("runQuery — paused projects", () => {
  type Row = Record<string, unknown>;
  const db = mockDeep<PrismaClient>();
  const now = new Date(2026, 10, 16, 10); // Monday morning, server-local
  const yesterday = new Date(2026, 10, 15, 12);
  const laterToday = new Date(2026, 10, 16, 15);

  const project = (id: string, name: string, status: string) => ({
    id,
    name,
    status,
    createdById: "u1",
    workspaceId: "w1",
  });
  const projects = [
    project("p-active", "Website", "ACTIVE"),
    project("p-hold", "German", "ON_HOLD"),
    project("p-done", "Garden", "COMPLETED"),
    project("p-cancelled", "Podcast", "CANCELLED"),
  ];
  const byId = new Map(projects.map((p) => [p.id, p]));

  const action = (id: string, projectId: string | null, dueDate: Date): Row => ({
    id,
    name: id,
    createdById: "u1",
    status: "ACTIVE",
    workspaceId: "w1",
    dueDate,
    projectId,
    project: projectId ? byId.get(projectId)! : null,
  });
  const actions: Row[] = [
    action("active-overdue", "p-active", yesterday),
    action("hold-overdue", "p-hold", yesterday),
    action("done-overdue", "p-done", yesterday),
    action("cancelled-overdue", "p-cancelled", yesterday),
    action("loose-overdue", null, yesterday),
    action("active-today", "p-active", laterToday),
    action("hold-today", "p-hold", laterToday),
  ];

  // Prisma never runs in a unit test, so each query is answered by
  // evaluating its real `where` against the rows above.
  const serveFrom = (rows: Row[]) =>
    ((args: { where?: Record<string, unknown> }) =>
      Promise.resolve(rows.filter((r) => matchesWhere(r, args.where ?? {})))) as never;

  beforeEach(() => {
    mockReset(db);
    db.project.findMany.mockImplementation(serveFrom(projects));
    db.action.findMany.mockImplementation(serveFrom(actions));
  });

  const ids = (r: Awaited<ReturnType<typeof runQuery>>) =>
    r.structured.actions.map((a) => a.id).sort();

  it("\"what's overdue?\" leaves out On hold, Completed and Cancelled projects' actions", async () => {
    const result = await runQuery("what's overdue?", "u1", db, undefined, now);
    expect(ids(result)).toEqual(["active-overdue", "loose-overdue"]);
    expect(result.speakable).toMatch(/^You have 2 actions overdue/);
  });

  it("\"what's due today?\" leaves out a paused project's actions", async () => {
    const result = await runQuery("what's due today?", "u1", db, undefined, now);
    expect(ids(result)).toEqual(["active-today"]);
  });

  it("a project named out loud is answered in full even when it is On hold", async () => {
    const result = await runQuery("what's overdue in German?", "u1", db, undefined, now);
    expect(result.structured.project).toEqual({ id: "p-hold", name: "German" });
    expect(ids(result)).toEqual(["hold-overdue"]);
  });
});
