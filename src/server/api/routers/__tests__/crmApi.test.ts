/**
 * Unit tests for the public CRM API router (`crmApi.*`).
 *
 * Focused on the dedup behaviour added to `contactCreate` (return existing row
 * on emailHash hit, set `wasExisting`, guard cross-tenant collisions) and the
 * email-filter parameter on `contactList`. Uses `mockDeep<PrismaClient>()` so
 * no real DB is ever touched — see CLAUDE.md "Test database safety".
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
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
  // 32 raw bytes — valid AES-256 key for encryptString in tests.
  process.env.DATABASE_ENCRYPTION_KEY ??= "0".repeat(32);
});

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

const dbHolder: { current: DeepMockProxy<PrismaClient> | null } = { current: null };

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

import { createMockCaller } from "~/test/trpc-helpers";
import { emailHashFor } from "~/server/services/crm/createCrmContact";

describe("crmApi router (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;
  const callerId = "user-1";
  const workspaceId = "ws-1";

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);

    // Caller is a member of the target workspace by default.
    dbMock.workspaceUser.findFirst.mockResolvedValue({
      userId: callerId,
      workspaceId,
      role: "member",
      joinedAt: new Date(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  });

  // ────────────────────────────────────────────────────────────────────
  // contactCreate — dedup behaviour
  // ────────────────────────────────────────────────────────────────────
  describe("contactCreate", () => {
    function buildContactRow(overrides: Partial<Record<string, unknown>> = {}) {
      return {
        id: "c-1",
        workspaceId,
        firstName: "Ada",
        lastName: "Lovelace",
        email: null,
        phone: null,
        linkedIn: null,
        telegram: null,
        twitter: null,
        github: null,
        bluesky: null,
        about: null,
        profileType: null,
        skills: [],
        tags: [],
        emailHash: null,
        lastInteractionAt: null,
        lastInteractionType: null,
        emailOptedOutAt: null,
        organizationId: null,
        createdById: callerId,
        connectionScore: 0,
        importSource: null,
        googleContactId: null,
        lastSyncedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        organization: null,
        createdBy: {
          id: callerId,
          name: "Caller",
          email: "caller@test.com",
          image: null,
        },
        ...overrides,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;
    }

    it("creates a new contact and sets emailHash when email is provided", async () => {
      dbMock.crmContact.findUnique.mockResolvedValue(null);
      const created = buildContactRow({
        emailHash: emailHashFor("ada@example.com"),
      });
      dbMock.crmContact.create.mockResolvedValue(created);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      const result = await caller.crmApi.contactCreate({
        workspaceId,
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
      });

      expect(result.wasExisting).toBe(false);
      expect(result.id).toBe("c-1");

      // The persisted row carries the emailHash so future calls dedupe.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const createArgs = (dbMock.crmContact.create.mock.calls[0]?.[0] as any)
        ?.data as Record<string, unknown>;
      expect(createArgs.emailHash).toBe(emailHashFor("ada@example.com"));
    });

    it("returns the existing contact with wasExisting=true on emailHash hit (same workspace)", async () => {
      const hash = emailHashFor("ada@example.com");
      // First lookup: emailHash returns existing contact summary.
      dbMock.crmContact.findUnique.mockResolvedValueOnce({
        id: "c-existing",
        workspaceId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      // Second lookup (findUniqueOrThrow): full row for response shape.
      dbMock.crmContact.findUniqueOrThrow.mockResolvedValue(
        buildContactRow({ id: "c-existing", emailHash: hash }),
      );

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      const result = await caller.crmApi.contactCreate({
        workspaceId,
        firstName: "Resubmitted",
        email: "ada@example.com",
      });

      expect(result.wasExisting).toBe(true);
      expect(result.id).toBe("c-existing");
      // The existing row was NOT overwritten — no create issued.
      expect(dbMock.crmContact.create).not.toHaveBeenCalled();
    });

    it("throws CONFLICT when emailHash matches a contact in another workspace", async () => {
      dbMock.crmContact.findUnique.mockResolvedValueOnce({
        id: "c-foreign",
        workspaceId: "ws-other",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await expect(
        caller.crmApi.contactCreate({
          workspaceId,
          email: "ada@example.com",
        }),
      ).rejects.toMatchObject({
        // tRPC wraps the TRPCError; both `code` and the underlying error are visible.
        code: "CONFLICT",
      } satisfies Partial<TRPCError>);

      expect(dbMock.crmContact.create).not.toHaveBeenCalled();
    });

    it("creates without emailHash when no email is supplied", async () => {
      dbMock.crmContact.create.mockResolvedValue(buildContactRow());

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      const result = await caller.crmApi.contactCreate({
        workspaceId,
        firstName: "Anonymous",
      });

      expect(result.wasExisting).toBe(false);
      // No dedup lookup when there's nothing to hash.
      expect(dbMock.crmContact.findUnique).not.toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const createArgs = (dbMock.crmContact.create.mock.calls[0]?.[0] as any)
        ?.data as Record<string, unknown>;
      expect(createArgs.emailHash).toBeUndefined();
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // contactList — email filter
  // ────────────────────────────────────────────────────────────────────
  describe("contactList", () => {
    it("narrows the query to the emailHash when `email` is supplied", async () => {
      dbMock.crmContact.findMany.mockResolvedValue([]);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await caller.crmApi.contactList({
        workspaceId,
        email: "ada@example.com",
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const findManyArgs = dbMock.crmContact.findMany.mock.calls[0]?.[0] as any;
      expect(findManyArgs.where.emailHash).toBe(emailHashFor("ada@example.com"));
      expect(findManyArgs.where.workspaceId).toBe(workspaceId);
    });

    it("omits the emailHash filter when `email` is not supplied", async () => {
      dbMock.crmContact.findMany.mockResolvedValue([]);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await caller.crmApi.contactList({ workspaceId });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const findManyArgs = dbMock.crmContact.findMany.mock.calls[0]?.[0] as any;
      expect(findManyArgs.where.emailHash).toBeUndefined();
    });
  });
});
