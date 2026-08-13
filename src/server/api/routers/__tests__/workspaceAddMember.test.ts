/**
 * Unit tests for `workspace.addMember`'s existing-user branch: the "you've
 * been added" email must land on the public /invite/<token> page (which
 * prefills the recipient's email and offers a one-click sign-in code), never
 * on the bare /w/<slug> URL that bounces a signed-out recipient onto an
 * anonymous /signin wall.
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

vi.mock("~/server/services/EmailService", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/server/services/EmailService")>();
  return {
    ...actual,
    sendTeamInvitationEmail: vi.fn().mockResolvedValue(undefined),
    sendWorkspaceMemberAddedEmail: vi.fn().mockResolvedValue(undefined),
  };
});

import { createMockCaller } from "~/test/trpc-helpers";
import {
  sendWorkspaceMemberAddedEmail,
  sendTeamInvitationEmail,
} from "~/server/services/EmailService";

const ADMIN_ID = "admin-1";
const INVITEE_ID = "invitee-1";
const INVITEE_EMAIL = "invitee@example.com";
const WORKSPACE_ID = "ws-1";

function caller(db: DeepMockProxy<PrismaClient>) {
  return createMockCaller({ userId: ADMIN_ID, db: db as unknown as PrismaClient });
}

/**
 * Stub the existing-user happy path. Call-order sensitive:
 * `user.findUnique` is hit first by humanOnlyProcedure (isAgent check on the
 * caller) and then to look up the invitee; `workspaceUser.findUnique` first
 * checks the caller's role, then whether the invitee is already a member.
 */
function stubExistingUserPath(db: DeepMockProxy<PrismaClient>) {
  db.user.findUnique
    .mockResolvedValueOnce({ isAgent: false } as never)
    .mockResolvedValueOnce({
      id: INVITEE_ID,
      email: INVITEE_EMAIL,
      name: "Invitee",
    } as never);
  db.workspaceUser.findUnique
    .mockResolvedValueOnce({ role: "owner" } as never)
    .mockResolvedValueOnce(null);
  db.workspaceUser.create.mockResolvedValue({
    userId: INVITEE_ID,
    workspaceId: WORKSPACE_ID,
    role: "member",
    user: {
      id: INVITEE_ID,
      name: "Invitee",
      email: INVITEE_EMAIL,
      image: null,
    },
  } as never);
  db.workspace.findUnique.mockResolvedValue({
    name: "Clear",
    slug: "clear",
  } as never);
}

describe("workspace.addMember (existing user)", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
    vi.mocked(sendWorkspaceMemberAddedEmail).mockClear();
    vi.mocked(sendWorkspaceMemberAddedEmail).mockResolvedValue(undefined);
    vi.mocked(sendTeamInvitationEmail).mockClear();
  });

  it("emails a /invite/<token> landing link backed by an accepted invitation", async () => {
    stubExistingUserPath(db);
    // Prisma returns the stored row; the CTA is built from *its* token.
    db.workspaceInvitation.upsert.mockImplementation(
      (args: { create: { token: string } }) =>
        ({ token: args.create.token }) as never,
    );

    const result = await caller(db).workspace.addMember({
      workspaceId: WORKSPACE_ID,
      email: INVITEE_EMAIL,
      role: "member",
    });

    expect(result.type).toBe("member_added");

    // The landing record is minted as already-accepted: membership is granted
    // in this same mutation, the token only identifies the sign-in landing.
    expect(db.workspaceInvitation.upsert).toHaveBeenCalledTimes(1);
    const upsertArgs = db.workspaceInvitation.upsert.mock.calls[0]![0];
    expect(upsertArgs.create.status).toBe("accepted");
    expect(upsertArgs.update.status).toBe("accepted");
    const token = upsertArgs.create.token;
    expect(token).toMatch(/^[0-9a-f]{64}$/);

    expect(sendWorkspaceMemberAddedEmail).toHaveBeenCalledTimes(1);
    const emailArgs = vi.mocked(sendWorkspaceMemberAddedEmail).mock.calls[0]![0];
    expect(emailArgs.to).toBe(INVITEE_EMAIL);
    expect(emailArgs.ctaUrl).toContain(`/invite/${token}`);
    // The new-user invitation email must not fire on this branch.
    expect(sendTeamInvitationEmail).not.toHaveBeenCalled();
  });

  it("keeps an existing invitation's token so an already-sent link still works", async () => {
    stubExistingUserPath(db);
    // This address was invited by email first, then added once the account
    // existed: the earlier email is still clickable, so its token must survive.
    const EXISTING_TOKEN = "a".repeat(64);
    db.workspaceInvitation.upsert.mockResolvedValue({
      token: EXISTING_TOKEN,
    } as never);

    await caller(db).workspace.addMember({
      workspaceId: WORKSPACE_ID,
      email: INVITEE_EMAIL,
      role: "member",
    });

    // Nothing in the update payload may rotate the token.
    const upsertArgs = db.workspaceInvitation.upsert.mock.calls[0]![0];
    expect(upsertArgs.update).not.toHaveProperty("token");

    const emailArgs = vi.mocked(sendWorkspaceMemberAddedEmail).mock.calls[0]![0];
    expect(emailArgs.ctaUrl).toContain(`/invite/${EXISTING_TOKEN}`);
  });

  it("falls back to the workspace URL when the landing token can't be stored", async () => {
    stubExistingUserPath(db);
    db.workspaceInvitation.upsert.mockRejectedValue(new Error("db down"));

    const result = await caller(db).workspace.addMember({
      workspaceId: WORKSPACE_ID,
      email: INVITEE_EMAIL,
      role: "member",
    });

    // Membership was created before the email step — the mutation must not
    // fail because the nicer landing link couldn't be minted.
    expect(result.type).toBe("member_added");
    expect(sendWorkspaceMemberAddedEmail).toHaveBeenCalledTimes(1);
    const emailArgs = vi.mocked(sendWorkspaceMemberAddedEmail).mock.calls[0]![0];
    expect(emailArgs.ctaUrl).toContain("/w/clear");
    expect(emailArgs.ctaUrl).not.toContain("/invite/");
  });
});

describe("workspace.removeMember (invite landing cleanup)", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
  });

  it("expires the member's invitation so its landing page stops rendering", async () => {
    db.user.findUnique.mockResolvedValueOnce({ isAgent: false } as never);
    db.workspaceUser.findUnique
      .mockResolvedValueOnce({ role: "owner" } as never)
      .mockResolvedValueOnce({
        role: "member",
        user: { email: INVITEE_EMAIL },
      } as never);
    db.workspaceUser.delete.mockResolvedValue({} as never);
    db.externalAgent.findMany.mockResolvedValue([] as never);
    db.workspaceInvitation.updateMany.mockResolvedValue({ count: 1 } as never);

    const before = Date.now();
    const result = await caller(db).workspace.removeMember({
      workspaceId: WORKSPACE_ID,
      userId: INVITEE_ID,
    });

    expect(result.success).toBe(true);
    expect(db.workspaceInvitation.updateMany).toHaveBeenCalledTimes(1);
    const args = db.workspaceInvitation.updateMany.mock.calls[0]![0]!;
    expect(args.where).toMatchObject({
      workspaceId: WORKSPACE_ID,
      email: INVITEE_EMAIL,
    });
    expect((args.data as { expiresAt: Date }).expiresAt.getTime()).toBeGreaterThanOrEqual(
      before,
    );
  });

  it("still removes the member when expiring the invitation fails", async () => {
    db.user.findUnique.mockResolvedValueOnce({ isAgent: false } as never);
    db.workspaceUser.findUnique
      .mockResolvedValueOnce({ role: "owner" } as never)
      .mockResolvedValueOnce({
        role: "member",
        user: { email: INVITEE_EMAIL },
      } as never);
    db.workspaceUser.delete.mockResolvedValue({} as never);
    db.externalAgent.findMany.mockResolvedValue([] as never);
    db.workspaceInvitation.updateMany.mockRejectedValue(new Error("db down"));

    const result = await caller(db).workspace.removeMember({
      workspaceId: WORKSPACE_ID,
      userId: INVITEE_ID,
    });

    expect(result.success).toBe(true);
    expect(db.workspaceUser.delete).toHaveBeenCalledTimes(1);
  });
});
