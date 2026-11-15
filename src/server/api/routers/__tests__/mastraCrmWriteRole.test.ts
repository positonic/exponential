/**
 * Role gate on the Assistant's CRM tools (`mastra.*` callbacks): a viewer
 * cannot write to a workspace's CRM through the Assistant either. These
 * callbacks used to check membership only, and the ones that pick a
 * workspace themselves took the user's first workspace whatever their role
 * there.
 *
 * Mocked Prisma (`vitest-mock-extended`), same harness as
 * `mastraCallAgent.test.ts`.
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

// Contact PII is encrypted on write; the cipher has its own tests.
vi.mock("~/server/utils/encryption", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  encryptString: (value: string) => Buffer.from(value),
}));

import { createMockCaller } from "~/test/trpc-helpers";

const USER_ID = "user-1";
const WORKSPACE = "ws-1";

type Role = "owner" | "admin" | "member" | "viewer";

/** The caller's direct role in WORKSPACE (no team-based fallback). */
function stubRole(dbMock: DeepMockProxy<PrismaClient>, role: Role | null) {
  dbMock.workspaceUser.findUnique.mockResolvedValue(
    (role ? { role, workspaceId: WORKSPACE } : null) as never,
  );
  dbMock.teamUser.findFirst.mockResolvedValue(null as never);
}

/** Every workspace the caller belongs to, for the tools that pick one themselves. */
function stubMemberships(dbMock: DeepMockProxy<PrismaClient>, memberships: Array<{ workspaceId: string; role: Role }>) {
  dbMock.workspaceUser.findMany.mockResolvedValue(memberships as never);
}

async function errorCode(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
    return undefined;
  } catch (e) {
    return e instanceof TRPCError ? e.code : "NOT_TRPC";
  }
}

const CONTACT = { id: "contact-1", workspaceId: WORKSPACE, firstName: "Ada", lastName: null, email: null };

describe("the Assistant's CRM tools refuse viewers", () => {
  let dbMock: DeepMockProxy<PrismaClient>;
  const caller = () => createMockCaller({ userId: USER_ID, db: dbMock });

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    // Array-form transactions just settle their queries.
    dbMock.$transaction.mockImplementation((async (queries: Promise<unknown>[]) => Promise.all(queries)) as never);
    dbMock.crmContact.create.mockResolvedValue(CONTACT as never);
    dbMock.crmContact.update.mockResolvedValue(CONTACT as never);
    dbMock.crmContactInteraction.create.mockResolvedValue({
      id: "interaction-1",
      type: "EMAIL",
      direction: "OUTBOUND",
      subject: null,
      createdAt: new Date("2026-11-15T10:00:00Z"),
    } as never);
    dbMock.crmOrganization.create.mockResolvedValue({ id: "org-1", name: "Acme", industry: null } as never);
  });

  describe("createCrmContact in the workspace the chat forwarded", () => {
    const act = () =>
      caller().mastra.createCrmContact({ workspaceId: WORKSPACE, email: "ada@example.com", phone: "+10000000" });

    it("refuses a viewer with FORBIDDEN and writes nothing", async () => {
      stubRole(dbMock, "viewer");

      expect(await errorCode(act())).toBe("FORBIDDEN");
      expect(dbMock.crmContact.create).not.toHaveBeenCalled();
      expect(dbMock.crmContact.update).not.toHaveBeenCalled();
    });

    it("lets a member create the contact", async () => {
      stubRole(dbMock, "member");
      dbMock.crmContact.findFirst.mockResolvedValue(null);

      await expect(act()).resolves.toMatchObject({ created: true, contactId: CONTACT.id });
      expect(dbMock.crmContact.create.mock.calls[0]?.[0].data).toMatchObject({ workspaceId: WORKSPACE });
    });

    it("still answers a non-member with its own error, not a write", async () => {
      stubRole(dbMock, null);

      await expect(act()).resolves.toEqual({
        created: false,
        updated: false,
        error: "Workspace not found or access denied",
      });
      expect(dbMock.crmContact.create).not.toHaveBeenCalled();
    });
  });

  describe("createFullCrmContact in the workspace the chat forwarded", () => {
    const act = () => caller().mastra.createFullCrmContact({ workspaceId: WORKSPACE, firstName: "Ada" });

    it("refuses a viewer with FORBIDDEN and writes nothing", async () => {
      stubRole(dbMock, "viewer");

      expect(await errorCode(act())).toBe("FORBIDDEN");
      expect(dbMock.crmContact.create).not.toHaveBeenCalled();
    });

    it("lets a member create the contact", async () => {
      stubRole(dbMock, "member");

      await expect(act()).resolves.toMatchObject({ id: CONTACT.id });
      expect(dbMock.crmContact.create).toHaveBeenCalledTimes(1);
    });

    it("still answers a non-member with NOT_FOUND", async () => {
      stubRole(dbMock, null);

      expect(await errorCode(act())).toBe("NOT_FOUND");
      expect(dbMock.crmContact.create).not.toHaveBeenCalled();
    });
  });

  describe("updateCrmContact", () => {
    const act = () => caller().mastra.updateCrmContact({ contactId: CONTACT.id, firstName: "Ada L." });

    beforeEach(() => {
      dbMock.crmContact.findFirst.mockResolvedValue(CONTACT as never);
    });

    it("refuses a viewer with FORBIDDEN and writes nothing", async () => {
      stubRole(dbMock, "viewer");

      expect(await errorCode(act())).toBe("FORBIDDEN");
      expect(dbMock.crmContact.update).not.toHaveBeenCalled();
    });

    it("lets a member update the contact", async () => {
      stubRole(dbMock, "member");

      await expect(act()).resolves.toMatchObject({ id: CONTACT.id, updated: true });
      expect(dbMock.crmContact.update).toHaveBeenCalledTimes(1);
    });
  });

  describe("addCrmInteraction", () => {
    const act = () =>
      caller().mastra.addCrmInteraction({ contactId: CONTACT.id, type: "EMAIL", direction: "OUTBOUND" });

    beforeEach(() => {
      dbMock.crmContact.findFirst.mockResolvedValue({ workspaceId: WORKSPACE } as never);
    });

    it("refuses a viewer with FORBIDDEN and writes nothing", async () => {
      stubRole(dbMock, "viewer");

      expect(await errorCode(act())).toBe("FORBIDDEN");
      expect(dbMock.crmContactInteraction.create).not.toHaveBeenCalled();
    });

    it("lets a member log the interaction", async () => {
      stubRole(dbMock, "member");

      expect(await errorCode(act())).toBeUndefined();
      expect(dbMock.crmContactInteraction.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("tools that pick the workspace themselves", () => {
    const createOrganization = () => caller().mastra.createCrmOrganization({ name: "Acme" });
    const createContact = () => caller().mastra.createFullCrmContact({ firstName: "Ada" });

    it("refuse someone who only views their workspaces", async () => {
      stubMemberships(dbMock, [{ workspaceId: "ws-viewed", role: "viewer" }]);

      expect(await errorCode(createOrganization())).toBe("FORBIDDEN");
      expect(await errorCode(createContact())).toBe("FORBIDDEN");
      expect(dbMock.crmOrganization.create).not.toHaveBeenCalled();
      expect(dbMock.crmContact.create).not.toHaveBeenCalled();
    });

    it("write to a workspace the user can write in, never one they only view", async () => {
      stubMemberships(dbMock, [
        { workspaceId: "ws-viewed", role: "viewer" },
        { workspaceId: "ws-member", role: "member" },
      ]);

      await createOrganization();
      await createContact();

      expect(dbMock.crmOrganization.create.mock.calls[0]?.[0].data).toMatchObject({ workspaceId: "ws-member" });
      expect(dbMock.crmContact.create.mock.calls[0]?.[0].data).toMatchObject({ workspaceId: "ws-member" });
    });

    it("still answer someone with no workspace at all with NOT_FOUND", async () => {
      stubMemberships(dbMock, []);

      expect(await errorCode(createOrganization())).toBe("NOT_FOUND");
      expect(await errorCode(createContact())).toBe("NOT_FOUND");
    });
  });
});
