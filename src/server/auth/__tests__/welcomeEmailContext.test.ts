/**
 * Unit tests for `resolveWelcomeEmailContext` — the resolver that builds the
 * Welcome email's invited-workspace frame and chat-tool slot inside
 * `events.createUser`.
 *
 * Mocked Prisma via `vitest-mock-extended` (see CLAUDE.md "Test database
 * safety").
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.hoisted(() => {
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

import { resolveWelcomeEmailContext } from "../welcomeEmailContext";

const db = mockDeep<PrismaClient>();
const WS = "ws-1";
const EMAIL = "invitee@example.com";

beforeEach(() => {
  mockReset(db);
  db.workspace.findUnique.mockResolvedValue({ name: "Syntrofi" } as never);
  db.workspaceInvitation.findFirst.mockResolvedValue(null as never);
  db.integration.findFirst.mockResolvedValue(null as never);
});

describe("resolveWelcomeEmailContext", () => {
  it("returns {} when the workspace row is gone", async () => {
    db.workspace.findUnique.mockResolvedValue(null as never);
    expect(await resolveWelcomeEmailContext(db, WS, EMAIL)).toEqual({});
  });

  it("returns the workspace frame with a null inviter when no invitation matches", async () => {
    const result = await resolveWelcomeEmailContext(db, WS, EMAIL);
    expect(result.invited).toEqual({ workspaceName: "Syntrofi", inviterName: null });
    expect(result.chatTools).toEqual({ slack: false, matrix: false });
  });

  it("uses the inviter's name, falling back to email when the name is blank", async () => {
    db.workspaceInvitation.findFirst.mockResolvedValue({
      createdBy: { name: "   ", email: "james@example.com" },
    } as never);
    const result = await resolveWelcomeEmailContext(db, WS, EMAIL);
    expect(result.invited?.inviterName).toBe("james@example.com");
  });

  it("detects Slack via workspace-scoped OR member-owned integrations", async () => {
    await resolveWelcomeEmailContext(db, WS, EMAIL);
    const slackWhere = db.integration.findFirst.mock.calls
      .map((c) => c[0]?.where)
      .find((w) => w?.provider === "slack");
    // Slack integrations are user-owned (OAuth callback sets only userId), so
    // a workspaceId-only filter would never match — the member arm is load-bearing.
    expect(slackWhere?.OR).toEqual([
      { workspaceId: WS },
      { user: { workspaceMemberships: { some: { workspaceId: WS } } } },
    ]);
  });

  it("detects Matrix only via workspace-registered matrix-server rows", async () => {
    await resolveWelcomeEmailContext(db, WS, EMAIL);
    const matrixWhere = db.integration.findFirst.mock.calls
      .map((c) => c[0]?.where)
      .find((w) => w?.provider === "matrix-server");
    expect(matrixWhere).toMatchObject({ status: "ACTIVE", workspaceId: WS });
  });

  it("sets the chat-tool flags from the integration lookups", async () => {
    db.integration.findFirst.mockImplementation(((args: {
      where?: { provider?: string };
    }) =>
      Promise.resolve(
        args.where?.provider === "matrix-server" ? { id: "int-m" } : null,
      )) as never);
    const result = await resolveWelcomeEmailContext(db, WS, EMAIL);
    expect(result.chatTools).toEqual({ slack: false, matrix: true });
  });

  it("never throws — a DB failure degrades to {} (generic Welcome email)", async () => {
    db.workspace.findUnique.mockRejectedValue(new Error("db down") as never);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await resolveWelcomeEmailContext(db, WS, EMAIL)).toEqual({});
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
