import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { mockDeep } from "vitest-mock-extended";
import { evaluateSkipProposal, skipOccurrence, unskipOccurrence } from "../skip";

vi.mock("~/server/services/activity/recordActivity", () => ({
  recordActivity: vi.fn().mockResolvedValue(true),
}));

const emptyAgenda = { sections: [{ key: "blockers", type: "blockers", title: "Blockers", items: [] }] };
const fullAgenda = {
  sections: [
    {
      key: "blockers",
      type: "blockers",
      title: "Blockers",
      items: [{ id: "i-1", sectionKey: "blockers", title: "Fix login", order: 0 }],
    },
  ],
};

function occurrence(overrides: Record<string, unknown> = {}) {
  return {
    status: "AGENDA_CIRCULATED",
    agenda: emptyAgenda,
    agendaGeneratedAt: new Date(),
    ceremony: { kind: "STANDUP" },
    ...overrides,
  };
}

function db() {
  const mock = mockDeep<PrismaClient>();
  mock.ceremonyOccurrenceUpdate.findFirst.mockResolvedValue(null as never);
  return mock;
}

describe("evaluateSkipProposal", () => {
  it("offers a skip when the agenda is empty and nobody is blocked", async () => {
    const mock = db();
    mock.ceremonyOccurrence.findUnique.mockResolvedValue(occurrence() as never);
    expect(await evaluateSkipProposal(mock, "occ-1")).toEqual({ proposed: true, reason: null });
  });

  it("does not offer a skip when the agenda has anything on it", async () => {
    const mock = db();
    mock.ceremonyOccurrence.findUnique.mockResolvedValue(occurrence({ agenda: fullAgenda }) as never);
    expect(await evaluateSkipProposal(mock, "occ-1")).toEqual({ proposed: false, reason: "agenda-has-items" });
  });

  it("does not offer a skip when a participant flagged a blocker", async () => {
    const mock = db();
    mock.ceremonyOccurrence.findUnique.mockResolvedValue(occurrence() as never);
    mock.ceremonyOccurrenceUpdate.findFirst.mockResolvedValue({ id: "u-1" } as never);
    expect(await evaluateSkipProposal(mock, "occ-1")).toEqual({ proposed: false, reason: "blocker-flagged" });
    expect(mock.ceremonyOccurrenceUpdate.findFirst.mock.calls[0]![0]!.where).toMatchObject({
      flaggedBlocker: true,
      submittedAt: { not: null },
    });
  });

  it("treats no agenda as different from an empty one", async () => {
    const mock = db();
    mock.ceremonyOccurrence.findUnique.mockResolvedValue(occurrence({ agenda: null }) as never);
    expect(await evaluateSkipProposal(mock, "occ-1")).toEqual({ proposed: false, reason: "no-agenda-yet" });
  });

  it("never offers a skip for a kind with no async format", async () => {
    const mock = db();
    mock.ceremonyOccurrence.findUnique.mockResolvedValue(occurrence({ ceremony: { kind: "PLANNING" } }) as never);
    expect(await evaluateSkipProposal(mock, "occ-1")).toEqual({ proposed: false, reason: "not-async" });
  });

  it("never offers a skip for an occurrence that already happened", async () => {
    const mock = db();
    mock.ceremonyOccurrence.findUnique.mockResolvedValue(occurrence({ status: "CAPTURED" }) as never);
    expect(await evaluateSkipProposal(mock, "occ-1")).toEqual({ proposed: false, reason: "already-resolved" });
  });
});

describe("skipOccurrence", () => {
  it("records the reason with the status", async () => {
    const mock = db();
    mock.ceremonyOccurrence.findFirst.mockResolvedValue({
      id: "occ-1",
      status: "AGENDA_CIRCULATED",
      scheduledStart: new Date("2026-09-12T08:00:00Z"),
      ceremony: { id: "cer-1", name: "Daily Standup", timezone: "Europe/Berlin" },
    } as never);
    mock.ceremonyOccurrence.update.mockResolvedValue({
      id: "occ-1",
      status: "SKIPPED",
      skipReason: "Nothing to cover",
    } as never);
    const result = await skipOccurrence(mock, {
      occurrenceId: "occ-1",
      workspaceId: "ws-1",
      reason: "Nothing to cover",
      actorUserId: "u-1",
    });
    expect(mock.ceremonyOccurrence.update.mock.calls[0]![0]!.data).toEqual({
      status: "SKIPPED",
      skipReason: "Nothing to cover",
    });
    expect(result.status).toBe("SKIPPED");
  });

  it("refuses to skip an occurrence that already happened", async () => {
    const mock = db();
    mock.ceremonyOccurrence.findFirst.mockResolvedValue({
      id: "occ-1",
      status: "CAPTURED",
      scheduledStart: new Date(),
      ceremony: { id: "cer-1", name: "Daily Standup", timezone: "UTC" },
    } as never);
    await expect(
      skipOccurrence(mock, { occurrenceId: "occ-1", workspaceId: "ws-1", reason: "no", actorUserId: "u-1" }),
    ).rejects.toThrow(/already happened/);
    expect(mock.ceremonyOccurrence.update).not.toHaveBeenCalled();
  });
});

describe("unskipOccurrence", () => {
  it("returns a circulated occurrence to AGENDA_CIRCULATED and clears the reason", async () => {
    const mock = db();
    mock.ceremonyOccurrence.findFirst.mockResolvedValue({ id: "occ-1", agendaCirculatedAt: new Date() } as never);
    mock.ceremonyOccurrence.update.mockResolvedValue({ id: "occ-1", status: "AGENDA_CIRCULATED", skipReason: null } as never);
    await unskipOccurrence(mock, { occurrenceId: "occ-1", workspaceId: "ws-1", actorUserId: "u-1" });
    expect(mock.ceremonyOccurrence.update.mock.calls[0]![0]!.data).toEqual({
      status: "AGENDA_CIRCULATED",
      skipReason: null,
    });
  });

  it("returns an uncirculated occurrence to PLANNED", async () => {
    const mock = db();
    mock.ceremonyOccurrence.findFirst.mockResolvedValue({ id: "occ-1", agendaCirculatedAt: null } as never);
    mock.ceremonyOccurrence.update.mockResolvedValue({ id: "occ-1", status: "PLANNED", skipReason: null } as never);
    await unskipOccurrence(mock, { occurrenceId: "occ-1", workspaceId: "ws-1", actorUserId: "u-1" });
    expect(mock.ceremonyOccurrence.update.mock.calls[0]![0]!.data).toMatchObject({ status: "PLANNED" });
  });
});
