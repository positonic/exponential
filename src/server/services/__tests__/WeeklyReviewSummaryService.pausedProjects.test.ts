/**
 * A paused (On hold, Completed, Cancelled) project's actions are not next
 * week's focus. The weekly review summary's "Next week's focus" list must
 * leave them out; project-less actions are never paused.
 *
 * Prisma never runs here: `action.findMany` evaluates the service's real
 * `where` against in-memory rows with `matchesWhere`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import { addDays } from "date-fns";

import { matchesWhere } from "~/test/prismaWhere";

vi.mock("~/server/db", async () => {
  const { mockDeep } = await import("vitest-mock-extended");
  return { db: mockDeep<PrismaClient>() };
});

import { db as dbSingleton } from "~/server/db";
import { WeeklyReviewSummaryService } from "../WeeklyReviewSummaryService";

type Row = Record<string, unknown>;

const db = dbSingleton as unknown as DeepMockProxy<PrismaClient>;

const PAUSED = ["ON_HOLD", "COMPLETED", "CANCELLED"];

/** An ACTIVE high-priority action of u1's, due in ten days (next week). */
function action(id: string, projectStatus: string | null): Row {
  return {
    id,
    name: `Action ${id}`,
    description: null,
    createdById: "u1",
    status: "ACTIVE",
    kanbanStatus: "TODO",
    priority: "HIGH",
    dueDate: addDays(new Date(), 10),
    completedAt: null,
    projectId: projectStatus ? `p-${id}` : null,
    project: projectStatus ? { status: projectStatus, name: `Project ${id}` } : null,
  };
}

/** The "Next week's focus" lines of the Slack message. */
function nextWeekFocus(message: string): string[] {
  const section = message.split("🎯 *Next Week's Focus:*\n")[1] ?? "";
  return section
    .split("\n\n")[0]!
    .split("\n")
    .filter((line) => line.startsWith("📝 "));
}

beforeEach(() => {
  mockReset(db);
  db.user.findUnique.mockResolvedValue({ name: "James", email: "j@example.com" } as never);
  db.project.findMany.mockResolvedValue([]);
  const rows = [action("live", "ACTIVE"), action("loose", null), ...PAUSED.map((s) => action(s.toLowerCase(), s))];
  db.action.findMany.mockImplementation(((args: { where?: Record<string, unknown> }) =>
    Promise.resolve(rows.filter((r) => matchesWhere(r, args.where ?? {})))) as never);
});

describe("WeeklyReviewSummaryService: next week's focus", () => {
  it("leaves out a paused project's actions", async () => {
    const summary = await new WeeklyReviewSummaryService().generateWeeklyReviewSummary("u1");

    expect(nextWeekFocus(summary.message).sort()).toEqual([
      "📝 Action live (Project live)",
      "📝 Action loose",
    ]);
    expect(summary.message).toContain("• Upcoming Priorities: 2");
  });
});
