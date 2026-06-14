/**
 * Unit tests for getOrGenerateWeeklyWorkDigest — the owner-scoped lazy-read +
 * cache + empty-week orchestrator behind the getMyWeeklyWorkDigest procedure.
 * mockDeep<PrismaClient>() so no real DB is touched (CLAUDE.md test-db safety).
 * Tested at the service level rather than via createCaller because the tRPC
 * wrapper is a thin pass-through (resolve target -> orchestrator -> error map).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import {
  getOrGenerateWeeklyWorkDigest,
  DigestRateLimitError,
} from "../digest";

const db = mockDeep<PrismaClient>();
const now = new Date("2026-06-14T12:00:00Z");

// An OpenAI mock that fails the test if it's ever called (cache-hit / empty-week
// paths must not spend tokens).
const openaiNeverCalled = {
  chat: { completions: { create: vi.fn(() => { throw new Error("OpenAI should not be called"); }) } },
};

beforeEach(() => mockReset(db));

describe("getOrGenerateWeeklyWorkDigest", () => {
  it("returns a fresh cached row without generating", async () => {
    db.weeklyWorkDigest.findUnique.mockResolvedValue({
      narrative: "Cached week",
      highlights: ["a", "b", "c"],
      angles: ["x", "y", "z"],
      generatedAt: now, // age 0 -> within TTL
    } as never);

    const out = await getOrGenerateWeeklyWorkDigest(db, {
      userId: "user-1",
      now,
      openai: openaiNeverCalled,
    });

    expect(out.cached).toBe(true);
    expect(out.narrative).toBe("Cached week");
    expect(out.angles).toEqual(["x", "y", "z"]);
    // No generation path touched.
    expect(db.workspace.findMany).not.toHaveBeenCalled();
    expect(openaiNeverCalled.chat.completions.create).not.toHaveBeenCalled();
  });

  it("takes the canned empty-week shortcut (no LLM) when there are no signals", async () => {
    db.weeklyWorkDigest.findUnique.mockResolvedValue(null as never);
    db.workspace.findMany.mockResolvedValue([{ id: "ws-1" }] as never);
    // gather queries all return empty -> totalSignals 0
    db.workspaceActivityEvent.findMany.mockResolvedValue([] as never);
    db.ticket.findMany.mockResolvedValue([] as never);
    db.transcriptionSessionParticipant.findMany.mockResolvedValue([] as never);
    db.weeklyWorkDigest.upsert.mockImplementation((async (a: { create: Record<string, unknown> }) => ({
      ...a.create,
      generatedAt: now,
    })) as never);

    const out = await getOrGenerateWeeklyWorkDigest(db, {
      userId: "user-1",
      now,
      openai: openaiNeverCalled,
    });

    expect(openaiNeverCalled.chat.completions.create).not.toHaveBeenCalled();
    expect(out.angles).toEqual([]); // canned empty-week has no angles
    const upsertArg = db.weeklyWorkDigest.upsert.mock.calls[0]![0] as { create: { model: string } };
    expect(upsertArg.create.model).toBe("canned");
  });

  it("rate-limits a forced regenerate of the active week inside the cooldown", async () => {
    db.weeklyWorkDigest.findUnique.mockResolvedValue({
      narrative: "x",
      highlights: ["a", "b", "c"],
      angles: ["x", "y", "z"],
      generatedAt: now, // just generated
    } as never);

    await expect(
      getOrGenerateWeeklyWorkDigest(db, {
        userId: "user-1",
        force: true,
        now,
        openai: openaiNeverCalled,
      }),
    ).rejects.toBeInstanceOf(DigestRateLimitError);
  });

  it("generates via the LLM on a cache miss with signals present", async () => {
    db.weeklyWorkDigest.findUnique.mockResolvedValue(null as never);
    db.workspace.findMany.mockResolvedValue([{ id: "ws-1" }] as never);
    db.workspaceActivityEvent.findMany.mockResolvedValue([
      { action: "completed", entityType: "ticket", entityId: "t1", metadata: { title: "Ship it" }, workspace: { name: "WS" } },
    ] as never);
    db.ticket.findMany.mockResolvedValue([] as never);
    db.transcriptionSessionParticipant.findMany.mockResolvedValue([] as never);
    db.weeklyWorkDigest.upsert.mockImplementation((async (a: { create: Record<string, unknown> }) => ({
      ...a.create,
      generatedAt: now,
    })) as never);

    const openai = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: JSON.stringify({
              narrative: "You shipped it.",
              highlights: ["Shipped it", "Reviewed PRs", "Planned"],
              angles: ["Thread idea", "Hook", "Post"],
            }) } }],
            usage: { prompt_tokens: 100, completion_tokens: 50 },
          }),
        },
      },
    };

    const out = await getOrGenerateWeeklyWorkDigest(db, {
      userId: "user-1",
      now,
      openai,
    });

    expect(openai.chat.completions.create).toHaveBeenCalledOnce();
    expect(out.cached).toBe(false);
    expect(out.narrative).toBe("You shipped it.");
    expect(out.angles).toHaveLength(3);
  });
});
