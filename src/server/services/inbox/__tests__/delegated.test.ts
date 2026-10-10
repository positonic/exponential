/**
 * The Delegated tab's aggregation (ADR-0067, Agent PRD D10): WHERE builders
 * shared by count and list, badge arithmetic that never counts live runs.
 * Mocked Prisma — no DB.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import {
  countDelegated,
  delegatedRunsWhere,
  liveDelegatedWhere,
  listDelegated,
  unreviewedDelegatedWhere,
  waitingDelegatedWhere,
} from "../delegated";

const USER = "u1";
const db: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();

describe("delegated WHERE builders", () => {
  it("scopes to runs I requested or my own Assistant performed", () => {
    expect(delegatedRunsWhere(USER)).toEqual({ OR: [{ requestedById: USER }, { agent: { ownerId: USER } }] });
  });

  it("live = the live set; waiting = WAITING_ON_OWNER; unreviewed = terminal and not reviewed", () => {
    expect(liveDelegatedWhere(USER)).toEqual({
      AND: [delegatedRunsWhere(USER), { status: { in: ["QUEUED", "RUNNING"] } }],
    });
    expect(waitingDelegatedWhere(USER)).toEqual({
      AND: [delegatedRunsWhere(USER), { status: "WAITING_ON_OWNER" }],
    });
    expect(unreviewedDelegatedWhere(USER)).toEqual({
      AND: [
        delegatedRunsWhere(USER),
        { status: { in: ["SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED"] } },
        { reviewedAt: null },
      ],
    });
  });
});

describe("countDelegated", () => {
  beforeEach(() => mockReset(db));

  it("attention = waiting + unreviewed, never live", async () => {
    db.agentRun.count
      .mockResolvedValueOnce(3 as never) // live
      .mockResolvedValueOnce(1 as never) // waiting
      .mockResolvedValueOnce(2 as never); // unreviewed
    expect(await countDelegated(db, USER)).toEqual({ live: 3, waiting: 1, unreviewed: 2, attention: 3 });
    expect(db.agentRun.count.mock.calls.map((c) => c[0]?.where)).toEqual([
      liveDelegatedWhere(USER),
      waitingDelegatedWhere(USER),
      unreviewedDelegatedWhere(USER),
    ]);
  });
});

describe("listDelegated", () => {
  beforeEach(() => mockReset(db));

  it("uses the same WHERE builders as the counts and shapes rows with owner/requester flags", async () => {
    db.agentRun.count.mockResolvedValue(0 as never);
    const row = {
      id: "run-1", status: "SUCCEEDED", executor: "MASTRA", createdAt: new Date(), startedAt: null, finishedAt: null,
      lastEventAt: null, toolCallCount: 2, summary: "Done.", readyToClose: true, reviewedAt: null, requestedById: USER,
      agent: { id: "agent-1", name: "Aria", ownerId: "owner-2", assistant: { emoji: "✨" } },
      action: { id: "a1", name: "Find a venue", status: "ACTIVE", workspace: null, project: { name: "Offsite", workspace: { slug: "acme", name: "Acme" } } },
    };
    db.agentRun.findMany.mockResolvedValue([] as never).mockResolvedValueOnce([] as never).mockResolvedValueOnce([] as never).mockResolvedValueOnce([row] as never);

    const result = await listDelegated(db, USER, new Date("2026-10-10T12:00:00Z"));

    const wheres = db.agentRun.findMany.mock.calls.map((c) => c[0]?.where);
    expect(wheres[0]).toEqual(liveDelegatedWhere(USER));
    expect(wheres[1]).toEqual(waitingDelegatedWhere(USER));
    expect(wheres[2]).toEqual(unreviewedDelegatedWhere(USER));
    expect(result.unreviewed[0]).toMatchObject({
      id: "run-1",
      isOwner: false,
      isRequester: true,
      agent: { name: "Aria", emoji: "✨" },
      action: { name: "Find a venue", projectName: "Offsite", workspace: { slug: "acme", name: "Acme" } },
    });
  });
});
