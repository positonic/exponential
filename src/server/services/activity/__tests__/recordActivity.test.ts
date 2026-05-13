/**
 * Unit tests for recordActivity — the load-bearing primitive that any future
 * write site calls to log a workspace activity event.
 *
 * Uses mockDeep<PrismaClient>() so the test runs in milliseconds and CANNOT
 * touch a real DB. The recordActivity helper accepts a db argument explicitly,
 * which keeps these tests independent of `~/server/db` (no module mocking
 * needed). Per CLAUDE.md "Test database safety", any test under
 * `/services/` MUST stay mocked.
 *
 * We mock `~/env` rather than mutate process.env, because t3-env caches its
 * Proxy at module-load time — stubbing process.env after the fact has no
 * effect on the existing `env.NODE_ENV` value.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.AUTH_DISCORD_ID ??= "test";
  process.env.AUTH_DISCORD_SECRET ??= "test";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

// Mocked env — the test toggles fakeEnv.NODE_ENV directly. The mock factory
// returns a getter so each access reads the current value.
const fakeEnv = { NODE_ENV: "test" as "development" | "test" | "production" };
vi.mock("~/env", () => ({
  env: new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "NODE_ENV") return fakeEnv.NODE_ENV;
        return undefined;
      },
    },
  ),
}));

import { recordActivity } from "../recordActivity";

const dbMock: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();

describe("recordActivity", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockReset(dbMock);
    fakeEnv.NODE_ENV = "test";
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {
      // silence
    });
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
      // silence
    });
  });

  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("writes an event with the exact shape provided", async () => {
    dbMock.workspaceActivityEvent.create.mockResolvedValue({
      id: "evt-1",
      workspaceId: "ws-1",
      userId: "user-1",
      entityType: "action",
      entityId: "action-42",
      action: "created",
      metadata: { source: "test" },
      createdAt: new Date(),
    });

    const ok = await recordActivity(dbMock, {
      workspaceId: "ws-1",
      userId: "user-1",
      entityType: "action",
      entityId: "action-42",
      action: "created",
      metadata: { source: "test" },
    });

    expect(ok).toBe(true);
    expect(dbMock.workspaceActivityEvent.create).toHaveBeenCalledTimes(1);
    expect(dbMock.workspaceActivityEvent.create).toHaveBeenCalledWith({
      data: {
        workspaceId: "ws-1",
        userId: "user-1",
        entityType: "action",
        entityId: "action-42",
        action: "created",
        metadata: { source: "test" },
      },
    });
  });

  it("omitting metadata still writes the row", async () => {
    dbMock.workspaceActivityEvent.create.mockResolvedValue({
      id: "evt-2",
      workspaceId: "ws-1",
      userId: "user-1",
      entityType: "ticket",
      entityId: "ticket-9",
      action: "status_changed",
      metadata: null,
      createdAt: new Date(),
    });

    const ok = await recordActivity(dbMock, {
      workspaceId: "ws-1",
      userId: "user-1",
      entityType: "ticket",
      entityId: "ticket-9",
      action: "status_changed",
    });

    expect(ok).toBe(true);
    const data = dbMock.workspaceActivityEvent.create.mock.calls[0]![0]!.data;
    expect(data.metadata).toBeUndefined();
  });

  it("never throws to the caller when the DB write fails", async () => {
    dbMock.workspaceActivityEvent.create.mockRejectedValue(
      new Error("simulated DB failure"),
    );

    const ok = await recordActivity(dbMock, {
      workspaceId: "ws-1",
      userId: "user-1",
      entityType: "action",
      entityId: "action-1",
      action: "updated",
    });

    expect(ok).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(
      "[recordActivity] failed to write event",
      expect.objectContaining({ error: "simulated DB failure" }),
    );
  });

  it("throws when workspaceId is missing in development", async () => {
    fakeEnv.NODE_ENV = "development";

    await expect(
      recordActivity(dbMock, {
        workspaceId: "",
        userId: "user-1",
        entityType: "action",
        entityId: "action-1",
        action: "created",
      }),
    ).rejects.toThrow(/workspaceId is required/);

    expect(dbMock.workspaceActivityEvent.create).not.toHaveBeenCalled();
  });

  it("logs and swallows when workspaceId is missing in production", async () => {
    fakeEnv.NODE_ENV = "production";

    const ok = await recordActivity(dbMock, {
      workspaceId: "",
      userId: "user-1",
      entityType: "action",
      entityId: "action-1",
      action: "created",
    });

    expect(ok).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      "[recordActivity] missing workspaceId — skipping",
      expect.objectContaining({ entityType: "action", entityId: "action-1" }),
    );
    expect(dbMock.workspaceActivityEvent.create).not.toHaveBeenCalled();
  });

  it("logs and swallows when workspaceId is missing in test (non-dev fallback)", async () => {
    fakeEnv.NODE_ENV = "test";

    const ok = await recordActivity(dbMock, {
      workspaceId: "",
      userId: "user-1",
      entityType: "action",
      entityId: "action-1",
      action: "created",
    });

    expect(ok).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
    expect(dbMock.workspaceActivityEvent.create).not.toHaveBeenCalled();
  });
});
