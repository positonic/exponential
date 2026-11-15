/**
 * Role gate on CRM and tag mutations: workspace *membership* is not permission
 * to write. `crmOrganization`, `crmContact` and `tag` gated their mutations on
 * "has a WorkspaceUser row", which let a read-only `viewer` create, change and
 * delete contacts and organizations, log interactions, upload images, create
 * and rename tags, and retag tickets, features and epics. Each block checks
 * that a `viewer` gets FORBIDDEN and writes nothing, while a `member` goes
 * through to the write.
 *
 * Mocked Prisma (`vitest-mock-extended`), same harness as the product
 * plugin's `writeRole.test.ts`.
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

// Side effects of a contact write that have their own tests: automations,
// enrichment, scoring, blob storage.
vi.mock("~/server/services/crm/automation/dispatchContactTypeAutomations", () => ({
  dispatchContactTypeAutomations: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("~/server/services/crm/enrichment/dispatchContactEnrichment", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  dispatchContactEnrichment: vi.fn().mockResolvedValue(undefined),
}));
const calculateScore = vi.hoisted(() => vi.fn());
vi.mock("~/server/services/ConnectionStrengthCalculator", () => ({
  ConnectionStrengthCalculator: { calculateScore },
}));
const recalculateAllScores = vi.hoisted(() => vi.fn());
vi.mock("~/server/services/ContactSyncService", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ContactSyncService: { recalculateAllScores },
}));
vi.mock("~/lib/blob", () => ({
  uploadToBlob: vi.fn().mockResolvedValue({ url: "blob://test" }),
  deleteFromBlob: vi.fn().mockResolvedValue(undefined),
}));

import { createMockCaller } from "~/test/trpc-helpers";

const callerId = "user-1";
const workspaceId = "ws-1";

type Role = "owner" | "admin" | "member" | "viewer";

/** The caller's direct WorkspaceUser role (no team-based fallback). */
function stubRole(dbMock: DeepMockProxy<PrismaClient>, role: Role) {
  dbMock.workspaceUser.findUnique.mockResolvedValue({ role, workspaceId } as never);
  // The reads these routers still gate with their own lookup.
  dbMock.workspaceUser.findFirst.mockResolvedValue({ role, workspaceId } as never);
  dbMock.teamUser.findFirst.mockResolvedValue(null as never);
}

async function expectForbidden(p: Promise<unknown>) {
  let code: string | undefined;
  try {
    await p;
  } catch (e) {
    code = e instanceof TRPCError ? e.code : "NOT_TRPC";
  }
  expect(code).toBe("FORBIDDEN");
}

/**
 * Shared shape for every block: `arrange` stubs the entity lookup and the
 * write; `act` fires the mutation; `write` is the call that must stay
 * untouched for a viewer and be made for a member.
 */
function roleGateCases(opts: {
  arrange: (db: DeepMockProxy<PrismaClient>) => void;
  act: (caller: ReturnType<typeof createMockCaller>) => Promise<unknown>;
  write: (db: DeepMockProxy<PrismaClient>) => { mock: { calls: unknown[] } };
}) {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    calculateScore.mockReset().mockResolvedValue(42);
    recalculateAllScores.mockReset().mockResolvedValue(undefined);
    // Interactive transactions get the mock as their client; array-form
    // transactions just settle their queries.
    dbMock.$transaction.mockImplementation((async (arg: unknown) =>
      typeof arg === "function"
        ? (arg as (tx: PrismaClient) => unknown)(dbMock)
        : Promise.all(arg as Promise<unknown>[])) as never);
    opts.arrange(dbMock);
  });

  it("refuses a viewer with FORBIDDEN and writes nothing", async () => {
    stubRole(dbMock, "viewer");
    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await expectForbidden(opts.act(caller));
    expect(opts.write(dbMock).mock.calls).toHaveLength(0);
  });

  it("lets a member through to the write", async () => {
    stubRole(dbMock, "member");
    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await opts.act(caller);
    expect(opts.write(dbMock).mock.calls).toHaveLength(1);
  });
}

const ORG = { id: "org-1", workspaceId, _count: { contacts: 0 } };
const CONTACT = { id: "contact-1", workspaceId, aiSourcedFields: [] as string[], profileType: null };
const TAG = { id: "tag-1", name: "Urgent", slug: "urgent", workspaceId, isSystem: false };

// ── CRM organizations ───────────────────────────────────────────────

describe("crmOrganization.create role gate (mocked)", () => {
  roleGateCases({
    arrange: (db) => db.crmOrganization.create.mockResolvedValue(ORG as never),
    act: (caller) => caller.crmOrganization.create({ workspaceId, name: "Acme" }),
    write: (db) => db.crmOrganization.create,
  });
});

describe("crmOrganization.update role gate (mocked)", () => {
  roleGateCases({
    arrange: (db) => {
      db.crmOrganization.findUnique.mockResolvedValue(ORG as never);
      db.crmOrganization.update.mockResolvedValue(ORG as never);
    },
    act: (caller) => caller.crmOrganization.update({ id: ORG.id, name: "Acme Ltd" }),
    write: (db) => db.crmOrganization.update,
  });
});

describe("crmOrganization.delete role gate (mocked)", () => {
  roleGateCases({
    arrange: (db) => {
      db.crmOrganization.findUnique.mockResolvedValue(ORG as never);
      db.crmOrganization.delete.mockResolvedValue(ORG as never);
    },
    act: (caller) => caller.crmOrganization.delete({ id: ORG.id }),
    write: (db) => db.crmOrganization.delete,
  });
});

// ── CRM contacts ────────────────────────────────────────────────────

describe("crmContact.create role gate (mocked)", () => {
  roleGateCases({
    arrange: (db) => db.crmContact.create.mockResolvedValue(CONTACT as never),
    act: (caller) => caller.crmContact.create({ workspaceId, firstName: "Ada" }),
    write: (db) => db.crmContact.create,
  });
});

describe("crmContact.update role gate (mocked)", () => {
  roleGateCases({
    arrange: (db) => {
      db.crmContact.findUnique.mockResolvedValue(CONTACT as never);
      db.crmContact.update.mockResolvedValue(CONTACT as never);
    },
    act: (caller) => caller.crmContact.update({ id: CONTACT.id, firstName: "Ada" }),
    write: (db) => db.crmContact.update,
  });
});

describe("crmContact.delete role gate (mocked)", () => {
  roleGateCases({
    arrange: (db) => {
      db.crmContact.findUnique.mockResolvedValue(CONTACT as never);
      db.crmContact.delete.mockResolvedValue(CONTACT as never);
    },
    act: (caller) => caller.crmContact.delete({ id: CONTACT.id }),
    write: (db) => db.crmContact.delete,
  });
});

describe("crmContact.bulkDelete role gate (mocked)", () => {
  roleGateCases({
    arrange: (db) => db.crmContact.deleteMany.mockResolvedValue({ count: 2 } as never),
    act: (caller) => caller.crmContact.bulkDelete({ workspaceId, ids: ["contact-1", "contact-2"] }),
    write: (db) => db.crmContact.deleteMany,
  });
});

describe("crmContact.addInteraction role gate (mocked)", () => {
  roleGateCases({
    arrange: (db) => {
      db.crmContact.findUnique.mockResolvedValue(CONTACT as never);
      db.crmContactInteraction.create.mockResolvedValue({ id: "interaction-1" } as never);
      db.crmContact.update.mockResolvedValue(CONTACT as never);
    },
    act: (caller) =>
      caller.crmContact.addInteraction({ contactId: CONTACT.id, type: "EMAIL", direction: "OUTBOUND" }),
    write: (db) => db.crmContactInteraction.create,
  });
});

describe("crmContact.assignToOrganization role gate (mocked)", () => {
  roleGateCases({
    arrange: (db) => {
      db.crmContact.findUnique.mockResolvedValue(CONTACT as never);
      db.crmContact.update.mockResolvedValue(CONTACT as never);
    },
    act: (caller) => caller.crmContact.assignToOrganization({ contactId: CONTACT.id, organizationId: null }),
    write: (db) => db.crmContact.update,
  });
});

describe("crmContact.recalculateScore role gate (mocked)", () => {
  roleGateCases({
    arrange: (db) => {
      db.crmContact.findUnique.mockResolvedValue(CONTACT as never);
      db.crmContact.update.mockResolvedValue(CONTACT as never);
    },
    act: (caller) => caller.crmContact.recalculateScore({ contactId: CONTACT.id }),
    write: (db) => db.crmContact.update,
  });
});

describe("crmContact.recalculateAllScores role gate (mocked)", () => {
  roleGateCases({
    arrange: () => undefined,
    act: (caller) => caller.crmContact.recalculateAllScores({ workspaceId }),
    write: () => recalculateAllScores,
  });
});

describe("crmContact.uploadImage role gate (mocked)", () => {
  roleGateCases({
    arrange: (db) => {
      db.crmContact.findUnique.mockResolvedValue(CONTACT as never);
      db.screenshot.create.mockResolvedValue({ id: "shot-1" } as never);
      db.crmContactScreenshot.create.mockResolvedValue({ id: "join-1" } as never);
    },
    act: (caller) => caller.crmContact.uploadImage({ contactId: CONTACT.id, base64Data: "aGVsbG8=" }),
    write: (db) => db.crmContactScreenshot.create,
  });
});

describe("crmContact.removeScreenshot role gate (mocked)", () => {
  roleGateCases({
    arrange: (db) => {
      db.crmContact.findUnique.mockResolvedValue(CONTACT as never);
      db.crmContactScreenshot.findUnique.mockResolvedValue({
        id: "join-1",
        screenshot: { url: "blob://test" },
      } as never);
      db.crmContactScreenshot.delete.mockResolvedValue({ id: "join-1" } as never);
      db.actionScreenshot.count.mockResolvedValue(1);
      db.crmContactScreenshot.count.mockResolvedValue(0);
    },
    act: (caller) => caller.crmContact.removeScreenshot({ contactId: CONTACT.id, screenshotId: "shot-1" }),
    write: (db) => db.crmContactScreenshot.delete,
  });
});

describe("reading contacts (mocked)", () => {
  it("still lets a viewer list a contact's images", async () => {
    const dbMock = getDbMock();
    mockReset(dbMock);
    stubRole(dbMock, "viewer");
    dbMock.crmContact.findUnique.mockResolvedValue(CONTACT as never);
    dbMock.crmContactScreenshot.findMany.mockResolvedValue([] as never);

    const caller = createMockCaller({ userId: callerId, db: dbMock });

    await expect(caller.crmContact.listScreenshots({ contactId: CONTACT.id })).resolves.toEqual([]);
  });
});

// ── Tags ────────────────────────────────────────────────────────────

describe("tag.create role gate (mocked)", () => {
  roleGateCases({
    arrange: (db) => {
      db.tag.findFirst.mockResolvedValue(null);
      db.tag.create.mockResolvedValue(TAG as never);
    },
    act: (caller) => caller.tag.create({ workspaceId, name: "Urgent", color: "avatar-red" }),
    write: (db) => db.tag.create,
  });
});

describe("tag.update role gate (mocked)", () => {
  roleGateCases({
    arrange: (db) => {
      db.tag.findUnique.mockResolvedValue(TAG as never);
      db.tag.update.mockResolvedValue(TAG as never);
    },
    act: (caller) => caller.tag.update({ id: TAG.id, description: "Needs attention today" }),
    write: (db) => db.tag.update,
  });
});

describe("tag.setTicketTags role gate (mocked)", () => {
  roleGateCases({
    arrange: (db) => {
      db.ticket.findUnique.mockResolvedValue({ id: "ticket-1", product: { workspaceId } } as never);
      db.tag.findMany.mockResolvedValue([{ id: TAG.id }] as never);
      db.ticketTag.deleteMany.mockResolvedValue({ count: 0 } as never);
      db.ticketTag.createMany.mockResolvedValue({ count: 1 } as never);
    },
    act: (caller) => caller.tag.setTicketTags({ ticketId: "ticket-1", tagIds: [TAG.id] }),
    write: (db) => db.ticketTag.createMany,
  });
});

describe("tag.setFeatureTags role gate (mocked)", () => {
  roleGateCases({
    arrange: (db) => {
      db.feature.findUnique.mockResolvedValue({ id: "feature-1", product: { workspaceId } } as never);
      db.tag.findMany.mockResolvedValue([{ id: TAG.id }] as never);
      db.featureTag.deleteMany.mockResolvedValue({ count: 0 } as never);
      db.featureTag.createMany.mockResolvedValue({ count: 1 } as never);
    },
    act: (caller) => caller.tag.setFeatureTags({ featureId: "feature-1", tagIds: [TAG.id] }),
    write: (db) => db.featureTag.createMany,
  });
});

describe.each([
  {
    entityType: "ticket" as const,
    arrange: (db: DeepMockProxy<PrismaClient>) =>
      db.ticket.findUnique.mockResolvedValue({ product: { workspaceId }, tags: [] } as never),
    write: (db: DeepMockProxy<PrismaClient>) => db.ticketTag.createMany,
  },
  {
    entityType: "feature" as const,
    arrange: (db: DeepMockProxy<PrismaClient>) =>
      db.feature.findUnique.mockResolvedValue({ product: { workspaceId }, tags: [] } as never),
    write: (db: DeepMockProxy<PrismaClient>) => db.featureTag.createMany,
  },
  {
    entityType: "epic" as const,
    arrange: (db: DeepMockProxy<PrismaClient>) =>
      db.epic.findUnique.mockResolvedValue({ workspaceId, tags: [] } as never),
    write: (db: DeepMockProxy<PrismaClient>) => db.epicTag.createMany,
  },
])("tag.setEntityTags on a $entityType role gate (mocked)", ({ entityType, arrange, write }) => {
  roleGateCases({
    arrange: (db) => {
      arrange(db);
      db.tag.findMany.mockResolvedValue([{ id: TAG.id }] as never);
      db.ticketTag.findMany.mockResolvedValue([] as never);
      db.featureTag.findMany.mockResolvedValue([] as never);
      db.epicTag.findMany.mockResolvedValue([] as never);
    },
    act: (caller) => caller.tag.setEntityTags({ entityType, entityId: `${entityType}-1`, tagIds: [TAG.id] }),
    write,
  });

  it("still lets a viewer read the tags", async () => {
    const dbMock = getDbMock();
    mockReset(dbMock);
    stubRole(dbMock, "viewer");
    arrange(dbMock);
    dbMock.ticketTag.findMany.mockResolvedValue([] as never);
    dbMock.featureTag.findMany.mockResolvedValue([] as never);
    dbMock.epicTag.findMany.mockResolvedValue([] as never);

    const caller = createMockCaller({ userId: callerId, db: dbMock });

    await expect(caller.tag.listForEntity({ entityType, entityId: `${entityType}-1` })).resolves.toEqual([]);
  });
});
