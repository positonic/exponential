/**
 * Unit tests for `feature.update`'s Markdown-only description path (ADR-0024).
 *
 * A CLI/SDK caller sends `description` (Markdown) with no `descriptionDoc`.
 * The router must re-derive the canonical doc server-side and bump
 * `docVersion` — otherwise the edit is invisible in the UI (which renders the
 * doc) and gets clobbered by the next editor save.
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
import type { JSONContent } from "@tiptap/core";
import { collectAnchoredThreadIds } from "~/lib/prd/thread-reconciliation";

const callerId = "user-1";
const workspaceId = "ws-1";
const featureId = "feat-1";

function stubFeatureAccess(dbMock: DeepMockProxy<PrismaClient>) {
  // loadFeatureWithAccess's lookup.
  dbMock.feature.findUnique.mockResolvedValue(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    {
      id: featureId,
      productId: "prod-1",
      product: { workspaceId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  );
  // assertWorkspaceAccess's membership probe.
  dbMock.workspaceUser.findUnique.mockResolvedValue(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { role: "member", workspaceId } as any,
  );
}

function updateData(dbMock: DeepMockProxy<PrismaClient>) {
  return dbMock.feature.update.mock.calls[0]?.[0]?.data as
    | Record<string, unknown>
    | undefined;
}

describe("feature.update — Markdown-only description sync (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    stubFeatureAccess(dbMock);
    dbMock.feature.update.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: featureId } as any,
    );
  });

  it("re-derives descriptionDoc and bumps docVersion on a Markdown-only write", async () => {
    const caller = createMockCaller({ userId: callerId, db: dbMock });
    const markdown = "# New body\n\n- [ ] a task";

    await caller.product.feature.update({
      id: featureId,
      description: markdown,
    });

    const data = updateData(dbMock);
    expect(data?.description).toBe(markdown);
    expect(data?.docVersion).toEqual({ increment: 1 });
    // Structural assertion (not a comparison against the codec itself, which
    // would be tautological): the Markdown became a real ProseMirror doc.
    const doc = data?.descriptionDoc as {
      type: string;
      content: Array<{ type: string }>;
    };
    expect(doc.type).toBe("doc");
    expect(doc.content.map((n) => n.type)).toEqual(["heading", "taskList"]);
  });

  it("carries comment marks across the rewrite wherever their text survived", async () => {
    const marked = (text: string, threadId: string) => ({
      type: "text",
      text,
      marks: [{ type: "comment", attrs: { threadId } }],
    });
    dbMock.feature.findUnique.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {
        id: featureId,
        productId: "prod-1",
        product: { workspaceId },
        description: "old",
        descriptionDoc: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "It can change the view (" },
                marked("Agent navigation", "kept"),
                { type: "text", text: ") but " },
                marked("a sentence the agent cut", "cut"),
                { type: "text", text: "." },
              ],
            },
          ],
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    );
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    await caller.product.feature.update({
      id: featureId,
      description: "A new intro.\n\nIt can change the view (Agent navigation, always undoable).",
    });

    expect(collectAnchoredThreadIds(updateData(dbMock)?.descriptionDoc as JSONContent)).toEqual(
      new Set(["kept"]),
    );
  });

  it("skips the doc rewrite when the incoming Markdown is unchanged", async () => {
    // An agent re-sending the stored description must not bump docVersion —
    // that would hand every open editor tab a spurious CONFLICT.
    const markdown = "# Same body";
    dbMock.feature.findUnique.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {
        id: featureId,
        productId: "prod-1",
        product: { workspaceId },
        description: markdown,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    );
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    await caller.product.feature.update({
      id: featureId,
      description: markdown,
      priority: 1,
    });

    const data = updateData(dbMock);
    expect(data?.description).toBe(markdown);
    expect(data?.priority).toBe(1);
    expect(data).not.toHaveProperty("descriptionDoc");
    expect(data).not.toHaveProperty("docVersion");
  });

  it("leaves the doc alone when description is not part of the update", async () => {
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    await caller.product.feature.update({
      id: featureId,
      name: "Renamed",
      priority: 2,
    });

    const data = updateData(dbMock);
    expect(data?.name).toBe("Renamed");
    expect(data).not.toHaveProperty("descriptionDoc");
    expect(data).not.toHaveProperty("docVersion");
  });

  it("does not interfere with the editor's own doc-save path", async () => {
    // The PRD editor sends descriptionDoc + baseVersion; that path does its
    // own compare-and-set via updateMany and must not hit the regeneration.
    const caller = createMockCaller({ userId: callerId, db: dbMock });
    const doc = { type: "doc", content: [{ type: "paragraph" }] };

    // Second findUnique in that path reads the stored docVersion.
    dbMock.feature.findUnique
      .mockResolvedValueOnce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { id: featureId, productId: "prod-1", product: { workspaceId } } as any,
      )
      .mockResolvedValueOnce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { docVersion: 0 } as any,
      );
    dbMock.feature.updateMany.mockResolvedValue({ count: 1 });

    const result = await caller.product.feature.update({
      id: featureId,
      descriptionDoc: doc,
      description: "New body",
      baseVersion: 0,
    });

    expect(dbMock.feature.update).not.toHaveBeenCalled();
    const updateManyArgs = dbMock.feature.updateMany.mock.calls[0]?.[0];
    expect(updateManyArgs?.where).toEqual({ id: featureId, docVersion: 0 });
    expect(updateManyArgs?.data).toMatchObject({
      description: "New body",
      descriptionDoc: doc,
      docVersion: { increment: 1 },
    });
    expect(result).toEqual({ id: featureId, docVersion: 1 });
  });
});

describe("feature.update — Markdown writes are conflict-checked when they carry baseVersion", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  function storedFeature(docVersion: number) {
    dbMock.feature.findUnique.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {
        id: featureId,
        productId: "prod-1",
        product: { workspaceId },
        description: "stored body",
        descriptionDoc: null,
        docVersion,
        status: "DEFINED",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    );
  }

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    stubFeatureAccess(dbMock);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbMock.feature.update.mockResolvedValue({ id: featureId } as any);
  });

  it("a matching base writes as a compare-and-set on docVersion", async () => {
    storedFeature(5);
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    await caller.product.feature.update({
      id: featureId,
      description: "agent edit",
      baseVersion: 5,
    });

    const args = dbMock.feature.update.mock.calls[0]?.[0];
    expect(args?.where).toEqual({ id: featureId, docVersion: 5 });
    expect(args?.data).toMatchObject({ docVersion: { increment: 1 } });
  });

  it("a stale base is refused with a structured conflict and writes nothing", async () => {
    storedFeature(6);
    const caller = createMockCaller({ userId: callerId, db: dbMock, tokenType: "agent-key" });

    const error = await caller.product.feature
      .update({ id: featureId, description: "agent edit", baseVersion: 5 })
      .then(() => null, (e: unknown) => e);

    expect(error).toMatchObject({
      code: "CONFLICT",
      cause: {
        conflict: {
          kind: "revision_conflict",
          entity: "feature",
          id: featureId,
          field: "description",
          expectedRevision: 5,
          currentRevision: 6,
        },
      },
    });
    expect(dbMock.feature.update).not.toHaveBeenCalled();
  });

  it("a save landing after the check makes the compare-and-set miss: CONFLICT, not an overwrite", async () => {
    storedFeature(5);
    dbMock.feature.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Record to update not found.", {
        code: "P2025",
        clientVersion: "test",
      }),
    );
    // The re-read after the miss sees the newer version.
    dbMock.feature.findUnique
      .mockResolvedValueOnce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { id: featureId, productId: "prod-1", product: { workspaceId } } as any,
      )
      .mockResolvedValueOnce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { description: "stored body", descriptionDoc: null, docVersion: 5 } as any,
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValueOnce({ status: "DEFINED" } as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValueOnce({ docVersion: 6 } as any);
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    await expect(
      caller.product.feature.update({ id: featureId, description: "mine", baseVersion: 5 }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      cause: { conflict: { expectedRevision: 5, currentRevision: 6 } },
    });
  });

  it("without a base the Markdown write lands unconditionally, as before", async () => {
    storedFeature(9);
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    await caller.product.feature.update({ id: featureId, description: "cli edit" });

    expect(dbMock.feature.update.mock.calls[0]?.[0]?.where).toEqual({ id: featureId });
  });

  it("re-sending the stored Markdown with a stale base is not a conflict (nothing is rewritten)", async () => {
    storedFeature(9);
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    await caller.product.feature.update({
      id: featureId,
      description: "stored body",
      baseVersion: 2,
    });

    expect(dbMock.feature.update.mock.calls[0]?.[0]?.where).toEqual({ id: featureId });
  });
});
