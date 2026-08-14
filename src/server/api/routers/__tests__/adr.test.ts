/**
 * Authz tests for the Decision Log router (`adr`), per the feature's privacy
 * decision:
 *
 * - every procedure is human-only (ADR-0049): an external-agent principal
 *   (`isAgent` shadow user) is denied on EVERY procedure;
 * - reads gate at `edit` permission (minimum workspace role `member`) — a
 *   viewer-tier member is denied on `list`;
 * - config mutations gate at admin (`manage_members`) — a plain member is
 *   denied on `upsertConfigs` / `syncNow` / `disableConfig` /
 *   `setRepositoryProduct` / `probePaths`.
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` — no real DB, ever
 * (see CLAUDE.md "Test database safety"). Denial style imitates
 * credentialExposure.test.ts / workspaceMembers.test.ts.
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

const USER_ID = "user-1";
const WORKSPACE_ID = "ws-1";

function caller(db: DeepMockProxy<PrismaClient>) {
  return createMockCaller({ userId: USER_ID, db: db as unknown as PrismaClient });
}

/** humanOnlyProcedure reads the principal's isAgent flag. */
function asHuman(db: DeepMockProxy<PrismaClient>) {
  db.user.findUnique.mockResolvedValue({ isAgent: false } as never);
}
function asAgentPrincipal(db: DeepMockProxy<PrismaClient>) {
  db.user.findUnique.mockResolvedValue({ isAgent: true } as never);
}

/** Satisfy requireWorkspaceMembership at a given workspace role. */
function withWorkspaceRole(db: DeepMockProxy<PrismaClient>, role: string) {
  db.workspaceUser.findUnique.mockResolvedValue({
    userId: USER_ID,
    workspaceId: WORKSPACE_ID,
    role,
  } as never);
  db.workspace.findUnique.mockResolvedValue({
    id: WORKSPACE_ID,
    ownerId: "someone-else",
  } as never);
}

describe("adr router authz", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
  });

  describe("agent principals are denied on every procedure", () => {
    const calls: Array<[string, (c: ReturnType<typeof caller>) => Promise<unknown>]> = [
      ["list", (c) => c.adr.list({ workspaceId: WORKSPACE_ID })],
      ["listConfigs", (c) => c.adr.listConfigs({ workspaceId: WORKSPACE_ID })],
      [
        "upsertConfigs",
        (c) =>
          c.adr.upsertConfigs({
            workspaceId: WORKSPACE_ID,
            configs: [{ repositoryId: "repo-1", shortCode: "API", adrPaths: ["docs/adr"], enabled: true }],
          }),
      ],
      ["disableConfig", (c) => c.adr.disableConfig({ workspaceId: WORKSPACE_ID, configId: "cfg-1" })],
      [
        "setRepositoryProduct",
        (c) =>
          c.adr.setRepositoryProduct({
            workspaceId: WORKSPACE_ID,
            repositoryId: "repo-1",
            productId: null,
          }),
      ],
      [
        "probePaths",
        (c) =>
          c.adr.probePaths({
            workspaceId: WORKSPACE_ID,
            repositoryId: "repo-1",
            adrPaths: ["docs/adr"],
          }),
      ],
      ["syncNow", (c) => c.adr.syncNow({ workspaceId: WORKSPACE_ID, configId: "cfg-1" })],
      [
        "linkTicket",
        (c) =>
          c.adr.linkTicket({
            workspaceId: WORKSPACE_ID,
            adrId: "adr-1",
            ticketId: "t-1",
          }),
      ],
      [
        "unlinkTicket",
        (c) => c.adr.unlinkTicket({ workspaceId: WORKSPACE_ID, linkId: "link-1" }),
      ],
    ];

    for (const [name, call] of calls) {
      it(`denies an agent principal on ${name}`, async () => {
        asAgentPrincipal(db);
        // Even as a workspace OWNER, the agent principal must be refused.
        withWorkspaceRole(db, "owner");

        await expect(call(caller(db))).rejects.toThrow(
          /not available to external agents/i,
        );
      });
    }
  });

  describe("viewer-tier members are denied on reads", () => {
    it("denies a viewer on list — ADR content is member-visible, not viewer-visible", async () => {
      asHuman(db);
      withWorkspaceRole(db, "viewer");

      await expect(
        caller(db).adr.list({ workspaceId: WORKSPACE_ID }),
      ).rejects.toThrow();
    });

    it("denies a viewer on listConfigs", async () => {
      asHuman(db);
      withWorkspaceRole(db, "viewer");

      await expect(
        caller(db).adr.listConfigs({ workspaceId: WORKSPACE_ID }),
      ).rejects.toThrow();
    });

    it("allows a plain member on list", async () => {
      asHuman(db);
      withWorkspaceRole(db, "member");
      db.adrSyncConfig.findMany.mockResolvedValue([] as never);
      db.adrDocument.findMany.mockResolvedValue([] as never);

      await expect(
        caller(db).adr.list({ workspaceId: WORKSPACE_ID }),
      ).resolves.toEqual([]);
    });

    it("denies a viewer on linkTicket, allows a member (idempotent)", async () => {
      asHuman(db);
      withWorkspaceRole(db, "viewer");
      await expect(
        caller(db).adr.linkTicket({
          workspaceId: WORKSPACE_ID,
          adrId: "adr-1",
          ticketId: "t-1",
        }),
      ).rejects.toThrow();

      withWorkspaceRole(db, "member");
      db.adrDocument.findFirst.mockResolvedValue({ id: "adr-1" } as never);
      db.ticket.findFirst.mockResolvedValue({ id: "t-1" } as never);
      db.adrTicketLink.findFirst.mockResolvedValue(null);
      db.adrTicketLink.create.mockResolvedValue({ id: "link-1" } as never);

      await expect(
        caller(db).adr.linkTicket({
          workspaceId: WORKSPACE_ID,
          adrId: "adr-1",
          ticketId: "t-1",
        }),
      ).resolves.toMatchObject({ id: "link-1" });
      expect(db.adrTicketLink.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            adrId: "adr-1",
            ticketId: "t-1",
            featureId: null,
            createdById: USER_ID,
          }),
        }),
      );

      // Re-linking the same pair returns the existing row, creates nothing new.
      db.adrTicketLink.findFirst.mockResolvedValue({ id: "link-1" } as never);
      db.adrTicketLink.create.mockClear();
      await caller(db).adr.linkTicket({
        workspaceId: WORKSPACE_ID,
        adrId: "adr-1",
        ticketId: "t-1",
      });
      expect(db.adrTicketLink.create).not.toHaveBeenCalled();
    });

    it("rejects a linkTicket naming both or neither target", async () => {
      asHuman(db);
      withWorkspaceRole(db, "member");
      await expect(
        caller(db).adr.linkTicket({
          workspaceId: WORKSPACE_ID,
          adrId: "adr-1",
          ticketId: "t-1",
          featureId: "f-1",
        }),
      ).rejects.toThrow();
      await expect(
        caller(db).adr.linkTicket({ workspaceId: WORKSPACE_ID, adrId: "adr-1" }),
      ).rejects.toThrow();
    });
  });

  describe("config mutations are admin-only", () => {
    const mutations: Array<[string, (c: ReturnType<typeof caller>) => Promise<unknown>]> = [
      [
        "upsertConfigs",
        (c) =>
          c.adr.upsertConfigs({
            workspaceId: WORKSPACE_ID,
            configs: [{ repositoryId: "repo-1", shortCode: "API", adrPaths: ["docs/adr"], enabled: true }],
          }),
      ],
      ["disableConfig", (c) => c.adr.disableConfig({ workspaceId: WORKSPACE_ID, configId: "cfg-1" })],
      [
        "setRepositoryProduct",
        (c) =>
          c.adr.setRepositoryProduct({
            workspaceId: WORKSPACE_ID,
            repositoryId: "repo-1",
            productId: null,
          }),
      ],
      [
        "probePaths",
        (c) =>
          c.adr.probePaths({
            workspaceId: WORKSPACE_ID,
            repositoryId: "repo-1",
            adrPaths: ["docs/adr"],
          }),
      ],
      ["syncNow", (c) => c.adr.syncNow({ workspaceId: WORKSPACE_ID, configId: "cfg-1" })],
    ];

    for (const [name, call] of mutations) {
      it(`denies a plain member on ${name}`, async () => {
        asHuman(db);
        withWorkspaceRole(db, "member");

        await expect(call(caller(db))).rejects.toThrow();
      });
    }

    it("a disabled repo's documents and links stay visible on the index", async () => {
      // Soft-disconnect end to end: disableConfig flips state only, so the
      // list (which keys off enrolment, not enabled) keeps serving the docs
      // and their user-authored links.
      asHuman(db);
      withWorkspaceRole(db, "member");
      db.adrSyncConfig.findMany.mockResolvedValue([
        { repositoryId: "repo-1", shortCode: "API" },
      ] as never);
      db.adrDocument.findMany.mockResolvedValue([
        {
          id: "doc-1",
          repositoryId: "repo-1",
          path: "docs/adr/0001-x.md",
          number: 1,
          slug: "x",
          title: "X",
          status: "ACCEPTED",
          statusRaw: "Accepted",
          decidedAt: null,
          updatedAt: new Date(),
          repository: { id: "repo-1", fullName: "acme/api", productId: null, product: null },
          _count: { ticketLinks: 2 },
        },
      ] as never);

      const rows = await caller(db).adr.list({ workspaceId: WORKSPACE_ID });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ label: "API-0001", _count: { ticketLinks: 2 } });
    });

    it("allows an admin on disableConfig (and keeps it a soft state change)", async () => {
      asHuman(db);
      withWorkspaceRole(db, "admin");
      db.adrSyncConfig.findFirst.mockResolvedValue({ id: "cfg-1" } as never);
      db.adrSyncConfig.update.mockResolvedValue({ id: "cfg-1", enabled: false } as never);

      await caller(db).adr.disableConfig({
        workspaceId: WORKSPACE_ID,
        configId: "cfg-1",
      });

      expect(db.adrSyncConfig.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { enabled: false, integrationId: null },
        }),
      );
      expect(db.adrDocument.deleteMany).not.toHaveBeenCalled();
      expect(db.adrTicketLink.deleteMany).not.toHaveBeenCalled();
    });
  });
});
