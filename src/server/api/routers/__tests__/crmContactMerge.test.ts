/**
 * Unit tests for `crmContact.getMergePreview` and `crmContact.merge`.
 *
 * Focused on the parts the pure rules in `~/lib/crm/contactMerge` cannot
 * cover: access gating, cross-workspace id rejection, the order of writes in
 * the transaction (reparent → delete duplicates → update kept contact), the
 * list-membership and image dedupe, and the consent/recency auto-rules. Uses
 * `mockDeep<PrismaClient>()` so no real DB is ever touched — see CLAUDE.md
 * "Test database safety".
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
import { encryptString, decryptBufferSafe } from "~/server/utils/encryption";
import { emailHashFor } from "~/server/services/crm/createCrmContact";

const callerId = "user-1";
const workspaceId = "ws-1";

function row(overrides: Record<string, unknown> & { id: string }) {
  return {
    workspaceId,
    firstName: null,
    lastName: null,
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
    aiSourcedFields: [],
    lastInteractionAt: null,
    lastInteractionType: null,
    emailOptedOutAt: null,
    organizationId: null,
    createdById: callerId,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date(),
    connectionScore: 0,
    emailHash: null,
    importSource: null,
    googleContactId: null,
    lastSyncedAt: null,
    metadata: null,
    firstSeenAt: null,
    organization: null,
    screenshots: [],
    _count: {
      interactions: 0,
      communications: 0,
      deals: 0,
      transcriptionParticipations: 0,
      screenshots: 0,
      enrichments: 0,
    },
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const count = (n: number) => ({ count: n }) as any;

describe("crmContact merge (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    dbMock.workspaceUser.findFirst.mockResolvedValue({
      userId: callerId,
      workspaceId,
      role: "member",
      joinedAt: new Date(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    // $transaction(fn) runs the callback against the same mock.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbMock.$transaction.mockImplementation(async (fn: any) => fn(dbMock));
  });

  describe("getMergePreview", () => {
    it("decrypts PII, counts relations and suggests the richest contact", async () => {
      dbMock.crmContact.findMany.mockResolvedValue([
        row({ id: "thin", firstName: "Ada" }),
        row({
          id: "rich",
          firstName: "Ada",
          lastName: "Lovelace",
          email: encryptString("ada@example.com"),
          organizationId: "org-1",
          organization: { id: "org-1", name: "Analytical Engines" },
          _count: {
            interactions: 3,
            communications: 0,
            deals: 1,
            transcriptionParticipations: 2,
            screenshots: 0,
            enrichments: 0,
          },
        }),
      ]);
      dbMock.collectionMember.groupBy.mockResolvedValue([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { memberId: "rich", _count: { _all: 2 } } as any,
      ]);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      const result = await caller.crmContact.getMergePreview({
        workspaceId,
        ids: ["thin", "rich"],
      });

      expect(result.suggestedPrimaryId).toBe("rich");
      const rich = result.candidates.find((c) => c.id === "rich")!;
      expect(rich.email).toBe("ada@example.com");
      expect(rich.organizationName).toBe("Analytical Engines");
      expect(rich.counts).toMatchObject({
        interactions: 3,
        deals: 1,
        meetings: 2,
        listMemberships: 2,
      });
      // The query is scoped to the workspace, never by id alone.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where = (dbMock.crmContact.findMany.mock.calls[0]?.[0] as any).where;
      expect(where.workspaceId).toBe(workspaceId);
    });

    it("refuses when an id is missing or belongs to another workspace", async () => {
      dbMock.crmContact.findMany.mockResolvedValue([row({ id: "a" })]);
      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await expect(
        caller.crmContact.getMergePreview({ workspaceId, ids: ["a", "elsewhere"] }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("refuses viewers", async () => {
      dbMock.workspaceUser.findFirst.mockResolvedValue({
        userId: callerId,
        workspaceId,
        role: "viewer",
        joinedAt: new Date(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await expect(
        caller.crmContact.getMergePreview({ workspaceId, ids: ["a", "b"] }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(dbMock.crmContact.findMany).not.toHaveBeenCalled();
    });
  });

  describe("merge", () => {
    function primeChildren() {
      dbMock.crmContactInteraction.updateMany.mockResolvedValue(count(4));
      dbMock.crmCommunication.updateMany.mockResolvedValue(count(0));
      dbMock.deal.updateMany.mockResolvedValue(count(1));
      dbMock.transcriptionSessionParticipant.updateMany.mockResolvedValue(count(2));
      dbMock.crmContactEnrichment.updateMany.mockResolvedValue(count(0));
      dbMock.crmContactScreenshot.findMany.mockResolvedValue([]);
      dbMock.collectionMember.findMany.mockResolvedValue([]);
      dbMock.crmContact.deleteMany.mockResolvedValue(count(1));
    }

    it("reparents, deletes duplicates first, then writes the merged fields", async () => {
      const primary = row({
        id: "p",
        firstName: "Ada",
        phone: encryptString("+1"),
        lastInteractionAt: new Date("2024-03-01T00:00:00Z"),
        lastInteractionType: "EMAIL",
        connectionScore: 40,
        skills: ["math"],
        tags: ["vip"],
      });
      const dup = row({
        id: "d",
        lastName: "Lovelace",
        email: encryptString("ada@example.com"),
        emailHash: emailHashFor("ada@example.com"),
        lastInteractionAt: new Date("2024-06-01T00:00:00Z"),
        lastInteractionType: "MEETING",
        connectionScore: 75,
        emailOptedOutAt: new Date("2024-05-01T00:00:00Z"),
        firstSeenAt: new Date("2020-01-01T00:00:00Z"),
        skills: ["poetry"],
        tags: ["vip", "london"],
        twitter: encryptString("@ai_guess"),
        aiSourcedFields: ["twitter"],
      });
      dbMock.crmContact.findMany.mockResolvedValue([primary, dup]);
      primeChildren();
      dbMock.crmContact.update.mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => ({ ...primary, ...args.data, organization: null }) as any,
      );

      const order: string[] = [];
      dbMock.crmContactInteraction.updateMany.mockImplementation(async () => {
        order.push("reparent");
        return count(4);
      });
      dbMock.crmContact.deleteMany.mockImplementation(async () => {
        order.push("delete");
        return count(1);
      });
      dbMock.crmContact.update.mockImplementation(async (args) => {
        order.push("update");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return { ...primary, ...(args.data as any), organization: null } as any;
      });

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      const result = await caller.crmContact.merge({
        workspaceId,
        primaryId: "p",
        duplicateIds: ["d"],
      });

      expect(order).toEqual(["reparent", "delete", "update"]);
      expect(result.deletedCount).toBe(1);
      expect(result.moved).toMatchObject({ interactions: 4, deals: 1, meetings: 2 });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (dbMock.crmContact.update.mock.calls[0]?.[0] as any).data;
      expect(data.firstName).toBe("Ada");
      expect(data.lastName).toBe("Lovelace");
      expect(decryptBufferSafe(data.email)).toBe("ada@example.com");
      expect(data.emailHash).toBe(emailHashFor("ada@example.com"));
      expect(decryptBufferSafe(data.phone)).toBe("+1");
      expect(data.skills).toEqual(["math", "poetry"]);
      expect(data.tags).toEqual(["vip", "london"]);
      // Auto rules: latest interaction, highest score, earliest first-seen,
      // consent preserved, AI provenance carried for the AI-sourced value.
      expect(data.lastInteractionAt).toEqual(new Date("2024-06-01T00:00:00Z"));
      expect(data.lastInteractionType).toBe("MEETING");
      expect(data.connectionScore).toBe(75);
      expect(data.firstSeenAt).toEqual(new Date("2020-01-01T00:00:00Z"));
      expect(data.emailOptedOutAt).toEqual(new Date("2024-05-01T00:00:00Z"));
      expect(data.aiSourcedFields).toEqual(["twitter"]);

      // Duplicates are deleted only inside the workspace.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const del = (dbMock.crmContact.deleteMany.mock.calls[0]?.[0] as any).where;
      expect(del).toEqual({ id: { in: ["d"] }, workspaceId });

      // The response is decrypted for the client.
      expect(result.contact.email).toBe("ada@example.com");
    });

    it("applies the user's choices and clears", async () => {
      const primary = row({ id: "p", firstName: "Ada", phone: encryptString("+1") });
      const dup = row({ id: "d", firstName: "Augusta", phone: encryptString("+2") });
      dbMock.crmContact.findMany.mockResolvedValue([primary, dup]);
      primeChildren();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dbMock.crmContact.update.mockImplementation(async (args: any) => ({ ...primary, ...args.data, organization: null }) as any);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await caller.crmContact.merge({
        workspaceId,
        primaryId: "p",
        duplicateIds: ["d"],
        choices: { firstName: "d", phone: null },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (dbMock.crmContact.update.mock.calls[0]?.[0] as any).data;
      expect(data.firstName).toBe("Augusta");
      expect(data.phone).toBeNull();
    });

    it("rejects a choice from a contact outside the merge without writing", async () => {
      dbMock.crmContact.findMany.mockResolvedValue([
        row({ id: "p", firstName: "Ada" }),
        row({ id: "d", firstName: "Augusta" }),
      ]);
      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await expect(
        caller.crmContact.merge({
          workspaceId,
          primaryId: "p",
          duplicateIds: ["d"],
          choices: { firstName: "stranger" },
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(dbMock.$transaction).not.toHaveBeenCalled();
    });

    it("moves list memberships and images the kept contact lacks, drops the rest", async () => {
      const primary = row({ id: "p", firstName: "Ada" });
      const dup = row({ id: "d", firstName: "Ada" });
      dbMock.crmContact.findMany.mockResolvedValue([primary, dup]);
      primeChildren();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dbMock.crmContact.update.mockResolvedValue({ ...primary, organization: null } as any);

      // Images: primary already has shot-1; dup has shot-1 and shot-2.
      dbMock.crmContactScreenshot.findMany
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockResolvedValueOnce([{ screenshotId: "shot-1" }] as any)
        .mockResolvedValueOnce([
          { id: "link-1", screenshotId: "shot-1" },
          { id: "link-2", screenshotId: "shot-2" },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ] as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dbMock.crmContactScreenshot.update.mockResolvedValue({} as any);

      // Lists: dup is on list-A and list-B; primary already on list-A.
      dbMock.collectionMember.findMany
        .mockResolvedValueOnce([
          { id: "m-a", collectionId: "list-A" },
          { id: "m-b", collectionId: "list-B" },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ] as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockResolvedValueOnce([{ collectionId: "list-A" }] as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dbMock.collectionMember.delete.mockResolvedValue({} as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dbMock.collectionMember.update.mockResolvedValue({} as any);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      const result = await caller.crmContact.merge({
        workspaceId,
        primaryId: "p",
        duplicateIds: ["d"],
      });

      expect(dbMock.crmContactScreenshot.update).toHaveBeenCalledTimes(1);
      expect(dbMock.crmContactScreenshot.update).toHaveBeenCalledWith({
        where: { id: "link-2" },
        data: { contactId: "p" },
      });
      expect(dbMock.collectionMember.delete).toHaveBeenCalledWith({ where: { id: "m-a" } });
      expect(dbMock.collectionMember.update).toHaveBeenCalledWith({
        where: { id: "m-b" },
        data: { memberId: "p" },
      });
      expect(result.moved).toMatchObject({ screenshots: 1, listMemberships: 1 });
    });

    it("refuses when a duplicate is not in the workspace", async () => {
      dbMock.crmContact.findMany.mockResolvedValue([row({ id: "p" })]);
      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await expect(
        caller.crmContact.merge({ workspaceId, primaryId: "p", duplicateIds: ["foreign"] }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(dbMock.$transaction).not.toHaveBeenCalled();
    });

    it("refuses a merge of a contact with only itself", async () => {
      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await expect(
        caller.crmContact.merge({ workspaceId, primaryId: "p", duplicateIds: ["p"] }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
  });
});
