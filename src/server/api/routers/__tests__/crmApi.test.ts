/**
 * Unit tests for the public CRM API router (`crmApi.*`).
 *
 * Focused on the dedup behaviour added to `contactCreate` (return existing row
 * on emailHash hit, set `wasExisting`, guard cross-tenant collisions) and the
 * email-filter parameter on `contactList`. Uses `mockDeep<PrismaClient>()` so
 * no real DB is ever touched — see CLAUDE.md "Test database safety".
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import { Prisma } from "@prisma/client";
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

// Pipeline-level access (getProjectAccess) needs a project graph the mock DB
// doesn't model; tests flip this to cover the allowed and denied paths.
const projectAccess = vi.hoisted(() => ({ allowed: true }));
vi.mock("~/server/services/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/server/services/access")>();
  return {
    ...actual,
    getProjectAccess: vi.fn(async () => null),
    hasProjectAccess: vi.fn(() => projectAccess.allowed),
  };
});

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
      // Dedupe lookup uses the (workspaceId, emailHash) composite key and
      // returns the full row directly (no second findUniqueOrThrow round-trip).
      dbMock.crmContact.findUnique.mockResolvedValue(
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
      // The lookup was scoped to (workspaceId, emailHash) — not global emailHash.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const findArgs = dbMock.crmContact.findUnique.mock.calls[0]?.[0] as any;
      expect(findArgs.where.workspaceId_emailHash).toEqual({
        workspaceId,
        emailHash: hash,
      });
    });

    it("creates a fresh row when the email exists only in another workspace (workspace-scoped uniqueness)", async () => {
      // The dedupe lookup is scoped to THIS workspace, so a contact owned by
      // another workspace doesn't surface and we proceed to create. The
      // database-level unique is also workspace-scoped, so the insert
      // succeeds rather than throwing P2002.
      dbMock.crmContact.findUnique.mockResolvedValue(null);
      dbMock.crmContact.create.mockResolvedValue(
        buildContactRow({
          id: "c-new",
          emailHash: emailHashFor("ada@example.com"),
        }),
      );

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      const result = await caller.crmApi.contactCreate({
        workspaceId,
        email: "ada@example.com",
      });

      expect(result.wasExisting).toBe(false);
      expect(result.id).toBe("c-new");
      expect(dbMock.crmContact.create).toHaveBeenCalledTimes(1);
    });

    it("handles a P2002 race by re-fetching the winner and returning wasExisting=true", async () => {
      const hash = emailHashFor("ada@example.com");
      // Dedupe lookup misses — a concurrent request hasn't landed its row yet.
      dbMock.crmContact.findUnique.mockResolvedValue(null);
      // Between the lookup and the insert, the racing request landed first.
      // Our create now violates the (workspaceId, emailHash) unique constraint.
      const p2002 = new Prisma.PrismaClientKnownRequestError(
        "Unique constraint failed",
        {
          code: "P2002",
          clientVersion: "test",
          meta: { target: ["workspaceId", "emailHash"] },
        },
      );
      dbMock.crmContact.create.mockRejectedValue(p2002);
      // Re-fetch returns the winner — the caller should see this as a dedup hit.
      dbMock.crmContact.findUniqueOrThrow.mockResolvedValue(
        buildContactRow({ id: "c-winner", emailHash: hash }),
      );

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      const result = await caller.crmApi.contactCreate({
        workspaceId,
        email: "ada@example.com",
      });

      expect(result.wasExisting).toBe(true);
      expect(result.id).toBe("c-winner");
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

  // ────────────────────────────────────────────────────────────────────
  // pipelineGet — default-pipeline fallback
  // ────────────────────────────────────────────────────────────────────
  describe("pipelineGet", () => {
    it("skips cancelled/completed pipelines when no pipelineId is given", async () => {
      dbMock.project.findFirst.mockResolvedValue(null);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await caller.crmApi.pipelineGet({ workspaceId });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const args = dbMock.project.findFirst.mock.calls[0]?.[0] as any;
      expect(args.where.type).toBe("pipeline");
      expect(args.where.status).toEqual({ notIn: ["CANCELLED", "COMPLETED"] });
      expect(args.orderBy).toEqual({ createdAt: "asc" });
    });

    it("does not filter by status when a pipelineId is given", async () => {
      dbMock.project.findFirst.mockResolvedValue(null);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await caller.crmApi.pipelineGet({ workspaceId, pipelineId: "p-2" });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const args = dbMock.project.findFirst.mock.calls[0]?.[0] as any;
      expect(args.where.id).toBe("p-2");
      expect(args.where.status).toBeUndefined();
    });
  });
  // ────────────────────────────────────────────────────────────────────
  // pipelineCreate / dealMove across pipelines (ADR-0033)
  // ────────────────────────────────────────────────────────────────────
  describe("pipelineCreate", () => {
    it("creates a pipeline with the default stages and a unique slug", async () => {
      dbMock.project.findFirst
        .mockResolvedValueOnce({ id: "taken" } as never) // "hiring" is taken
        .mockResolvedValueOnce(null);
      dbMock.project.create.mockResolvedValue({ id: "p-new" } as never);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await caller.crmApi.pipelineCreate({ workspaceId, name: " Hiring " });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const args = dbMock.project.create.mock.calls[0]?.[0] as any;
      expect(args.data).toMatchObject({
        name: "Hiring",
        slug: "hiring_1",
        type: "pipeline",
        status: "ACTIVE",
        workspaceId,
        createdById: callerId,
      });
      expect(
        args.data.pipelineStages.create.map((st: { name: string }) => st.name),
      ).toEqual(["Lead", "Qualified", "Proposal", "Negotiation", "Won", "Lost"]);
    });

    it("refuses a caller outside the workspace", async () => {
      dbMock.workspaceUser.findFirst.mockResolvedValue(null);
      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await expect(
        caller.crmApi.pipelineCreate({ workspaceId, name: "Hiring" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(dbMock.project.create).not.toHaveBeenCalled();
    });
  });

  describe("dealCreate", () => {
    beforeEach(() => {
      projectAccess.allowed = true;
      dbMock.project.findFirst.mockResolvedValue({ id: "p-sales" } as never);
    });

    it("rejects a stage that is not on the target pipeline", async () => {
      dbMock.pipelineStage.findUnique.mockResolvedValue({ id: "s-hire", projectId: "p-hiring" } as never);
      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await expect(
        caller.crmApi.dealCreate({ workspaceId, stageId: "s-hire", title: "Acme" }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(dbMock.deal.create).not.toHaveBeenCalled();
    });

    it("creates the deal when the stage is on the pipeline", async () => {
      dbMock.pipelineStage.findUnique.mockResolvedValue({ id: "s-lead", projectId: "p-sales" } as never);
      dbMock.deal.findFirst.mockResolvedValue(null);
      dbMock.deal.create.mockResolvedValue({
        id: "d-1",
        title: "Acme",
        stageId: "s-lead",
        stage: { name: "Lead" },
      } as never);
      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await caller.crmApi.dealCreate({ workspaceId, stageId: "s-lead", title: "Acme" });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (dbMock.deal.create.mock.calls[0]?.[0] as any).data;
      expect(data).toMatchObject({ projectId: "p-sales", stageId: "s-lead" });
    });
  });

  describe("dealMove", () => {
    const deal = {
      id: "d-1",
      workspaceId,
      projectId: "p-sales",
      stageId: "s-lead",
      closedAt: null,
      stage: { id: "s-lead", name: "Lead", type: "active" },
    };
    const stage = (id: string, projectId: string) =>
      ({ id, projectId, name: id, type: "active" }) as never;

    beforeEach(() => {
      projectAccess.allowed = true;
      dbMock.deal.findUnique.mockResolvedValue(deal as never);
      dbMock.deal.update.mockResolvedValue({ ...deal, id: "d-1" } as never);
    });

    it("moves within the deal's pipeline without changing projectId", async () => {
      dbMock.pipelineStage.findUnique.mockResolvedValue(stage("s-won", "p-sales"));
      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await caller.crmApi.dealMove({ id: "d-1", stageId: "s-won", stageOrder: 0 });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (dbMock.deal.update.mock.calls[0]?.[0] as any).data;
      expect(data.stageId).toBe("s-won");
      expect(data.projectId).toBeUndefined();
    });

    it("rejects a stage from another pipeline when no pipelineId is given", async () => {
      dbMock.pipelineStage.findUnique.mockResolvedValue(stage("s-hire", "p-hiring"));
      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await expect(
        caller.crmApi.dealMove({ id: "d-1", stageId: "s-hire", stageOrder: 0 }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(dbMock.deal.update).not.toHaveBeenCalled();
    });

    it("moves to another pipeline and updates projectId when pipelineId is given", async () => {
      dbMock.project.findFirst.mockResolvedValue({ id: "p-hiring" } as never);
      dbMock.pipelineStage.findUnique.mockResolvedValue(stage("s-hire", "p-hiring"));
      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await caller.crmApi.dealMove({
        id: "d-1",
        stageId: "s-hire",
        stageOrder: 0,
        pipelineId: "p-hiring",
      });

      // The target pipeline is looked up inside the deal's own workspace.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where = (dbMock.project.findFirst.mock.calls[0]?.[0] as any).where;
      expect(where).toMatchObject({ workspaceId, type: "pipeline", id: "p-hiring" });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (dbMock.deal.update.mock.calls[0]?.[0] as any).data;
      expect(data).toMatchObject({ projectId: "p-hiring", stageId: "s-hire" });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const activity = (dbMock.dealActivity.create.mock.calls[0]?.[0] as any).data;
      expect(activity.metadata).toMatchObject({
        fromPipelineId: "p-sales",
        toPipelineId: "p-hiring",
      });
    });

    it("rejects a stage that is on neither pipeline", async () => {
      dbMock.project.findFirst.mockResolvedValue({ id: "p-hiring" } as never);
      dbMock.pipelineStage.findUnique.mockResolvedValue(stage("s-other", "p-grants"));
      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await expect(
        caller.crmApi.dealMove({
          id: "d-1",
          stageId: "s-other",
          stageOrder: 0,
          pipelineId: "p-hiring",
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(dbMock.deal.update).not.toHaveBeenCalled();
    });

    it("rejects a target pipeline the caller cannot access", async () => {
      projectAccess.allowed = false;
      dbMock.project.findFirst.mockResolvedValue({ id: "p-hiring" } as never);
      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await expect(
        caller.crmApi.dealMove({
          id: "d-1",
          stageId: "s-hire",
          stageOrder: 0,
          pipelineId: "p-hiring",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(dbMock.deal.update).not.toHaveBeenCalled();
    });

    it("rejects a target pipeline outside the deal's workspace", async () => {
      dbMock.project.findFirst.mockResolvedValue(null);
      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await expect(
        caller.crmApi.dealMove({
          id: "d-1",
          stageId: "s-x",
          stageOrder: 0,
          pipelineId: "p-elsewhere",
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(dbMock.deal.update).not.toHaveBeenCalled();
    });
  });
});
