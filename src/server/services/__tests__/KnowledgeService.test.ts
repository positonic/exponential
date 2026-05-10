/**
 * Unit tests for KnowledgeService — focuses on the workspace-scoping fix:
 *
 *  1. embedSource stamps workspaceId on every chunk insert (no post-hoc backfill).
 *  2. search() requires workspaceId and uses it as the primary filter.
 *  3. search() optionally narrows by userId / projectId / participantEmail.
 *  4. participantEmail is workspace-scoped via the join (no cross-workspace leak).
 *
 * We mock the OpenAI embeddings client (LangChain) and inspect the SQL
 * fragments KnowledgeService passes to Prisma's tagged-template runner.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  process.env.OPENAI_API_KEY ??= "sk-test-dummy";
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.NODE_ENV ??= "test";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.DATABASE_ENCRYPTION_KEY ??= "0".repeat(64);
});

// Stub LangChain so we never call OpenAI.
vi.mock("@langchain/openai", () => ({
  OpenAIEmbeddings: class MockEmbeddings {
    async embedQuery(_text: string): Promise<number[]> {
      return Array(1536).fill(0.1);
    }
    async embedDocuments(texts: string[]): Promise<number[][]> {
      return texts.map(() => Array(1536).fill(0.1));
    }
  },
}));

// Imports of code under test must come AFTER vi.mock calls.
import { KnowledgeService } from "../KnowledgeService";
import type { EmbeddingSource } from "../embedding/types";

// ── Helpers ──────────────────────────────────────────────────────────

interface CapturedRawCall {
  /** The Prisma.sql template strings array. */
  strings: readonly string[];
  /** Interpolated values, in template-string order. */
  values: unknown[];
}

/**
 * Build a fake Prisma client that records every $executeRaw / $queryRaw call
 * so tests can assert on the SQL fragments and bound values.
 */
function buildFakeDb() {
  const executeRawCalls: CapturedRawCall[] = [];
  const queryRawCalls: CapturedRawCall[] = [];
  let queryRawResult: unknown[] = [];

  // Prisma's tagged template hands the function `(strings, ...values)`.
  // We accept a single Prisma.Sql object too (when caller pre-built it).
  function captureRaw(bucket: CapturedRawCall[]) {
    return (input: unknown, ...rest: unknown[]): Promise<unknown> => {
      // The `Prisma.sql` template-tag overload passes a TemplateStringsArray
      // as the first arg with .raw. We just capture both the strings and
      // the interpolated values so tests can pattern-match.
      const strings = (input as { raw?: readonly string[] })?.raw
        ? ((input as unknown as TemplateStringsArray) as readonly string[])
        : ([] as readonly string[]);
      bucket.push({ strings, values: rest });
      return Promise.resolve(bucket === queryRawCalls ? queryRawResult : 1);
    };
  }

  const db = {
    $transaction: async <T,>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      // Pass the same fake client as the tx; deleteChunks calls $executeRaw on it.
      return fn(db);
    },
    $executeRaw: captureRaw(executeRawCalls),
    $queryRaw: captureRaw(queryRawCalls),
    knowledgeChunk: {
      count: vi.fn(async () => 0),
    },
  } as unknown as ConstructorParameters<typeof KnowledgeService>[0];

  return {
    db,
    executeRawCalls,
    queryRawCalls,
    setQueryRawResult: (rows: unknown[]) => {
      queryRawResult = rows;
    },
  };
}

function buildSource(overrides: Partial<{
  content: string;
  workspaceId: string | null;
  userId: string | null;
  projectId: string | null;
  sourceType: "transcription" | "resource" | "document";
  sourceId: string;
}> = {}): EmbeddingSource {
  const {
    content = "Hello world. This is a sample sentence.",
    workspaceId = "ws-1",
    userId = "u-1",
    projectId = null,
    sourceType = "transcription",
    sourceId = "src-1",
  } = overrides;
  return {
    getContent: () => content,
    getSourceType: () => sourceType,
    getSourceId: () => sourceId,
    getUserId: () => userId,
    getProjectId: () => projectId,
    getWorkspaceId: () => workspaceId,
    getMetadata: () => ({}),
  };
}

// Concatenate the raw template strings into a single haystack so tests can do
// substring assertions (the values themselves are interpolated as $N parameters
// at runtime — we just want to confirm the column lists / WHERE clauses).
function joinSql(call: CapturedRawCall): string {
  return call.strings.join(" ?? ");
}

// ── Tests ────────────────────────────────────────────────────────────

describe("KnowledgeService — workspace scoping", () => {
  describe("embedSource", () => {
    it("stamps workspaceId on every chunk insert (batch path)", async () => {
      const { db, executeRawCalls } = buildFakeDb();
      const svc = new KnowledgeService(db);

      const result = await svc.embedSource(
        buildSource({ workspaceId: "ws-42" }),
      );

      expect(result.success).toBe(true);
      expect(result.chunkCount).toBeGreaterThan(0);

      // First raw call is the deleteChunks() inside the transaction.
      // Subsequent calls are the INSERTs.
      const inserts = executeRawCalls.filter((c) =>
        joinSql(c).includes('INSERT INTO "KnowledgeChunk"'),
      );
      expect(inserts.length).toBeGreaterThan(0);

      for (const ins of inserts) {
        const sql = joinSql(ins);
        // The column list must include workspaceId and the bound value at
        // that position must be our workspace.
        expect(sql).toContain('"workspaceId"');
        expect(ins.values).toContain("ws-42");
      }
    });

    it("inserts NULL workspaceId when source has none, with a warning (back-compat)", async () => {
      const { db, executeRawCalls } = buildFakeDb();
      const svc = new KnowledgeService(db);
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

      const result = await svc.embedSource(
        buildSource({ workspaceId: null }),
      );

      expect(result.success).toBe(true);
      const inserts = executeRawCalls.filter((c) =>
        joinSql(c).includes('INSERT INTO "KnowledgeChunk"'),
      );
      expect(inserts.length).toBeGreaterThan(0);
      for (const ins of inserts) {
        // workspaceId column is still emitted, but the bound value is null.
        expect(joinSql(ins)).toContain('"workspaceId"');
        expect(ins.values).toContain(null);
      }
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("has no workspaceId"),
      );

      warnSpy.mockRestore();
    });

    it("still writes userId on every chunk (userId stays as a secondary filter)", async () => {
      const { db, executeRawCalls } = buildFakeDb();
      const svc = new KnowledgeService(db);

      await svc.embedSource(buildSource({ userId: "user-7", workspaceId: "ws-1" }));

      const inserts = executeRawCalls.filter((c) =>
        joinSql(c).includes('INSERT INTO "KnowledgeChunk"'),
      );
      expect(inserts.length).toBeGreaterThan(0);
      for (const ins of inserts) {
        expect(joinSql(ins)).toContain('"userId"');
        expect(ins.values).toContain("user-7");
      }
    });
  });

  describe("search", () => {
    it("throws when workspaceId is missing", async () => {
      const { db } = buildFakeDb();
      const svc = new KnowledgeService(db);

      await expect(
        // @ts-expect-error — intentionally violating the type to test the runtime guard.
        svc.search("foo", { userId: "u-1" }),
      ).rejects.toThrow(/workspaceId is required/);
    });

    it("filters by workspaceId on the SQL WHERE clause", async () => {
      const { db, queryRawCalls, setQueryRawResult } = buildFakeDb();
      setQueryRawResult([]);
      const svc = new KnowledgeService(db);

      await svc.search("foo", { workspaceId: "ws-A" });

      expect(queryRawCalls.length).toBe(1);
      const sql = joinSql(queryRawCalls[0]!);
      expect(sql).toContain('kc."workspaceId"');
      expect(queryRawCalls[0]!.values).toContain("ws-A");
    });

    it("does NOT include any 'kc.userId =' filter when userId is omitted", async () => {
      const { db, queryRawCalls, setQueryRawResult } = buildFakeDb();
      setQueryRawResult([]);
      const svc = new KnowledgeService(db);

      await svc.search("foo", { workspaceId: "ws-A" });

      // Walk every nested Prisma.sql fragment too — they also expose .strings.
      const allFragments: string[] = [];
      function collect(call: CapturedRawCall) {
        allFragments.push(joinSql(call));
        for (const v of call.values) {
          const sub = (v as { strings?: readonly string[] })?.strings;
          if (sub) {
            allFragments.push(sub.join(" ?? "));
          }
        }
      }
      collect(queryRawCalls[0]!);
      const haystack = allFragments.join("\n");
      expect(haystack).not.toContain('kc."userId"');
    });

    it("includes a 'kc.userId =' filter ONLY when userId is provided", async () => {
      const { db, queryRawCalls, setQueryRawResult } = buildFakeDb();
      setQueryRawResult([]);
      const svc = new KnowledgeService(db);

      await svc.search("foo", { workspaceId: "ws-A", userId: "u-9" });

      const allFragments: string[] = [];
      function collect(call: CapturedRawCall) {
        allFragments.push(joinSql(call));
        for (const v of call.values) {
          const sub = (v as { strings?: readonly string[] })?.strings;
          if (sub) {
            allFragments.push(sub.join(" ?? "));
          }
          const subVals = (v as { values?: unknown[] })?.values;
          if (Array.isArray(subVals)) {
            // For the userCondition, the userId is a bound value on the Prisma.sql fragment.
            for (const sv of subVals) {
              if (typeof sv === "string") allFragments.push(`bound:${sv}`);
            }
          }
        }
      }
      collect(queryRawCalls[0]!);
      const haystack = allFragments.join("\n");
      expect(haystack).toContain('kc."userId"');
      expect(haystack).toContain("bound:u-9");
    });

    it("emits a workspace-scoped EXISTS sub-select when participantEmail is set", async () => {
      const { db, queryRawCalls, setQueryRawResult } = buildFakeDb();
      setQueryRawResult([]);
      const svc = new KnowledgeService(db);

      await svc.search("foo", {
        workspaceId: "ws-A",
        participantEmail: "alice@example.com",
      });

      const allFragments: string[] = [];
      const allBound: unknown[] = [];
      function collect(call: CapturedRawCall) {
        allFragments.push(joinSql(call));
        for (const v of call.values) {
          const sub = (v as { strings?: readonly string[] })?.strings;
          if (sub) allFragments.push(sub.join(" ?? "));
          const subVals = (v as { values?: unknown[] })?.values;
          if (Array.isArray(subVals)) allBound.push(...subVals);
        }
      }
      collect(queryRawCalls[0]!);
      const haystack = allFragments.join("\n");

      expect(haystack).toContain('"TranscriptionSessionParticipant"');
      expect(haystack).toContain("p.email");
      // The participant clause MUST also re-bind workspaceId on the join,
      // otherwise we'd leak rows from other workspaces via the participants table.
      expect(haystack).toContain('p."workspaceId"');
      expect(allBound).toContain("alice@example.com");
      expect(allBound).toContain("ws-A");
    });
  });
});
