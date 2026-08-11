/**
 * Weekly OKR check-in ritual → workspace activity feed (feature
 * cmsp1mxfv0001ky049lv567q0).
 *
 * External behavior under test:
 * - okrCheckin.submitStatusUpdate records one `okr_checkin`/`checked_in`
 *   event whose entityId is the member's status-update row and whose
 *   metadata carries only the TEAM name.
 * - okrCheckin.completeMeeting records one `okr_checkin`/`completed` event
 *   for the check-in itself.
 * - Draft saves (upsertStatusUpdate) and startMeeting record nothing.
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` — no real DB, ever
 * (see CLAUDE.md "Test database safety").
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.hoisted(() => {
  process.env.OPENAI_API_KEY ??= "sk-test-dummy";
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.NODE_ENV ??= "test";
  process.env.GOOGLE_CLIENT_ID ??= "test";
  process.env.GOOGLE_CLIENT_SECRET ??= "test";
  process.env.MASTRA_API_URL ??= "http://localhost:4111";
  process.env.AUTH_DISCORD_ID ??= "test";
  process.env.AUTH_DISCORD_SECRET ??= "test";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.DATABASE_ENCRYPTION_KEY ??= "0".repeat(64);
});

vi.mock("openai", () => ({
  default: class MockOpenAI {
    constructor(_opts?: unknown) {
      // intentionally empty
    }
  },
}));

vi.mock("next-auth", () => ({
  default: () => ({ auth: () => null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("next-auth/providers/discord", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/google", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/notion", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/postmark", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/microsoft-entra-id", () => ({ default: vi.fn() }));

vi.mock("~/server/auth", () => ({
  auth: () => null,
  handlers: {},
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

const dbHolder: { current: DeepMockProxy<PrismaClient> | null } = { current: null };
function getDbMock(): DeepMockProxy<PrismaClient> {
  if (!dbHolder.current) dbHolder.current = mockDeep<PrismaClient>();
  return dbHolder.current;
}
vi.mock("~/server/db", () => {
  const proxy = new Proxy(
    {},
    {
      get(_t, prop) {
        const m = getDbMock() as unknown as Record<string | symbol, unknown>;
        return m[prop as string];
      },
    },
  );
  return { db: proxy };
});

import { createMockCaller } from "~/test/trpc-helpers";

const MEMBER_ID = "user-member";
const WORKSPACE_ID = "ws-1";
const CHECKIN_ID = "checkin-1";
const TEAM_NAME = "Platform Team";

const CHECKIN_ROW = {
  teamId: "team-1",
  status: "IN_PROGRESS",
  facilitatorId: MEMBER_ID,
  startedAt: new Date("2026-08-10T09:00:00.000Z"),
  workspaceId: WORKSPACE_ID,
  team: { name: TEAM_NAME },
};

describe("okrCheckin ritual → activity feed", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
    db.okrCheckin.findUnique.mockResolvedValue(CHECKIN_ROW as never);
    db.teamUser.findUnique.mockResolvedValue({
      userId: MEMBER_ID,
      teamId: "team-1",
      role: "member",
    } as never);
    db.okrCheckinUpdate.update.mockResolvedValue({ id: "upd-1" } as never);
    db.okrCheckinUpdate.upsert.mockResolvedValue({ id: "upd-1" } as never);
    db.okrCheckin.update.mockResolvedValue({
      id: CHECKIN_ID,
      status: "COMPLETED",
    } as never);
    db.workspaceActivityEvent.create.mockResolvedValue({ id: "evt-1" } as never);
  });

  it("submitStatusUpdate records one okr_checkin/checked_in event with the team name", async () => {
    const caller = createMockCaller({ userId: MEMBER_ID, db });

    await caller.okrCheckin.submitStatusUpdate({ okrCheckinId: CHECKIN_ID });

    expect(db.workspaceActivityEvent.create).toHaveBeenCalledTimes(1);
    expect(db.workspaceActivityEvent.create).toHaveBeenCalledWith({
      data: {
        workspaceId: WORKSPACE_ID,
        userId: MEMBER_ID,
        entityType: "okr_checkin",
        entityId: "upd-1",
        action: "checked_in",
        metadata: { title: TEAM_NAME },
      },
    });
  });

  it("completeMeeting records one okr_checkin/completed event", async () => {
    const caller = createMockCaller({ userId: MEMBER_ID, db });

    await caller.okrCheckin.completeMeeting({ okrCheckinId: CHECKIN_ID });

    expect(db.workspaceActivityEvent.create).toHaveBeenCalledTimes(1);
    expect(db.workspaceActivityEvent.create).toHaveBeenCalledWith({
      data: {
        workspaceId: WORKSPACE_ID,
        userId: MEMBER_ID,
        entityType: "okr_checkin",
        entityId: CHECKIN_ID,
        action: "completed",
        metadata: { title: TEAM_NAME },
      },
    });
  });

  it("upsertStatusUpdate (draft save) records nothing", async () => {
    const caller = createMockCaller({ userId: MEMBER_ID, db });

    await caller.okrCheckin.upsertStatusUpdate({
      okrCheckinId: CHECKIN_ID,
      accomplishments: "WIP notes",
    });

    expect(db.workspaceActivityEvent.create).not.toHaveBeenCalled();
  });

  it("startMeeting records nothing", async () => {
    db.okrCheckin.findUnique.mockResolvedValue({
      ...CHECKIN_ROW,
      status: "PREPARING",
    } as never);
    const caller = createMockCaller({ userId: MEMBER_ID, db });

    await caller.okrCheckin.startMeeting({ okrCheckinId: CHECKIN_ID });

    expect(db.workspaceActivityEvent.create).not.toHaveBeenCalled();
  });
});
