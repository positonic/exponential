/**
 * Unit tests for the Fireflies "File new meetings into" setting on
 * `integration.updateIntegration` / `getIntegrationDetails`.
 *
 * A Workspace-level Meeting is visible to every member, so these pin who may
 * choose the target: only the owner of a personal Fireflies integration, and
 * only a workspace they belong to. Mocked Prisma; no DB.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

// Seed env vars before any module imports — `vi.hoisted` runs before regular
// top-level statements. Mirrors ticket.test.ts.
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

// ── Stub heavy/IO modules pulled in by the wider router tree ─────────
vi.mock("openai", () => ({
  default: class MockOpenAI {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(_opts?: any) {
      // intentionally empty
    }
  },
}));

vi.mock("next-auth", () => ({
  default: () => ({
    auth: () => null,
    handlers: {},
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
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

// ── dbMock plumbing ─────────────────────────────────────────────────
const dbHolder: { current: DeepMockProxy<PrismaClient> | null } = {
  current: null,
};
function getDbMock(): DeepMockProxy<PrismaClient> {
  if (!dbHolder.current) {
    dbHolder.current = mockDeep<PrismaClient>();
  }
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

// ── Stub side-effect-heavy modules used by sibling routers ───────────
vi.mock("~/server/services/notifications/EmailNotificationService", () => ({
  sendAssignmentNotifications: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("~/lib/blob", () => ({
  uploadToBlob: vi.fn().mockResolvedValue({ url: "blob://test" }),
}));


// ── Imports of code under test (must come AFTER vi.mock calls) ───────
import { createMockCaller } from "~/test/trpc-helpers";

const ownerId = "owner-1";
const workspaceId = "ws-1";

function firefliesIntegration(overrides: Record<string, unknown> = {}) {
  return {
    id: "int-1",
    name: "My Fireflies",
    description: null,
    provider: "fireflies",
    status: "ACTIVE",
    userId: ownerId,
    teamId: null,
    allowTeamMemberAccess: false,
    providerConfig: { unrelated: true },
    credentials: [],
    team: null,
    ...overrides,
  };
}

describe("integration router — Fireflies meeting workspace (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    dbMock.teamUser.findMany.mockResolvedValue([]);
    dbMock.teamUser.findFirst.mockResolvedValue(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbMock.integration.findUnique.mockResolvedValue(firefliesIntegration() as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbMock.integration.update.mockResolvedValue({} as any);
  });

  function providerConfigWrites() {
    return dbMock.integration.update.mock.calls
      .map((c) => (c[0] as { data: { providerConfig?: unknown } }).data.providerConfig)
      .filter((v) => v !== undefined);
  }

  it("lets the owner file meetings into a workspace they belong to, keeping other config", async () => {
    dbMock.workspaceUser.findUnique.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { role: "member", workspaceId } as any,
    );

    const caller = createMockCaller({ userId: ownerId, db: dbMock });
    await caller.integration.updateIntegration({ integrationId: "int-1", meetingWorkspaceId: workspaceId });

    expect(providerConfigWrites()).toEqual([{ unrelated: true, meetingWorkspaceId: workspaceId }]);
  });

  it("clears the setting back to Personal with null", async () => {
    dbMock.integration.findUnique.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      firefliesIntegration({ providerConfig: { unrelated: true, meetingWorkspaceId: workspaceId } }) as any,
    );

    const caller = createMockCaller({ userId: ownerId, db: dbMock });
    await caller.integration.updateIntegration({ integrationId: "int-1", meetingWorkspaceId: null });

    expect(providerConfigWrites()).toEqual([{ unrelated: true }]);
    expect(dbMock.workspaceUser.findUnique).not.toHaveBeenCalled();
  });

  it("refuses a workspace the owner is not a member of", async () => {
    dbMock.workspaceUser.findUnique.mockResolvedValue(null);

    const caller = createMockCaller({ userId: ownerId, db: dbMock });
    await expect(
      caller.integration.updateIntegration({ integrationId: "int-1", meetingWorkspaceId: "ws-other" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(providerConfigWrites()).toEqual([]);
  });

  it.each(["guest", "viewer"])("refuses a workspace the owner is only a %s of", async (role) => {
    dbMock.workspaceUser.findUnique.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { role, workspaceId } as any,
    );

    const caller = createMockCaller({ userId: ownerId, db: dbMock });
    await expect(
      caller.integration.updateIntegration({ integrationId: "int-1", meetingWorkspaceId: workspaceId }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(dbMock.integration.update).not.toHaveBeenCalled();
  });

  it("writes the workspace setting and the name in one update", async () => {
    dbMock.workspaceUser.findUnique.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { role: "member", workspaceId } as any,
    );

    const caller = createMockCaller({ userId: ownerId, db: dbMock });
    await caller.integration.updateIntegration({
      integrationId: "int-1",
      name: "Renamed",
      meetingWorkspaceId: workspaceId,
    });

    expect(dbMock.integration.update).toHaveBeenCalledTimes(1);
    expect(dbMock.integration.update.mock.calls[0]?.[0]).toMatchObject({
      data: { name: "Renamed", providerConfig: { unrelated: true, meetingWorkspaceId: workspaceId } },
    });
  });

  it("refuses the setting on a team integration, even for a team admin", async () => {
    dbMock.teamUser.findMany.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [{ teamId: "team-1" }] as any,
    );
    dbMock.integration.findUnique.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      firefliesIntegration({ userId: null, teamId: "team-1" }) as any,
    );
    dbMock.teamUser.findUnique.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { role: "admin" } as any,
    );

    const caller = createMockCaller({ userId: ownerId, db: dbMock });
    await expect(
      caller.integration.updateIntegration({ integrationId: "int-1", meetingWorkspaceId: workspaceId }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(providerConfigWrites()).toEqual([]);
  });

  it("refuses the setting on a non-Fireflies integration", async () => {
    dbMock.integration.findUnique.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      firefliesIntegration({ provider: "slack" }) as any,
    );

    const caller = createMockCaller({ userId: ownerId, db: dbMock });
    await expect(
      caller.integration.updateIntegration({ integrationId: "int-1", meetingWorkspaceId: workspaceId }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("leaves providerConfig alone when the field is omitted", async () => {
    const caller = createMockCaller({ userId: ownerId, db: dbMock });
    await caller.integration.updateIntegration({ integrationId: "int-1", name: "Renamed" });

    expect(providerConfigWrites()).toEqual([]);
  });

  it("reports the current setting in getIntegrationDetails", async () => {
    dbMock.integration.findUnique.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      firefliesIntegration({ providerConfig: { meetingWorkspaceId: workspaceId } }) as any,
    );

    const caller = createMockCaller({ userId: ownerId, db: dbMock });
    const details = await caller.integration.getIntegrationDetails({ integrationId: "int-1" });

    expect(details.meetingWorkspaceId).toBe(workspaceId);
  });
});
