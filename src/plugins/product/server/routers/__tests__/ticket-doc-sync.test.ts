/**
 * Unit tests for `ticket.update`'s body/doc storage paths (ADR-0024, mirrors
 * feature-doc-sync.test.ts).
 *
 * A CLI/SDK caller sends `body` (Markdown) with no `bodyDoc`. The router must
 * re-derive the doc server-side and bump `docVersion` — otherwise the edit is
 * invisible in the rich editor (which renders the doc) and gets clobbered by
 * its next save. That holds even before the ticket was ever migrated: a tab
 * may already be holding the older `body` it is about to migrate.
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()`; mirrors the mock
 * layout from `ticket.test.ts`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import { Prisma, type PrismaClient } from "@prisma/client";

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
  sendFeatureMentionNotifications: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("~/lib/blob", () => ({
  uploadToBlob: vi.fn().mockResolvedValue({ url: "blob://test" }),
}));

// ── Imports of code under test (must come AFTER vi.mock calls) ───────
import { createMockCaller } from "~/test/trpc-helpers";

const callerId = "user-1";
const workspaceId = "ws-1";
const ticketId = "ticket-1";

/** The shape loadTicketWithAccess selects. */
function accessTicket(overrides: Record<string, unknown> = {}) {
  return {
    id: ticketId,
    productId: "prod-1",
    title: "A ticket",
    body: null,
    docVersion: 0,
    type: "FEATURE",
    status: "BACKLOG",
    priority: null,
    points: null,
    branchName: null,
    prUrl: null,
    designUrl: null,
    specUrl: null,
    links: null,
    epicId: null,
    featureId: null,
    cycleId: null,
    scopeId: null,
    assigneeId: null,
    product: { workspaceId },
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function stubTicketAccess(
  dbMock: DeepMockProxy<PrismaClient>,
  overrides: Record<string, unknown> = {},
) {
  dbMock.ticket.findUnique.mockResolvedValue(accessTicket(overrides));
  // assertWorkspaceMember's membership probe.
  dbMock.workspaceUser.findUnique.mockResolvedValue(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { role: "member", workspaceId } as any,
  );
}

function updateData(dbMock: DeepMockProxy<PrismaClient>) {
  return dbMock.ticket.update.mock.calls[0]?.[0]?.data as
    | Record<string, unknown>
    | undefined;
}

describe("ticket.update — Markdown-only body sync (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    stubTicketAccess(dbMock);
    dbMock.ticket.update.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: ticketId } as any,
    );
  });

  it("re-derives bodyDoc and bumps docVersion on a Markdown-only write", async () => {
    stubTicketAccess(dbMock, { body: "old" });
    const caller = createMockCaller({ userId: callerId, db: dbMock });
    const markdown = "# New body\n\n- [ ] a task";

    await caller.product.ticket.update({ id: ticketId, body: markdown });

    const data = updateData(dbMock);
    expect(data?.body).toBe(markdown);
    expect(data?.docVersion).toEqual({ increment: 1 });
    // Structural assertion (not a comparison against the codec itself, which
    // would be tautological): the Markdown became a real ProseMirror doc.
    const doc = data?.bodyDoc as {
      type: string;
      content: Array<{ type: string }>;
    };
    expect(doc.type).toBe("doc");
    expect(doc.content.map((n) => n.type)).toEqual(["heading", "taskList"]);
  });

  it("bumps docVersion even for a ticket never opened in the rich editor", async () => {
    // A tab holding the pre-write `body` would otherwise migrate it and save
    // from base 0 without a CONFLICT, silently undoing this write.
    stubTicketAccess(dbMock, { body: "old", docVersion: 0 });
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    await caller.product.ticket.update({ id: ticketId, body: "# New body" });

    const data = updateData(dbMock);
    expect(data?.body).toBe("# New body");
    expect(data?.bodyDoc).toMatchObject({ type: "doc" });
    expect(data?.docVersion).toEqual({ increment: 1 });
  });

  it("skips the doc rewrite when the incoming Markdown is unchanged", async () => {
    // An agent re-sending the stored body must not bump docVersion — that
    // would hand every open editor tab a spurious CONFLICT.
    const markdown = "# Same body";
    stubTicketAccess(dbMock, { body: markdown });
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    await caller.product.ticket.update({
      id: ticketId,
      body: markdown,
      priority: 1,
    });

    const data = updateData(dbMock);
    expect(data?.body).toBe(markdown);
    expect(data?.priority).toBe(1);
    expect(data).not.toHaveProperty("bodyDoc");
    expect(data).not.toHaveProperty("docVersion");
  });

  it("saves the editor's doc via compare-and-set and returns the version it produced", async () => {
    const doc = { type: "doc", content: [{ type: "paragraph" }] };
    // Call 1: loadTicketWithAccess (docVersion 3). Call 2: the post-CAS
    // re-read — which here already sees a concurrent write (v9) that landed
    // after the compare-and-set. The response must still report v4, or the
    // editor would adopt v9 as its base and silently overwrite that write.
    dbMock.ticket.findUnique
      .mockResolvedValueOnce(accessTicket({ docVersion: 3 }))
      .mockResolvedValueOnce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { id: ticketId, docVersion: 9, body: "Someone else's body" } as any,
      );
    dbMock.ticket.updateMany.mockResolvedValue({ count: 1 });
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    const result = await caller.product.ticket.update({
      id: ticketId,
      bodyDoc: doc,
      body: "New body",
      baseVersion: 3,
    });

    expect(dbMock.ticket.update).not.toHaveBeenCalled();
    const updateManyArgs = dbMock.ticket.updateMany.mock.calls[0]?.[0];
    expect(updateManyArgs?.where).toEqual({ id: ticketId, docVersion: 3 });
    expect(updateManyArgs?.data).toMatchObject({
      body: "New body",
      bodyDoc: doc,
      docVersion: { increment: 1 },
    });
    expect(result).toMatchObject({ id: ticketId, docVersion: 4 });
  });

  it("rejects a stale doc save with CONFLICT", async () => {
    dbMock.ticket.findUnique.mockResolvedValueOnce(
      accessTicket({ docVersion: 5 }),
    );
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    await expect(
      caller.product.ticket.update({
        id: ticketId,
        bodyDoc: { type: "doc", content: [] },
        body: "stale",
        baseVersion: 4,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(dbMock.ticket.updateMany).not.toHaveBeenCalled();
  });
});

describe("ticket.initBodyDoc — lazy migration (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    stubTicketAccess(dbMock);
  });

  it("writes only where bodyDoc is still null, in a single conditional write", async () => {
    // A save or Markdown write landing between a read and a write must win,
    // so there must be no read-then-write.
    dbMock.ticket.updateMany.mockResolvedValue({ count: 1 });
    const caller = createMockCaller({ userId: callerId, db: dbMock });
    const doc = { type: "doc", content: [{ type: "paragraph" }] };

    const result = await caller.product.ticket.initBodyDoc({ id: ticketId, doc });

    const args = dbMock.ticket.updateMany.mock.calls[0]?.[0];
    expect(args?.where).toMatchObject({ id: ticketId, bodyDoc: { equals: Prisma.DbNull } });
    expect(args?.data).toEqual({ bodyDoc: doc });
    expect(dbMock.ticket.update).not.toHaveBeenCalled();
    expect(result).toEqual({ migrated: true });
  });

  it("reports no migration when a doc already exists", async () => {
    dbMock.ticket.updateMany.mockResolvedValue({ count: 0 });
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    const result = await caller.product.ticket.initBodyDoc({
      id: ticketId,
      doc: { type: "doc", content: [] },
    });

    expect(result).toEqual({ migrated: false });
  });
});
