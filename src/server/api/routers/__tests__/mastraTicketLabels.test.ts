/**
 * Unit tests for the agent ticket-label wiring on the mastra router
 * (cold.nebula): `createTicket` takes `labels`, `updateTicket` edits fields
 * and labels by id or product + number, and `listLabels` lists what an agent
 * may apply. The label resolve/merge rules live in `ticketLabels.ts` and are
 * tested there; here they are mocked so these cover access gating and wiring.
 *
 * Mocked Prisma via `createMockCaller`; harness mirrors `mastraMintAgentToken.test.ts`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";

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

vi.mock("~/plugins/product/server/routers/product", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/plugins/product/server/routers/product")>()),
  loadProductWithAccess: vi.fn(),
  assertWorkspaceAccess: vi.fn(),
}));

vi.mock("~/plugins/product/server/services/createTicket", () => ({
  createTicketWithNumber: vi.fn(),
}));

vi.mock("~/server/services/tags/ticketLabels", () => ({
  applyTicketLabels: vi.fn(),
}));

import {
  assertWorkspaceAccess,
  loadProductWithAccess,
} from "~/plugins/product/server/routers/product";
import { ticketRouter } from "~/plugins/product/server/routers/ticket";
import { createTicketWithNumber } from "~/plugins/product/server/services/createTicket";
import { applyTicketLabels } from "~/server/services/tags/ticketLabels";
import { createMockCaller } from "~/test/trpc-helpers";

const USER_ID = "user-1";
const WS = "ws-1";
const PRODUCT = { id: "prod-1", workspaceId: WS, slug: "exp" };
const LABEL = { id: "tag-bug", name: "Bug", slug: "bug" };

const loadProductMock = vi.mocked(loadProductWithAccess);
const assertWorkspaceMock = vi.mocked(assertWorkspaceAccess);
const createTicketMock = vi.mocked(createTicketWithNumber);
const applyLabelsMock = vi.mocked(applyTicketLabels);

describe("mastra ticket labels (cold.nebula)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;
  const ticketUpdate = vi.fn();

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    vi.clearAllMocks();
    loadProductMock.mockResolvedValue(PRODUCT);
    applyLabelsMock.mockResolvedValue({ labels: [LABEL], warnings: [] });
    vi.spyOn(ticketRouter, "createCaller").mockReturnValue({
      update: ticketUpdate,
    } as unknown as ReturnType<typeof ticketRouter.createCaller>);
  });

  describe("createTicket", () => {
    beforeEach(() => {
      createTicketMock.mockResolvedValue({
        id: "tk-1",
        number: 7,
        shortId: "cold.nebula",
        title: "T",
        type: "BUG",
        status: "BACKLOG",
        priority: null,
        productId: PRODUCT.id,
      } as never);
    });

    it("attaches labels after creating the ticket and returns them", async () => {
      const caller = createMockCaller({ userId: USER_ID, db: dbMock });

      const result = await caller.mastra.createTicket({
        productId: PRODUCT.id,
        title: "T",
        labels: ["bug"],
      });

      expect(loadProductMock).toHaveBeenCalledWith(expect.anything(), USER_ID, PRODUCT.id, "edit");
      expect(applyLabelsMock).toHaveBeenCalledWith(expect.anything(), {
        userId: USER_ID,
        ticketId: "tk-1",
        workspaceId: WS,
        change: { add: ["bug"] },
      });
      expect(result.labels).toEqual([LABEL]);
      expect(result.warnings).toEqual([]);
    });

    it("skips the label write when no labels are passed", async () => {
      const caller = createMockCaller({ userId: USER_ID, db: dbMock });

      const result = await caller.mastra.createTicket({ productId: PRODUCT.id, title: "T" });

      expect(applyLabelsMock).not.toHaveBeenCalled();
      expect(result.labels).toEqual([]);
    });
  });

  describe("updateTicket", () => {
    const stored = {
      id: "tk-1",
      number: 7,
      shortId: "cold.nebula",
      title: "T",
      type: "BUG",
      status: "QA",
      priority: 2,
      points: null,
      assigneeId: null,
      productId: PRODUCT.id,
    };

    it("rejects a call with no ticket reference", async () => {
      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(
        caller.mastra.updateTicket({ productId: PRODUCT.id, addLabels: ["bug"] }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("finds the ticket by product + number and edits labels only, gated on edit access", async () => {
      dbMock.ticket.findFirst.mockResolvedValue({ id: "tk-1", productId: PRODUCT.id } as never);
      dbMock.ticket.findUnique.mockResolvedValue(stored as never);
      const caller = createMockCaller({ userId: USER_ID, db: dbMock });

      const result = await caller.mastra.updateTicket({
        productId: PRODUCT.id,
        ticketNumber: 7,
        addLabels: ["bug"],
        removeLabels: ["wontfix"],
      });

      expect(dbMock.ticket.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { productId: PRODUCT.id, number: 7 } }),
      );
      expect(loadProductMock).toHaveBeenCalledWith(expect.anything(), USER_ID, PRODUCT.id, "edit");
      expect(ticketUpdate).not.toHaveBeenCalled();
      expect(applyLabelsMock).toHaveBeenCalledWith(expect.anything(), {
        userId: USER_ID,
        ticketId: "tk-1",
        workspaceId: WS,
        change: { set: undefined, add: ["bug"], remove: ["wontfix"] },
      });
      expect(result).toEqual({ ticket: stored, labels: [LABEL], warnings: [] });
    });

    it("routes field edits through ticket.update", async () => {
      dbMock.ticket.findUnique
        .mockResolvedValueOnce({ id: "tk-1", productId: PRODUCT.id } as never)
        .mockResolvedValueOnce(stored as never);
      const caller = createMockCaller({ userId: USER_ID, db: dbMock });

      await caller.mastra.updateTicket({ ticketId: "tk-1", status: "QA", priority: 2, labels: ["bug"] });

      expect(ticketUpdate).toHaveBeenCalledWith({ id: "tk-1", status: "QA", priority: 2 });
      expect(applyLabelsMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ change: { set: ["bug"], add: undefined, remove: undefined } }),
      );
    });

    it("writes nothing when the caller can see the product but lacks edit access", async () => {
      dbMock.ticket.findUnique.mockResolvedValue({ id: "tk-1", productId: PRODUCT.id } as never);
      // Can see (view passes), can't edit: a plain FORBIDDEN is fine, it reveals nothing new.
      loadProductMock.mockImplementation((async (_db: unknown, _u: string, _p: string, level: string) => {
        if (level === "edit") throw new TRPCError({ code: "FORBIDDEN" });
        return PRODUCT;
      }) as never);
      const caller = createMockCaller({ userId: USER_ID, db: dbMock });

      await expect(
        caller.mastra.updateTicket({ ticketId: "tk-1", title: "x", addLabels: ["bug"] }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(ticketUpdate).not.toHaveBeenCalled();
      expect(applyLabelsMock).not.toHaveBeenCalled();
    });

    it("rejects an empty ticketId instead of updating an arbitrary ticket", async () => {
      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      for (const ticketId of ["", "   "]) {
        await expect(
          caller.mastra.updateTicket({ ticketId, addLabels: ["bug"] }),
        ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      }
      expect(dbMock.ticket.findFirst).not.toHaveBeenCalled();
      expect(dbMock.ticket.findUnique).not.toHaveBeenCalled();
      expect(applyLabelsMock).not.toHaveBeenCalled();
    });

    it("answers NOT_FOUND, not FORBIDDEN, for a ticket in a product the caller can't see", async () => {
      // A ticket that exists where the caller has no access looks exactly
      // like one that doesn't exist, so ids can't be probed.
      loadProductMock.mockRejectedValue(new TRPCError({ code: "FORBIDDEN" }));
      dbMock.ticket.findUnique.mockResolvedValue({ id: "tk-1", productId: PRODUCT.id } as never);
      const caller = createMockCaller({ userId: USER_ID, db: dbMock });

      await expect(
        caller.mastra.updateTicket({ ticketId: "tk-1", title: "x" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND", message: "Ticket not found" });

      // By product + number, the product is checked before any ticket lookup.
      await expect(
        caller.mastra.updateTicket({ productId: PRODUCT.id, ticketNumber: 7, title: "x" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND", message: "Ticket not found" });
      expect(dbMock.ticket.findFirst).not.toHaveBeenCalled();
      expect(ticketUpdate).not.toHaveBeenCalled();
      expect(applyLabelsMock).not.toHaveBeenCalled();
    });

    it("returns NOT_FOUND for an unknown ticket", async () => {
      dbMock.ticket.findUnique.mockResolvedValue(null);
      const caller = createMockCaller({ userId: USER_ID, db: dbMock });

      await expect(
        caller.mastra.updateTicket({ ticketId: "missing", addLabels: ["bug"] }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("listLabels", () => {
    it("lists global and workspace tags for a product's workspace", async () => {
      dbMock.tag.findMany.mockResolvedValue([
        { id: "t1", name: "DevOps", slug: "devops", description: null, category: null, workspaceId: WS },
        { id: "t2", name: "Bug", slug: "bug", description: "Defect", category: "label", workspaceId: null },
      ] as never);
      const caller = createMockCaller({ userId: USER_ID, db: dbMock });

      const result = await caller.mastra.listLabels({ productId: PRODUCT.id });

      expect(loadProductMock).toHaveBeenCalledWith(expect.anything(), USER_ID, PRODUCT.id, "view");
      expect(dbMock.tag.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { OR: [{ workspaceId: WS }, { workspaceId: null }] } }),
      );
      expect(result.labels.map((l) => [l.slug, l.scope])).toEqual([
        ["devops", "workspace"],
        ["bug", "global"],
      ]);
    });

    it("checks membership when given a workspaceId", async () => {
      dbMock.tag.findMany.mockResolvedValue([]);
      const caller = createMockCaller({ userId: USER_ID, db: dbMock });

      await caller.mastra.listLabels({ workspaceId: WS });

      expect(assertWorkspaceMock).toHaveBeenCalledWith(expect.anything(), USER_ID, WS, "view");
    });

    it("rejects a blank productId or workspaceId before any access check or tag read", async () => {
      // A blank productId used to fall through to the workspace branch with no
      // workspaceId, which could match every workspace's tags.
      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      for (const input of [{ productId: "" }, { productId: "  " }, { workspaceId: "" }, { productId: "", workspaceId: "" }]) {
        await expect(caller.mastra.listLabels(input)).rejects.toMatchObject({ code: "BAD_REQUEST" });
      }
      expect(loadProductMock).not.toHaveBeenCalled();
      expect(assertWorkspaceMock).not.toHaveBeenCalled();
      expect(dbMock.tag.findMany).not.toHaveBeenCalled();
    });
  });
});
