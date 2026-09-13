/**
 * The kanban ⇄ status lockstep as a table. Every row here used to be a
 * router test against one of the four inline copies; the copies are gone
 * and this is the only place the rule lives.
 */
import { describe, it, expect } from "vitest";
import type { ActionStatus } from "@prisma/client";

import { deriveActionPatch, type ActionPatchCurrent } from "../deriveActionPatch";

const STAMPED = new Date("2026-09-01T09:00:00.000Z");

function row(
  status: string,
  kanbanStatus: ActionStatus | null,
  completedAt: Date | null = null,
): ActionPatchCurrent {
  return { status, kanbanStatus, completedAt };
}

/** What we assert about `completedAt`: stamped now, cleared, or untouched. */
type StampExpectation = "stamped" | "cleared" | "untouched";

describe("deriveActionPatch", () => {
  it.each<{
    name: string;
    current: ActionPatchCurrent;
    patch: Parameters<typeof deriveActionPatch>[1];
    status: string | undefined;
    completedAt: StampExpectation;
  }>([
    {
      name: "kanban DONE completes the coarse status and stamps",
      current: row("ACTIVE", "TODO"),
      patch: { kanbanStatus: "DONE" },
      status: "COMPLETED",
      completedAt: "stamped",
    },
    {
      name: "kanban DONE repairs a legacy DONE-but-ACTIVE row without rewriting its stamp",
      current: row("ACTIVE", "DONE", STAMPED),
      patch: { kanbanStatus: "DONE" },
      status: "COMPLETED",
      completedAt: "untouched",
    },
    {
      name: "kanban DONE backfills a missing completedAt on a legacy row",
      current: row("ACTIVE", "DONE", null),
      patch: { kanbanStatus: "DONE" },
      status: "COMPLETED",
      completedAt: "stamped",
    },
    {
      name: "out of DONE on a real change reactivates and clears",
      current: row("COMPLETED", "DONE", STAMPED),
      patch: { kanbanStatus: "IN_PROGRESS" },
      status: "ACTIVE",
      completedAt: "cleared",
    },
    {
      name: "kanban CANCELLED cancels the coarse status",
      current: row("ACTIVE", "TODO"),
      patch: { kanbanStatus: "CANCELLED" },
      status: "CANCELLED",
      completedAt: "untouched",
    },
    {
      name: "re-sending the current column never resurrects a completed row",
      current: row("COMPLETED", "TODO", STAMPED),
      patch: { kanbanStatus: "TODO" },
      status: undefined,
      completedAt: "untouched",
    },
    {
      name: "re-sending DONE on a completed row changes nothing",
      current: row("COMPLETED", "DONE", STAMPED),
      patch: { kanbanStatus: "DONE" },
      status: undefined,
      completedAt: "untouched",
    },
    {
      name: "a DRAFT row never moves through a kanban move",
      current: row("DRAFT", "TODO"),
      patch: { kanbanStatus: "IN_PROGRESS" },
      status: undefined,
      completedAt: "untouched",
    },
    {
      name: "a DRAFT row is not completed by kanban DONE either",
      current: row("DRAFT", "TODO"),
      patch: { kanbanStatus: "DONE" },
      status: undefined,
      completedAt: "untouched",
    },
    {
      name: "a DELETED row never moves through a kanban move",
      current: row("DELETED", "DONE", STAMPED),
      patch: { kanbanStatus: "TODO" },
      status: undefined,
      completedAt: "untouched",
    },
    {
      name: "an explicit status wins over the kanban sync",
      current: row("ACTIVE", "TODO"),
      patch: { kanbanStatus: "DONE", status: "ACTIVE" },
      status: "ACTIVE",
      completedAt: "untouched",
    },
    {
      name: "an explicit COMPLETED without a kanban move stamps",
      current: row("ACTIVE", "TODO"),
      patch: { status: "COMPLETED" },
      status: "COMPLETED",
      completedAt: "stamped",
    },
    {
      name: "an explicit ACTIVE on a completed row clears the stamp",
      current: row("COMPLETED", "DONE", STAMPED),
      patch: { status: "ACTIVE" },
      status: "ACTIVE",
      completedAt: "cleared",
    },
    {
      name: "leaving DONE on a legacy DONE-but-ACTIVE row clears its stamp",
      current: row("ACTIVE", "DONE", STAMPED),
      patch: { kanbanStatus: "TODO" },
      status: undefined,
      completedAt: "cleared",
    },
    {
      name: "an explicit CANCELLED on a completed row clears the stamp",
      current: row("COMPLETED", "DONE", STAMPED),
      patch: { status: "CANCELLED" },
      status: "CANCELLED",
      completedAt: "cleared",
    },
    {
      name: "an explicit DELETED (soft delete) keeps a completed row's stamp",
      current: row("COMPLETED", "DONE", STAMPED),
      patch: { status: "DELETED" },
      status: "DELETED",
      completedAt: "untouched",
    },
    {
      name: "an explicit COMPLETED wins over leaving the DONE column",
      current: row("COMPLETED", "DONE", STAMPED),
      patch: { kanbanStatus: "TODO", status: "COMPLETED" },
      status: "COMPLETED",
      completedAt: "untouched",
    },
    {
      name: "an explicit status on a DRAFT row applies (explicit always wins)",
      current: row("DRAFT", "TODO"),
      patch: { status: "ACTIVE" },
      status: "ACTIVE",
      completedAt: "untouched",
    },
    {
      name: "a column move between non-terminal columns leaves an active row active",
      current: row("ACTIVE", "TODO"),
      patch: { kanbanStatus: "IN_PROGRESS" },
      status: undefined,
      completedAt: "untouched",
    },
    {
      name: "clearing the column (leaving a project) drives nothing",
      current: row("COMPLETED", "DONE", STAMPED),
      patch: { kanbanStatus: null },
      status: undefined,
      completedAt: "untouched",
    },
    {
      name: "a patch without status or column changes nothing",
      current: row("ACTIVE", "TODO"),
      patch: {},
      status: undefined,
      completedAt: "untouched",
    },
  ])("$name", ({ current, patch, status, completedAt }) => {
    const before = Date.now();
    const { data } = deriveActionPatch(current, patch);

    expect(data.status).toBe(status);

    if (completedAt === "stamped") {
      expect(data.completedAt).toBeInstanceOf(Date);
      expect((data.completedAt as Date).getTime()).toBeGreaterThanOrEqual(before);
    } else if (completedAt === "cleared") {
      expect(data.completedAt).toBeNull();
    } else {
      expect(data).not.toHaveProperty("completedAt");
    }
  });

  it("reports the transitions a caller needs for its own side effects", () => {
    expect(deriveActionPatch(row("ACTIVE", "TODO"), { kanbanStatus: "DONE" }).transitions).toEqual({
      kanbanChanged: true,
      nextStatus: "COMPLETED",
      statusChanged: true,
      completing: true,
      uncompleting: false,
    });
    expect(
      deriveActionPatch(row("COMPLETED", "DONE", STAMPED), { kanbanStatus: "TODO" }).transitions,
    ).toEqual({
      kanbanChanged: true,
      nextStatus: "ACTIVE",
      statusChanged: true,
      completing: false,
      uncompleting: true,
    });
    expect(deriveActionPatch(row("COMPLETED", "TODO", STAMPED), { kanbanStatus: "TODO" }).transitions).toEqual({
      kanbanChanged: false,
      nextStatus: "COMPLETED",
      statusChanged: false,
      completing: false,
      uncompleting: false,
    });
    // Clearing the column (leaving a project) is not a move between columns.
    expect(deriveActionPatch(row("ACTIVE", "TODO"), { kanbanStatus: null }).transitions.kanbanChanged).toBe(false);
  });
});
