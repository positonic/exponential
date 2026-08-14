/**
 * Engine-seam tests for the ADR sync (imitating ticketSync's engine tests):
 * the engine is driven with a plain fake {@link AdrRemote} and a deep-mocked
 * PrismaClient — no network, no DB. The budget rules are asserted here as
 * behaviour, not implementation: the tree-SHA short-circuit performs ZERO
 * blob fetches, unchanged blobs are skipped from the tree listing alone, and
 * a parse/fetch failure records a per-file item without failing the run.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import { combineTreeShas, runAdrSync } from "../engine";
import type { AdrRemote } from "../github";

const db = mockDeep<PrismaClient>() as DeepMockProxy<PrismaClient>;

const CONFIG = {
  id: "cfg1",
  workspaceId: "ws1",
  repositoryId: "repo1",
  shortCode: "API",
  adrPaths: ["docs/adr"],
  integrationId: "int1",
  enabled: true,
  lastTreeSha: null as string | null,
  lastCommitSha: null as string | null,
  lastSyncedAt: null as Date | null,
  createdById: "user1",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  repository: { id: "repo1", owner: "acme", name: "api" },
  integration: { providerConfig: { installationId: 42 } },
};

const ADR_CONTENT = `# ADR-0001: Use Postgres

Status: Accepted
`;

/** Fake remote: one repo with docs/adr/0001-use-postgres.md at blob sha b1. */
function makeRemote(overrides?: Partial<AdrRemote>): {
  remote: AdrRemote;
  calls: { getBlob: number };
} {
  const calls = { getBlob: 0 };
  const remote: AdrRemote = {
    getHead: vi.fn(async () => ({ commitSha: "c1", treeSha: "root1" })),
    getTree: vi.fn(async (_o, _r, sha, recursive) => {
      if (sha === "root1" && !recursive) {
        return {
          truncated: false,
          entries: [{ path: "docs", type: "tree" as const, sha: "t-docs" }],
        };
      }
      if (sha === "t-docs" && !recursive) {
        return {
          truncated: false,
          entries: [{ path: "adr", type: "tree" as const, sha: "t-adr" }],
        };
      }
      if (sha === "t-adr") {
        return {
          truncated: false,
          entries: [
            { path: "0001-use-postgres.md", type: "blob" as const, sha: "b1" },
            { path: "README.txt", type: "blob" as const, sha: "b2" },
          ],
        };
      }
      return { truncated: false, entries: [] };
    }),
    getBlob: vi.fn(async () => {
      calls.getBlob++;
      return ADR_CONTENT;
    }),
    ...overrides,
  };
  return { remote, calls };
}

beforeEach(() => {
  mockReset(db);
  db.adrSyncRun.create.mockResolvedValue({ id: "run1" } as never);
  db.adrSyncRun.update.mockResolvedValue({} as never);
  db.adrSyncConfig.update.mockResolvedValue({} as never);
  // Link recompute reads the workspace's enrolled repos.
  db.adrSyncConfig.findMany.mockResolvedValue([
    {
      repositoryId: "repo1",
      shortCode: "API",
      repository: { fullName: "acme/api" },
    },
  ] as never);
  db.adrDocument.findMany.mockResolvedValue([]);
  db.adrDocument.create.mockResolvedValue({} as never);
  db.adrDocument.update.mockResolvedValue({} as never);
});

describe("runAdrSync", () => {
  it("creates a document per matching markdown file on first sync", async () => {
    db.adrSyncConfig.findUnique.mockResolvedValue(CONFIG as never);
    const { remote } = makeRemote();

    const result = await runAdrSync(db, "cfg1", "manual", {
      remoteFactory: async () => remote,
    });

    expect(result.status).toBe("success");
    expect(result.created).toBe(1);
    expect(result.failed).toBe(0);
    expect(db.adrDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          repositoryId: "repo1",
          path: "docs/adr/0001-use-postgres.md",
          number: 1,
          title: "Use Postgres",
          status: "ACCEPTED",
          contentHash: "b1",
          lastSeenSha: "b1",
        }),
      }),
    );
    // Config advances its short-circuit keys.
    expect(db.adrSyncConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastCommitSha: "c1",
          lastTreeSha: combineTreeShas([{ path: "docs/adr", sha: "t-adr" }]),
        }),
      }),
    );
  });

  it("short-circuits as unchanged with ZERO blob fetches when the tree SHA matches", async () => {
    db.adrSyncConfig.findUnique.mockResolvedValue({
      ...CONFIG,
      lastTreeSha: combineTreeShas([{ path: "docs/adr", sha: "t-adr" }]),
    } as never);
    const { remote, calls } = makeRemote();

    const result = await runAdrSync(db, "cfg1", "cron", {
      remoteFactory: async () => remote,
    });

    expect(result.status).toBe("unchanged");
    expect(calls.getBlob).toBe(0);
    expect(db.adrDocument.create).not.toHaveBeenCalled();
    expect(db.adrSyncRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "unchanged" }),
      }),
    );
  });

  it("skips an unchanged blob from the tree listing alone (no content fetch)", async () => {
    db.adrSyncConfig.findUnique.mockResolvedValue(CONFIG as never);
    db.adrDocument.findMany.mockResolvedValue([
      {
        id: "doc1",
        repositoryId: "repo1",
        path: "docs/adr/0001-use-postgres.md",
        contentHash: "b1",
        deletedAt: null,
        number: 1,
        statusRaw: "Accepted",
        body: "",
      },
    ] as never);
    const { remote, calls } = makeRemote();

    const result = await runAdrSync(db, "cfg1", "manual", {
      remoteFactory: async () => remote,
    });

    expect(result.status).toBe("success");
    expect(result.skipped).toBe(1);
    expect(result.created).toBe(0);
    expect(calls.getBlob).toBe(0);
  });

  it("soft-deletes a document whose file vanished, never hard-deletes", async () => {
    db.adrSyncConfig.findUnique.mockResolvedValue(CONFIG as never);
    db.adrDocument.findMany.mockResolvedValue([
      {
        id: "doc-gone",
        repositoryId: "repo1",
        path: "docs/adr/0000-removed.md",
        contentHash: "old",
        deletedAt: null,
        number: 0,
        statusRaw: null,
        body: "",
      },
    ] as never);
    const { remote } = makeRemote();

    const result = await runAdrSync(db, "cfg1", "manual", {
      remoteFactory: async () => remote,
    });

    expect(result.deleted).toBe(1);
    expect(db.adrDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "doc-gone" },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
    expect(db.adrDocument.delete).not.toHaveBeenCalled();
    expect(db.adrDocument.deleteMany).not.toHaveBeenCalled();
  });

  it("records a per-file failure and continues instead of failing the run", async () => {
    db.adrSyncConfig.findUnique.mockResolvedValue(CONFIG as never);
    const { remote } = makeRemote({
      getBlob: vi.fn(async () => {
        throw new Error("boom: blob unreadable");
      }),
    });

    const result = await runAdrSync(db, "cfg1", "manual", {
      remoteFactory: async () => remote,
    });

    expect(result.status).toBe("success");
    expect(result.failed).toBe(1);
    expect(result.items).toContainEqual(
      expect.objectContaining({
        path: "docs/adr/0001-use-postgres.md",
        action: "failed",
        reason: expect.stringContaining("boom"),
      }),
    );
    // The per-file outcome is persisted onto the run ledger, not just returned.
    expect(db.adrSyncRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run1" },
        data: expect.objectContaining({
          status: "success",
          failed: 1,
          items: expect.arrayContaining([
            expect.objectContaining({ action: "failed" }),
          ]),
        }),
      }),
    );
  });

  it("skips an unfilled template file and records it in the run items", async () => {
    db.adrSyncConfig.findUnique.mockResolvedValue(CONFIG as never);
    const { remote } = makeRemote({
      getBlob: vi.fn(
        async () =>
          `# Template\n\nStatus: Proposed | Accepted | Rejected | Deprecated | Superseded\n`,
      ),
    });

    const result = await runAdrSync(db, "cfg1", "manual", {
      remoteFactory: async () => remote,
    });

    expect(result.status).toBe("success");
    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.items).toContainEqual(
      expect.objectContaining({ action: "skipped-template" }),
    );
  });

  it("does NOT advance lastTreeSha when any file failed, so the next run retries", async () => {
    db.adrSyncConfig.findUnique.mockResolvedValue(CONFIG as never);
    const { remote } = makeRemote({
      getBlob: vi.fn(async () => {
        throw new Error("rate limited");
      }),
    });

    await runAdrSync(db, "cfg1", "manual", {
      remoteFactory: async () => remote,
    });

    expect(db.adrSyncConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastTreeSha: null }),
      }),
    );
  });

  it("fails the run on a truncated tree listing instead of mass-soft-deleting", async () => {
    db.adrSyncConfig.findUnique.mockResolvedValue(CONFIG as never);
    db.adrDocument.findMany.mockResolvedValue([
      {
        id: "doc1",
        path: "docs/adr/0001-use-postgres.md",
        contentHash: "b1",
        deletedAt: null,
      },
    ] as never);
    const base = makeRemote();
    const { remote } = makeRemote({
      getTree: vi.fn(async (o, r, sha, recursive) => {
        if (sha === "t-adr" && recursive) {
          return { truncated: true, entries: [] };
        }
        return base.remote.getTree(o, r, sha, recursive);
      }),
    });

    const result = await runAdrSync(db, "cfg1", "manual", {
      remoteFactory: async () => remote,
    });

    expect(result.status).toBe("error");
    expect(result.error).toContain("truncated");
    // No soft-deletes and no short-circuit key advanced.
    expect(db.adrDocument.update).not.toHaveBeenCalled();
    expect(db.adrSyncConfig.update).not.toHaveBeenCalled();
  });

  it("recomputes SUPERSEDES edges for the repo after upserting", async () => {
    db.adrSyncConfig.findUnique.mockResolvedValue(CONFIG as never);
    // First findMany: existing docs (pre-sync). Second: fresh repo docs for
    // link derivation, one of which declares supersession.
    db.adrDocument.findMany
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([
        {
          id: "old",
          repositoryId: "repo1",
          number: 1,
          statusRaw: "Superseded by ADR-0002",
          body: "",
        },
        { id: "new", repositoryId: "repo1", number: 2, statusRaw: "Accepted", body: "" },
      ] as never);
    const { remote } = makeRemote();

    const result = await runAdrSync(db, "cfg1", "manual", {
      remoteFactory: async () => remote,
    });

    expect(result.status).toBe("success");
    expect(db.adrLink.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { type: "SUPERSEDES", from: { repositoryId: "repo1" } },
          { type: "MENTIONS", from: { repositoryId: "repo1" } },
          { type: "MENTIONS", to: { repositoryId: "repo1" } },
        ],
      },
    });
    expect(db.adrLink.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          type: "SUPERSEDES",
          fromId: "new",
          toId: "old",
        }),
      ],
      skipDuplicates: true,
    });
  });

  it("recomputes cross-repo MENTIONS in both directions without refetching other repos", async () => {
    db.adrSyncConfig.findUnique.mockResolvedValue(CONFIG as never);
    db.adrSyncConfig.findMany.mockResolvedValue([
      { repositoryId: "repo1", shortCode: "API", repository: { fullName: "acme/api" } },
      { repositoryId: "repo2", shortCode: "PIPE", repository: { fullName: "acme/pipeline" } },
    ] as never);
    db.adrDocument.findMany
      .mockResolvedValueOnce([] as never) // pre-sync existing docs
      .mockResolvedValueOnce([
        // this repo's doc mentions the other repo's ADR by short code…
        {
          id: "api-1",
          repositoryId: "repo1",
          number: 1,
          statusRaw: "Accepted",
          body: "See PIPE-0002 for the other half of this decision.",
        },
        // …and the other repo's STORED body names this repo + a number.
        {
          id: "pipe-2",
          repositoryId: "repo2",
          number: 2,
          statusRaw: "Accepted",
          body: "The api half lives in acme/api as 0001.",
        },
      ] as never);
    const { remote } = makeRemote();

    const result = await runAdrSync(db, "cfg1", "manual", {
      remoteFactory: async () => remote,
    });

    expect(result.status).toBe("success");
    const created = db.adrLink.createMany.mock.calls[0]?.[0] as {
      data: Array<{ type: string; fromId: string; toId: string; evidence: string | null }>;
    };
    const mentions = created.data.filter((l) => l.type === "MENTIONS");
    expect(mentions).toContainEqual(
      expect.objectContaining({
        fromId: "api-1",
        toId: "pipe-2",
        evidence: expect.stringContaining("PIPE-0002"),
      }),
    );
    expect(mentions).toContainEqual(
      expect.objectContaining({
        fromId: "pipe-2",
        toId: "api-1",
        evidence: expect.stringContaining("acme/api"),
      }),
    );
  });

  it("errors the run (not the sweep) when the config is disconnected", async () => {
    db.adrSyncConfig.findUnique.mockResolvedValue({
      ...CONFIG,
      integrationId: null,
      integration: null,
    } as never);

    const result = await runAdrSync(db, "cfg1", "manual", {
      remoteFactory: async () => makeRemote().remote,
    });

    expect(result.status).toBe("error");
    expect(result.error).toContain("disconnected");
    expect(db.adrSyncRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "error" }),
      }),
    );
  });
});
