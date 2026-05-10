/**
 * Unit tests for the document tracker router (Phase 3c).
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` plus mocked
 * `~/lib/s3`, `~/lib/document-parser`, and KnowledgeService so no real
 * database / network / S3 traffic is generated. Mirrors the test layout
 * from `action.test.ts`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

// Seed env vars before any module imports — `vi.hoisted` runs before
// regular top-level statements. Mirrors action.test.ts.
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
  process.env.S3_BUCKET ??= "test-bucket";
  process.env.AWS_ACCESS_KEY_ID ??= "test-access";
  process.env.AWS_SECRET_ACCESS_KEY ??= "test-secret";
  process.env.AWS_REGION ??= "us-east-1";
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
}));
vi.mock("~/server/services/onboarding/syncOnboardingProgress", () => ({
  completeOnboardingStep: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("~/lib/blob", () => ({
  uploadToBlob: vi.fn().mockResolvedValue({ url: "blob://test" }),
}));

// ── Mocks for the modules under test ─────────────────────────────────
// vi.mock factories are hoisted to the top of the file, so any state
// they reference must also be created via vi.hoisted (also hoisted) —
// otherwise we hit a TDZ error when the factory runs before the local
// const initialiser.
const { s3Mock, parserMock, embedSourceMock } = vi.hoisted(() => ({
  s3Mock: {
    uploadFile: vi.fn(),
    getPresignedDownloadUrl: vi.fn(),
    deleteObject: vi.fn(),
    downloadObject: vi.fn(),
    keyForDocument: vi.fn(
      (id: string, name: string) => `documents/${id}/${name}`,
    ),
    getS3Client: vi.fn(),
  },
  parserMock: {
    extractText: vi.fn(),
  },
  embedSourceMock: vi.fn(),
}));

vi.mock("~/lib/s3", () => s3Mock);
vi.mock("~/lib/document-parser", () => parserMock);
vi.mock("~/server/services/KnowledgeService", () => ({
  getKnowledgeService: () => ({
    embedSource: embedSourceMock,
  }),
}));

// `fetch` is a global; jest-style spy.
const fetchSpy = vi.fn();

// ── Imports of code under test (must come AFTER vi.mock calls) ───────
import { createMockCaller } from "~/test/trpc-helpers";

// Cast factory for fake Document rows — keeps tests readable.
function fakeDoc(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: overrides.id ?? "doc-1",
    workspaceId: overrides.workspaceId ?? "w1",
    uploadedById: overrides.uploadedById ?? "caller-1",
    title: overrides.title ?? "Test doc",
    description: overrides.description ?? null,
    sourceType: overrides.sourceType ?? "upload",
    sourceUri: overrides.sourceUri ?? null,
    s3Key: overrides.s3Key ?? null,
    mimeType: overrides.mimeType ?? null,
    byteSize: overrides.byteSize ?? null,
    ingestionStatus: overrides.ingestionStatus ?? "pending",
    chunkCount: overrides.chunkCount ?? 0,
    ingestionError: overrides.ingestionError ?? null,
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function membership(userId: string, workspaceId: string) {
  return {
    userId,
    workspaceId,
    role: "member",
    joinedAt: new Date(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("document router (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;
  const callerId = "caller-1";
  const workspaceId = "w1";

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);

    s3Mock.uploadFile.mockReset();
    s3Mock.getPresignedDownloadUrl.mockReset();
    s3Mock.deleteObject.mockReset();
    s3Mock.downloadObject.mockReset();
    s3Mock.keyForDocument.mockClear();
    parserMock.extractText.mockReset();
    embedSourceMock.mockReset();
    fetchSpy.mockReset();

    // Default sensible mocks
    s3Mock.uploadFile.mockResolvedValue({
      key: "documents/doc-1/file.txt",
      url: "s3://test-bucket/documents/doc-1/file.txt",
    });
    s3Mock.getPresignedDownloadUrl.mockResolvedValue(
      "https://s3.test/presigned",
    );
    s3Mock.deleteObject.mockResolvedValue(undefined);
    parserMock.extractText.mockResolvedValue({
      text: "extracted body",
      meta: { wordCount: 2 },
    });
    embedSourceMock.mockResolvedValue({
      success: true,
      chunkCount: 3,
      processingTimeMs: 12,
    });

    // Wire global fetch
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = fetchSpy;
  });

  // ──────────────────────────────────────────────────────────────────
  // create
  // ──────────────────────────────────────────────────────────────────
  describe("create", () => {
    it("inserts a Document row when caller is a workspace member", async () => {
      dbMock.workspaceUser.findUnique.mockResolvedValue(
        membership(callerId, workspaceId),
      );
      const created = fakeDoc({ title: "New doc", sourceType: "upload" });
      dbMock.document.create.mockResolvedValue(created);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      const result = await caller.document.create({
        workspaceId,
        title: "New doc",
        sourceType: "upload",
      });

      expect(result.document.id).toBe("doc-1");
      expect(dbMock.document.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId,
            uploadedById: callerId,
            title: "New doc",
            sourceType: "upload",
            ingestionStatus: "pending",
          }),
        }),
      );
    });

    it("rejects unauthorized workspace", async () => {
      dbMock.workspaceUser.findUnique.mockResolvedValue(null);

      const caller = createMockCaller({ userId: "stranger", db: dbMock });
      await expect(
        caller.document.create({
          workspaceId,
          title: "Nope",
          sourceType: "upload",
        }),
      ).rejects.toThrow(TRPCError);

      expect(dbMock.document.create).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // list
  // ──────────────────────────────────────────────────────────────────
  describe("list", () => {
    it("queries documents scoped by workspaceId with optional filters", async () => {
      dbMock.workspaceUser.findUnique.mockResolvedValue(
        membership(callerId, workspaceId),
      );
      dbMock.document.findMany.mockResolvedValue([
        fakeDoc({ id: "d1" }),
        fakeDoc({ id: "d2" }),
      ]);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      const result = await caller.document.list({
        workspaceId,
        sourceType: "upload",
        ingestionStatus: "completed",
        limit: 50,
      });

      expect(result.documents).toHaveLength(2);
      expect(result.nextCursor).toBeNull();
      expect(dbMock.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId,
            sourceType: "upload",
            ingestionStatus: "completed",
          }),
          take: 51,
          orderBy: { createdAt: "desc" },
        }),
      );
    });

    it("returns nextCursor when there are more results than the limit", async () => {
      dbMock.workspaceUser.findUnique.mockResolvedValue(
        membership(callerId, workspaceId),
      );
      // Return limit+1 = 3 docs to trigger cursor
      dbMock.document.findMany.mockResolvedValue([
        fakeDoc({ id: "d1" }),
        fakeDoc({ id: "d2" }),
        fakeDoc({ id: "d3" }),
      ]);

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      const result = await caller.document.list({ workspaceId, limit: 2 });

      expect(result.documents).toHaveLength(2);
      expect(result.nextCursor).toBe("d3");
    });

    it("rejects unauthorized workspace", async () => {
      dbMock.workspaceUser.findUnique.mockResolvedValue(null);

      const caller = createMockCaller({ userId: "stranger", db: dbMock });
      await expect(
        caller.document.list({ workspaceId }),
      ).rejects.toThrow(TRPCError);

      expect(dbMock.document.findMany).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // getById
  // ──────────────────────────────────────────────────────────────────
  describe("getById", () => {
    it("returns the document when it lives in the workspace", async () => {
      dbMock.workspaceUser.findUnique.mockResolvedValue(
        membership(callerId, workspaceId),
      );
      dbMock.document.findUnique.mockResolvedValue(
        fakeDoc({ id: "doc-1", workspaceId }),
      );

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      const result = await caller.document.getById({
        workspaceId,
        id: "doc-1",
      });

      expect(result.id).toBe("doc-1");
    });

    it("throws NOT_FOUND when document is in a different workspace", async () => {
      dbMock.workspaceUser.findUnique.mockResolvedValue(
        membership(callerId, workspaceId),
      );
      dbMock.document.findUnique.mockResolvedValue(
        fakeDoc({ id: "doc-1", workspaceId: "other-ws" }),
      );

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await expect(
        caller.document.getById({ workspaceId, id: "doc-1" }),
      ).rejects.toThrow(TRPCError);
    });

    it("rejects unauthorized workspace", async () => {
      dbMock.workspaceUser.findUnique.mockResolvedValue(null);

      const caller = createMockCaller({ userId: "stranger", db: dbMock });
      await expect(
        caller.document.getById({ workspaceId, id: "doc-1" }),
      ).rejects.toThrow(TRPCError);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // getDownloadUrl
  // ──────────────────────────────────────────────────────────────────
  describe("getDownloadUrl", () => {
    it("returns a presigned URL when the document has an s3Key", async () => {
      dbMock.workspaceUser.findUnique.mockResolvedValue(
        membership(callerId, workspaceId),
      );
      dbMock.document.findUnique.mockResolvedValue(
        fakeDoc({ id: "doc-1", workspaceId, s3Key: "documents/doc-1/x.pdf" }),
      );

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      const result = await caller.document.getDownloadUrl({
        workspaceId,
        id: "doc-1",
      });

      expect(result.url).toBe("https://s3.test/presigned");
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(s3Mock.getPresignedDownloadUrl).toHaveBeenCalledWith(
        "documents/doc-1/x.pdf",
        3600,
      );
    });

    it("throws when the document has no s3Key", async () => {
      dbMock.workspaceUser.findUnique.mockResolvedValue(
        membership(callerId, workspaceId),
      );
      dbMock.document.findUnique.mockResolvedValue(
        fakeDoc({ id: "doc-1", workspaceId, s3Key: null }),
      );

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await expect(
        caller.document.getDownloadUrl({ workspaceId, id: "doc-1" }),
      ).rejects.toThrow(TRPCError);

      expect(s3Mock.getPresignedDownloadUrl).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // ingest
  // ──────────────────────────────────────────────────────────────────
  describe("ingest", () => {
    function stubMembership() {
      dbMock.workspaceUser.findUnique.mockResolvedValue(
        membership(callerId, workspaceId),
      );
    }

    it("ingests base64 input: uploads to S3, extracts text, embeds, marks completed", async () => {
      stubMembership();
      const created = fakeDoc({ id: "doc-base64" });
      dbMock.document.create.mockResolvedValue(created);
      dbMock.document.update.mockResolvedValue(
        fakeDoc({ id: "doc-base64", s3Key: "documents/doc-base64/file.pdf" }),
      );

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      const result = await caller.document.ingest({
        source: "base64",
        workspaceId,
        title: "PDF doc",
        mimeType: "application/pdf",
        base64Data: Buffer.from("hello").toString("base64"),
        filename: "file.pdf",
      });

      expect(result.documentId).toBe("doc-base64");
      expect(result.chunksCreated).toBe(3);
      expect(result.ingestionStatus).toBe("completed");

      // S3 upload happened
      expect(s3Mock.uploadFile).toHaveBeenCalledWith(
        expect.objectContaining({
          key: "documents/doc-base64/file.pdf",
          contentType: "application/pdf",
        }),
      );
      // Extractor was called with the buffer + mime
      expect(parserMock.extractText).toHaveBeenCalledWith(
        expect.any(Buffer),
        "application/pdf",
        "file.pdf",
      );
      // Embedding ran
      expect(embedSourceMock).toHaveBeenCalledTimes(1);
      // Status transitions: processing then completed
      const updateCalls = dbMock.document.update.mock.calls;
      expect(updateCalls.length).toBeGreaterThanOrEqual(2);
      const completedCall = updateCalls.find(
        (c) =>
          (c[0]?.data as { ingestionStatus?: string })?.ingestionStatus ===
          "completed",
      );
      expect(completedCall).toBeDefined();
      expect(
        (completedCall![0]!.data as { chunkCount?: number }).chunkCount,
      ).toBe(3);
    });

    it("ingests url input: fetches the URL, uploads, embeds", async () => {
      stubMembership();
      const created = fakeDoc({ id: "doc-url", sourceType: "url" });
      dbMock.document.create.mockResolvedValue(created);
      dbMock.document.update.mockResolvedValue(
        fakeDoc({ id: "doc-url", s3Key: "documents/doc-url/page.html" }),
      );

      // Fetch returns a small HTML body with content-type header
      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Map([["content-type", "text/html"]]),
        arrayBuffer: async () =>
          new TextEncoder().encode("<html><body>hi</body></html>").buffer,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      // Map.get works for our header lookup; new Map<string,string>().get is
      // typed correctly. Headers.get also exists, but Map satisfies our usage.

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      const result = await caller.document.ingest({
        source: "url",
        workspaceId,
        title: "Web page",
        url: "https://example.com/page.html",
      });

      expect(result.documentId).toBe("doc-url");
      expect(result.ingestionStatus).toBe("completed");
      expect(fetchSpy).toHaveBeenCalledWith("https://example.com/page.html");
      expect(s3Mock.uploadFile).toHaveBeenCalled();
      expect(embedSourceMock).toHaveBeenCalledTimes(1);
    });

    it("ingests text input: encodes to utf-8, uploads as text/plain", async () => {
      stubMembership();
      const created = fakeDoc({ id: "doc-text" });
      dbMock.document.create.mockResolvedValue(created);
      dbMock.document.update.mockResolvedValue(
        fakeDoc({ id: "doc-text", s3Key: "documents/doc-text/content.txt" }),
      );

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      const result = await caller.document.ingest({
        source: "text",
        workspaceId,
        title: "Text snippet",
        text: "this is the body text",
      });

      expect(result.documentId).toBe("doc-text");
      expect(result.ingestionStatus).toBe("completed");
      expect(s3Mock.uploadFile).toHaveBeenCalledWith(
        expect.objectContaining({
          key: "documents/doc-text/content.txt",
          contentType: "text/plain",
        }),
      );
      expect(parserMock.extractText).toHaveBeenCalledWith(
        expect.any(Buffer),
        "text/plain",
        "content.txt",
      );
    });

    it("marks document as failed and stores ingestionError on extract failure", async () => {
      stubMembership();
      const created = fakeDoc({ id: "doc-fail" });
      dbMock.document.create.mockResolvedValue(created);
      dbMock.document.update.mockResolvedValue(
        fakeDoc({ id: "doc-fail", s3Key: "documents/doc-fail/file.bin" }),
      );

      parserMock.extractText.mockRejectedValue(
        new Error("Unsupported MIME type"),
      );

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await expect(
        caller.document.ingest({
          source: "base64",
          workspaceId,
          title: "bad doc",
          mimeType: "application/x-weird",
          base64Data: Buffer.from("x").toString("base64"),
          filename: "file.bin",
        }),
      ).rejects.toThrow(TRPCError);

      // Ensure failure was persisted
      const failedCall = dbMock.document.update.mock.calls.find(
        (c) =>
          (c[0]?.data as { ingestionStatus?: string })?.ingestionStatus ===
          "failed",
      );
      expect(failedCall).toBeDefined();
      expect(
        (failedCall![0]!.data as { ingestionError?: string }).ingestionError,
      ).toContain("Unsupported MIME type");
    });

    it("rejects unauthorized workspace", async () => {
      dbMock.workspaceUser.findUnique.mockResolvedValue(null);

      const caller = createMockCaller({ userId: "stranger", db: dbMock });
      await expect(
        caller.document.ingest({
          source: "text",
          workspaceId,
          title: "nope",
          text: "x",
        }),
      ).rejects.toThrow(TRPCError);

      expect(dbMock.document.create).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // delete
  // ──────────────────────────────────────────────────────────────────
  describe("delete", () => {
    it("deletes S3 object, KnowledgeChunk rows, then the Document", async () => {
      dbMock.workspaceUser.findUnique.mockResolvedValue(
        membership(callerId, workspaceId),
      );
      dbMock.document.findUnique.mockResolvedValue(
        fakeDoc({ id: "doc-1", workspaceId, s3Key: "documents/doc-1/x.txt" }),
      );
      dbMock.knowledgeChunk.deleteMany.mockResolvedValue({ count: 4 });
      dbMock.document.delete.mockResolvedValue(fakeDoc({ id: "doc-1" }));

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      const result = await caller.document.delete({
        workspaceId,
        id: "doc-1",
      });

      expect(result.deleted).toBe(true);
      expect(s3Mock.deleteObject).toHaveBeenCalledWith(
        "documents/doc-1/x.txt",
      );
      expect(dbMock.knowledgeChunk.deleteMany).toHaveBeenCalledWith({
        where: { sourceType: "document", sourceId: "doc-1" },
      });
      expect(dbMock.document.delete).toHaveBeenCalledWith({
        where: { id: "doc-1" },
      });
    });

    it("skips S3 delete when document has no s3Key", async () => {
      dbMock.workspaceUser.findUnique.mockResolvedValue(
        membership(callerId, workspaceId),
      );
      dbMock.document.findUnique.mockResolvedValue(
        fakeDoc({ id: "doc-1", workspaceId, s3Key: null }),
      );
      dbMock.knowledgeChunk.deleteMany.mockResolvedValue({ count: 0 });
      dbMock.document.delete.mockResolvedValue(fakeDoc({ id: "doc-1" }));

      const caller = createMockCaller({ userId: callerId, db: dbMock });
      await caller.document.delete({ workspaceId, id: "doc-1" });

      expect(s3Mock.deleteObject).not.toHaveBeenCalled();
      expect(dbMock.document.delete).toHaveBeenCalled();
    });

    it("rejects unauthorized workspace", async () => {
      dbMock.workspaceUser.findUnique.mockResolvedValue(null);

      const caller = createMockCaller({ userId: "stranger", db: dbMock });
      await expect(
        caller.document.delete({ workspaceId, id: "doc-1" }),
      ).rejects.toThrow(TRPCError);

      expect(dbMock.document.delete).not.toHaveBeenCalled();
    });
  });
});
