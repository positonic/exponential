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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  process.env.OPENAI_API_KEY ??= "sk-test-dummy";
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.NODE_ENV ??= "test";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.DATABASE_ENCRYPTION_KEY ??= "0".repeat(64);
});

// Shared knobs for the embeddings stub: per-call latency, and a record of
// every call (and whether a DB transaction was open when it was made).
const embeddingsApi = vi.hoisted(() => ({
  latencyMs: 0,
  calls: [] as { texts: string[]; duringTx: boolean }[],
  txOpen: false,
}));

// Stub LangChain so we never call OpenAI.
vi.mock("@langchain/openai", () => ({
  OpenAIEmbeddings: class MockEmbeddings {
    async embedQuery(_text: string): Promise<number[]> {
      return Array(1536).fill(0.1);
    }
    async embedDocuments(texts: string[]): Promise<number[][]> {
      embeddingsApi.calls.push({ texts, duringTx: embeddingsApi.txOpen });
      if (embeddingsApi.latencyMs > 0) {
        await new Promise((r) => setTimeout(r, embeddingsApi.latencyMs));
      }
      return texts.map(() => Array(1536).fill(0.1));
    }
  },
}));

// Imports of code under test must come AFTER vi.mock calls.
import { KnowledgeService } from "../KnowledgeService";
import { buildKnowledgePageAccessWhere } from "~/server/services/access/resolvers/knowledgePageResolver";
import { buildTranscriptionAccessWhere } from "~/server/services/access/resolvers/transcriptionResolver";
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
  const txOptions: ({ timeout?: number } | undefined)[] = [];
  const queryRawCalls: CapturedRawCall[] = [];
  let queryRawResult: unknown[] = [];
  let viewablePages: { id: string }[] = [];
  let viewableMeetings: { id: string }[] = [];

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
    $transaction: async <T,>(
      fn: (tx: unknown) => Promise<T>,
      options?: { timeout?: number },
    ): Promise<T> => {
      txOptions.push(options);
      // Pass the same fake client as the tx; deleteChunks calls $executeRaw on it.
      embeddingsApi.txOpen = true;
      try {
        return await fn(db);
      } finally {
        embeddingsApi.txOpen = false;
      }
    },
    $executeRaw: captureRaw(executeRawCalls),
    $queryRaw: captureRaw(queryRawCalls),
    knowledgeChunk: {
      count: vi.fn(async () => 0),
    },
    knowledgePage: {
      findMany: vi.fn(async () => viewablePages),
    },
    transcriptionSession: {
      findMany: vi.fn(async () => viewableMeetings),
    },
  } as unknown as ConstructorParameters<typeof KnowledgeService>[0];

  return {
    db,
    executeRawCalls,
    queryRawCalls,
    txOptions,
    setQueryRawResult: (rows: unknown[]) => {
      queryRawResult = rows;
    },
    setViewablePages: (ids: string[]) => {
      viewablePages = ids.map((id) => ({ id }));
    },
    setViewableMeetings: (ids: string[]) => {
      viewableMeetings = ids.map((id) => ({ id }));
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

/** The nested Prisma.sql fragments and their bound values of one raw call. */
function nestedSql(call: CapturedRawCall): { fragments: string; bound: unknown[] } {
  const fragments: string[] = [];
  const bound: unknown[] = [];
  for (const v of call.values) {
    const sub = (v as { strings?: readonly string[] })?.strings;
    if (sub) fragments.push(sub.join(" ?? "));
    const subVals = (v as { values?: unknown[] })?.values;
    if (Array.isArray(subVals)) bound.push(...subVals);
  }
  return { fragments: fragments.join("\n"), bound };
}

function meetingFindMany(db: unknown): ReturnType<typeof vi.fn> {
  return (db as { transcriptionSession: { findMany: ReturnType<typeof vi.fn> } })
    .transcriptionSession.findMany;
}

// Bound values with nested Prisma.sql fragments (e.g. the rows of a multi-row
// INSERT built with Prisma.join) flattened in.
function boundValues(call: CapturedRawCall): unknown[] {
  return call.values.flatMap((v) => {
    const nested = (v as { strings?: unknown; values?: unknown } | null)?.values;
    return (v as { strings?: unknown } | null)?.strings && Array.isArray(nested) ? nested : [v];
  });
}

function insertsOf(calls: CapturedRawCall[]): CapturedRawCall[] {
  return calls.filter((c) => joinSql(c).includes('INSERT INTO "KnowledgeChunk"'));
}

// ── Tests ────────────────────────────────────────────────────────────

describe("KnowledgeService — splitIntoSentences", () => {
  const split = (text: string) => new KnowledgeService({} as never).splitIntoSentences(text);

  it("keeps text after the last punctuation mark", () => {
    expect(split("A sentence.\n\n- Redis")).toEqual(["A sentence.", "- Redis"]);
    expect(split("One. Two! ```\ncode\n```")).toEqual(["One.", "Two!", "```\ncode\n```"]);
  });

  it("keeps closing marks with their sentence", () => {
    expect(split("**Bold lead.** The rest. *Italic.* \"Quoted.\" End")).toEqual([
      "**Bold lead.**",
      "The rest.",
      "*Italic.*",
      "\"Quoted.\"",
      "End",
    ]);
  });

  it("still handles text with no punctuation at all", () => {
    expect(split("no punctuation here")).toEqual(["no punctuation here"]);
    expect(split("")).toEqual([""].filter(Boolean));
  });
});

describe("KnowledgeService — chunkSections", () => {
  const svc = () => new KnowledgeService({} as never);

  it("indexes a section's unpunctuated ending", () => {
    const chunks = svc().chunkSections([{ context: "T › S", text: "A sentence.\n\n- Redis" }]);

    expect(chunks.map((c) => c.text).join(" ")).toContain("- Redis");
  });

  it("repeats a section's context on every chunk and numbers chunks across sections", () => {
    const long = "A sentence about contracts that goes on for a while. ".repeat(80);

    const chunks = svc().chunkSections([
      { context: "A talk", text: "The standfirst." },
      { context: "A talk › Composing (41:49)", text: long },
    ]);

    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks[0]!.text).toBe("A talk\n\nThe standfirst.");
    for (const chunk of chunks.slice(1)) {
      expect(chunk.text.startsWith("A talk › Composing (41:49)\n\n")).toBe(true);
    }
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));
  });

  it("keeps each chunk within the size limit, counting its context", () => {
    const long = "A sentence about contracts that goes on for a while. ".repeat(200);

    for (const chunk of svc().chunkSections([{ context: "A title ".repeat(10), text: long }], 200, 20)) {
      expect(chunk.tokenCount).toBeLessThanOrEqual(220);
    }
  });
});

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
        expect(boundValues(ins)).toContain("ws-42");
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
        expect(boundValues(ins)).toContain(null);
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
        expect(boundValues(ins)).toContain("user-7");
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

    it("keeps page chunks only for pages the pageViewerId can view", async () => {
      const { db, queryRawCalls, setQueryRawResult, setViewablePages } = buildFakeDb();
      setQueryRawResult([]);
      setViewablePages(["page-ok"]);
      const svc = new KnowledgeService(db);

      await svc.search("foo", { workspaceId: "ws-A", pageViewerId: "u-7" });

      const pageFindMany = (db as unknown as {
        knowledgePage: { findMany: ReturnType<typeof vi.fn> };
      }).knowledgePage.findMany;
      expect(pageFindMany).toHaveBeenCalledTimes(1);
      const where = (pageFindMany.mock.calls[0]?.[0] as { where: unknown }).where;
      expect(where).toEqual({
        AND: [{ workspaceId: "ws-A" }, buildKnowledgePageAccessWhere("u-7")],
      });

      const call = queryRawCalls[0]!;
      const fragments: string[] = [];
      const bound: unknown[] = [];
      for (const v of call.values) {
        const sub = (v as { strings?: readonly string[] })?.strings;
        if (sub) fragments.push(sub.join(" ?? "));
        const subVals = (v as { values?: unknown[] })?.values;
        if (Array.isArray(subVals)) bound.push(...subVals);
      }
      expect(fragments.join("\n")).toContain(`kc."sourceType" <> 'page' OR kc."sourceId" = ANY(`);
      expect(bound).toContainEqual(["page-ok"]);
    });

    it("drops page chunks entirely when no pageViewerId is given (fails closed)", async () => {
      const { db, queryRawCalls, setQueryRawResult } = buildFakeDb();
      setQueryRawResult([]);
      const svc = new KnowledgeService(db);

      await svc.search("foo", { workspaceId: "ws-A" });

      const pageFindMany = (db as unknown as {
        knowledgePage: { findMany: ReturnType<typeof vi.fn> };
      }).knowledgePage.findMany;
      expect(pageFindMany).not.toHaveBeenCalled();
      const fragments = queryRawCalls[0]!.values
        .map((v) => (v as { strings?: readonly string[] })?.strings?.join(" ?? "))
        .filter(Boolean)
        .join("\n");
      expect(fragments).toContain(`AND kc."sourceType" <> 'page'`);
    });

    it("skips the page-access lookup when the search can't return page chunks", async () => {
      const { db, setQueryRawResult } = buildFakeDb();
      setQueryRawResult([]);
      const svc = new KnowledgeService(db);

      await svc.search("foo", {
        workspaceId: "ws-A",
        pageViewerId: "u-7",
        sourceTypes: ["resource"],
      });

      const pageFindMany = (db as unknown as {
        knowledgePage: { findMany: ReturnType<typeof vi.fn> };
      }).knowledgePage.findMany;
      expect(pageFindMany).not.toHaveBeenCalled();
    });

    it("keeps transcription chunks only for meetings the transcriptionViewerId can view", async () => {
      const { db, queryRawCalls, setQueryRawResult, setViewableMeetings } = buildFakeDb();
      setQueryRawResult([]);
      setViewableMeetings(["meeting-ok"]);
      const svc = new KnowledgeService(db);

      await svc.search("foo", { workspaceId: "ws-A", transcriptionViewerId: "u-7" });

      const findMany = meetingFindMany(db);
      expect(findMany).toHaveBeenCalledTimes(1);
      const where = (findMany.mock.calls[0]?.[0] as { where: unknown }).where;
      expect(where).toEqual({
        AND: [{ workspaceId: "ws-A" }, buildTranscriptionAccessWhere("u-7")],
      });

      const { fragments, bound } = nestedSql(queryRawCalls[0]!);
      expect(fragments).toContain(
        `kc."sourceType" <> 'transcription' OR kc."sourceId" = ANY(`,
      );
      expect(bound).toContainEqual(["meeting-ok"]);
    });

    it("still filters transcription chunks when the viewer can see no meetings", async () => {
      const { db, queryRawCalls, setQueryRawResult } = buildFakeDb();
      setQueryRawResult([]);
      const svc = new KnowledgeService(db);

      await svc.search("foo", { workspaceId: "ws-A", transcriptionViewerId: "u-7" });

      const { fragments, bound } = nestedSql(queryRawCalls[0]!);
      expect(fragments).toContain(
        `kc."sourceType" <> 'transcription' OR kc."sourceId" = ANY(`,
      );
      expect(bound).toContainEqual([]);
    });

    it("drops transcription chunks entirely when no transcriptionViewerId is given (fails closed)", async () => {
      const { db, queryRawCalls, setQueryRawResult } = buildFakeDb();
      setQueryRawResult([]);
      const svc = new KnowledgeService(db);

      await svc.search("foo", { workspaceId: "ws-A" });

      expect(meetingFindMany(db)).not.toHaveBeenCalled();
      const { fragments } = nestedSql(queryRawCalls[0]!);
      expect(fragments).toContain(`AND kc."sourceType" <> 'transcription'`);
    });

    it("skips the meeting-access lookup when the search can't return transcription chunks", async () => {
      const { db, queryRawCalls, setQueryRawResult } = buildFakeDb();
      setQueryRawResult([]);
      const svc = new KnowledgeService(db);

      await svc.search("foo", {
        workspaceId: "ws-A",
        transcriptionViewerId: "u-7",
        sourceTypes: ["resource"],
      });

      expect(meetingFindMany(db)).not.toHaveBeenCalled();
      const { fragments } = nestedSql(queryRawCalls[0]!);
      expect(fragments).not.toContain(`'transcription'`);
    });

    it("keeps resource chunks only for resources the resourceViewerId owns, read from the live row", async () => {
      const { db, queryRawCalls, setQueryRawResult } = buildFakeDb();
      setQueryRawResult([]);
      const svc = new KnowledgeService(db);

      await svc.search("foo", { workspaceId: "ws-A", resourceViewerId: "u-7" });

      const { fragments, bound } = nestedSql(queryRawCalls[0]!);
      // Ownership comes from the joined Resource row (`r`), not the chunk's
      // copied userId, so a deleted resource's orphaned chunks never match.
      expect(fragments).toContain(`kc."sourceType" <> 'resource' OR (r."userId" = `);
      expect(fragments).not.toContain(`kc."userId" =`);
      expect(bound).toContain("u-7");
    });

    it("reads a resource's workspace from the live row, so a moved resource's stale chunks never match", async () => {
      const { db, queryRawCalls, setQueryRawResult } = buildFakeDb();
      setQueryRawResult([]);
      const svc = new KnowledgeService(db);

      await svc.search("foo", { workspaceId: "ws-A", resourceViewerId: "u-7" });

      const { fragments, bound } = nestedSql(queryRawCalls[0]!);
      // A workspace move does not re-embed, so the chunk's workspaceId can be
      // stale; the live row must sit in the searched workspace (ADR-0079).
      expect(fragments).toContain(` AND r."workspaceId" = `);
      expect(bound).toContain("ws-A");
    });

    it("drops resource chunks entirely when no resourceViewerId is given (fails closed)", async () => {
      const { db, queryRawCalls, setQueryRawResult } = buildFakeDb();
      setQueryRawResult([]);
      const svc = new KnowledgeService(db);

      await svc.search("foo", { workspaceId: "ws-A", sourceTypes: ["resource"] });

      const { fragments } = nestedSql(queryRawCalls[0]!);
      expect(fragments).toContain(`AND kc."sourceType" <> 'resource'`);
    });

    it("adds no resource condition when the search can't return resource chunks", async () => {
      const { db, queryRawCalls, setQueryRawResult } = buildFakeDb();
      setQueryRawResult([]);
      const svc = new KnowledgeService(db);

      await svc.search("foo", { workspaceId: "ws-A", sourceTypes: ["document"] });

      const { fragments } = nestedSql(queryRawCalls[0]!);
      expect(fragments).not.toContain(`'resource'`);
    });

    it("applies meeting access on top of participantEmail — the email narrows, it never grants", async () => {
      const { db, queryRawCalls, setQueryRawResult, setViewableMeetings } = buildFakeDb();
      setQueryRawResult([]);
      setViewableMeetings(["meeting-ok"]);
      const svc = new KnowledgeService(db);

      await svc.search("foo", {
        workspaceId: "ws-A",
        participantEmail: "alice@example.com",
        transcriptionViewerId: "u-7",
      });

      // Viewable meetings are resolved for the caller alone; the attendee
      // email being searched for plays no part in who may see them.
      const where = (meetingFindMany(db).mock.calls[0]?.[0] as { where: unknown }).where;
      expect(where).toEqual({
        AND: [{ workspaceId: "ws-A" }, buildTranscriptionAccessWhere("u-7")],
      });
      expect(JSON.stringify(where)).not.toContain("alice@example.com");

      // Both conditions land in the WHERE clause, so a meeting must pass both.
      const { fragments, bound } = nestedSql(queryRawCalls[0]!);
      expect(fragments).toContain("p.email");
      expect(fragments).toContain(
        `kc."sourceType" <> 'transcription' OR kc."sourceId" = ANY(`,
      );
      expect(bound).toContain("alice@example.com");
      expect(bound).toContainEqual(["meeting-ok"]);
    });
  });
});

// ── Large sources: API calls stay out of the transaction ──────────────

/** ~250K chars of distinct sentences — the raised page-body cap. */
function bigPageContent(): string {
  const parts: string[] = [];
  let length = 0;
  for (let i = 0; length < 250_000; i++) {
    const sentence = `Sentence ${i} records decision ${i % 37} about the roadmap for quarter ${i % 4}. `;
    parts.push(sentence);
    length += sentence.length;
  }
  return parts.join("");
}

/**
 * Make the fake transaction behave like Prisma's interactive tx: once
 * `budgetMs` has passed since it opened, any query on it fails with the
 * P2028 "Transaction already closed" error production logged.
 */
function enforceTxDeadline(db: ConstructorParameters<typeof KnowledgeService>[0], budgetMs: number) {
  const fake = db as unknown as {
    $transaction: (fn: (tx: unknown) => Promise<unknown>, o?: unknown) => Promise<unknown>;
    $executeRaw: (...args: unknown[]) => Promise<unknown>;
  };
  const originalTx = fake.$transaction;
  const originalExec = fake.$executeRaw;
  let deadline: number | null = null;
  fake.$executeRaw = (...args) =>
    deadline !== null && Date.now() > deadline
      ? Promise.reject(new Error("Transaction already closed: A query cannot be executed on an expired transaction (P2028)"))
      : originalExec(...args);
  fake.$transaction = async (fn, o) => {
    deadline = Date.now() + budgetMs;
    try {
      return await originalTx(fn, o);
    } finally {
      deadline = null;
    }
  };
}

describe("KnowledgeService — embedSource on a large source", () => {
  beforeEach(() => {
    embeddingsApi.latencyMs = 0;
    embeddingsApi.calls = [];
    embeddingsApi.txOpen = false;
  });

  it("embeds a 250K-char page against a slow embeddings API without a transaction timeout", async () => {
    // Time is scaled down 100x to keep the test fast: each API call takes
    // 100ms and the tx budget is 50ms, mirroring ~10s of API latency against
    // Prisma's 5s default. The old code (API calls inside the tx) fails here.
    embeddingsApi.latencyMs = 100;
    const { db, executeRawCalls, txOptions } = buildFakeDb();
    enforceTxDeadline(db, 50);
    const svc = new KnowledgeService(db);
    const content = bigPageContent();
    const expectedChunks = svc.chunkText(content).length;
    expect(expectedChunks).toBeGreaterThan(100);

    const result = await svc.embedSource(
      buildSource({ content, sourceType: "document", sourceId: "page-big" }),
    );

    expect(result).toMatchObject({ success: true, chunkCount: expectedChunks });
    expect(result.error).toBeUndefined();
    // Every chunk was sent to the API, and never while the tx was open.
    expect(embeddingsApi.calls.flatMap((c) => c.texts)).toHaveLength(expectedChunks);
    expect(embeddingsApi.calls.some((c) => c.duringTx)).toBe(false);
    // Batched multi-row INSERTs (50 rows each), not one round-trip per chunk.
    const inserts = insertsOf(executeRawCalls);
    expect(inserts).toHaveLength(Math.ceil(expectedChunks / 50));
    const rowCount = inserts
      .flatMap(boundValues)
      .filter((v) => v === "text-embedding-3-small").length;
    expect(rowCount).toBe(expectedChunks);
    // The tx serialises per source and has an explicit budget.
    expect(executeRawCalls.some((c) => joinSql(c).includes("pg_advisory_xact_lock"))).toBe(true);
    expect(txOptions[0]?.timeout).toBeGreaterThanOrEqual(5000);
  });

  it("reuses stored vectors for unchanged chunks and only embeds the changed ones", async () => {
    const { db, executeRawCalls, setQueryRawResult } = buildFakeDb();
    const svc = new KnowledgeService(db);
    const content = bigPageContent();
    const chunks = svc.chunkText(content);
    setQueryRawResult(
      chunks.map((c) => ({ content: c.text, vector: "[0.2]", generatedAt: new Date(0) })),
    );

    // Nothing changed → no API calls, every row carries the stored vector.
    const unchanged = await svc.embedSource(buildSource({ content, sourceId: "p" }));
    expect(unchanged).toMatchObject({ success: true, chunkCount: chunks.length });
    expect(embeddingsApi.calls).toHaveLength(0);
    const reusedRows = insertsOf(executeRawCalls)
      .flatMap(boundValues)
      .filter((v) => v === "[0.2]").length;
    expect(reusedRows).toBe(chunks.length);

    // Appending a paragraph only pays for the chunks that changed.
    const edited = `${content} A brand new closing paragraph about the launch.`;
    const result = await svc.embedSource(buildSource({ content: edited, sourceId: "p" }));
    expect(result.success).toBe(true);
    const embedded = embeddingsApi.calls.flatMap((c) => c.texts);
    expect(embedded.length).toBeGreaterThan(0);
    expect(embedded.length).toBeLessThan(3);
  });

  it("leaves existing chunks untouched when the embeddings API fails", async () => {
    const { db, executeRawCalls } = buildFakeDb();
    const svc = new KnowledgeService(db);
    vi.spyOn(svc, "generateBatchEmbeddings").mockRejectedValueOnce(new Error("rate limited"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await svc.embedSource(buildSource({ content: bigPageContent() }));

    expect(result).toMatchObject({ success: false, error: "rate limited" });
    // No tx was opened, so no DELETE ran — the old index survives.
    expect(executeRawCalls.some((c) => joinSql(c).includes("DELETE"))).toBe(false);
    errorSpy.mockRestore();
  });
});

// ── No embeddings provider (keyless self-host, smoky.anvil) ───────────

describe("KnowledgeService without OPENAI_API_KEY", () => {
  beforeEach(() => {
    embeddingsApi.calls = [];
    vi.stubEnv("OPENAI_API_KEY", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("embedSource skips before touching the database, so existing chunks stay as they were", async () => {
    const fake = buildFakeDb();
    const service = new KnowledgeService(fake.db);

    const result = await service.embedSource(buildSource());

    expect(result).toMatchObject({ success: false, chunkCount: 0, skipped: "ai-not-configured" });
    expect(fake.executeRawCalls).toHaveLength(0);
    expect(fake.queryRawCalls).toHaveLength(0);
    expect(fake.txOptions).toHaveLength(0);
    expect(embeddingsApi.calls).toHaveLength(0);
  });

  it("search throws the typed not-configured error rather than calling OpenAI", async () => {
    const fake = buildFakeDb();
    const service = new KnowledgeService(fake.db);

    await expect(service.search("roadmap", { workspaceId: "ws-1" })).rejects.toMatchObject({
      name: "AiNotConfiguredError",
      code: "PRECONDITION_FAILED",
    });
    expect(fake.queryRawCalls).toHaveLength(0);
  });

  it("with the key set again, embedSource embeds and writes as before", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const fake = buildFakeDb();
    const service = new KnowledgeService(fake.db);

    const result = await service.embedSource(buildSource());

    expect(result.success).toBe(true);
    expect(result.skipped).toBeUndefined();
    expect(embeddingsApi.calls.length).toBeGreaterThan(0);
    expect(fake.txOptions).toHaveLength(1);
  });
});
