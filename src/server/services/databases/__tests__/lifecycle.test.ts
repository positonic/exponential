/**
 * Detach, re-attach, delete and purge (ADR-0078): removing the block only
 * marks the database detached; rows go on explicit delete or after the
 * retention window.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

const clearPageChunksMany = vi.fn();
vi.mock("~/server/services/embedding/EmbeddingTriggerService", () => ({
  getEmbeddingTriggerService: () => ({ clearPageChunksMany }),
}));

import { databaseIdsInBody, syncPageDatabases } from "../sync";
import {
  DETACHED_DATABASE_RETENTION_DAYS,
  deleteDatabase,
  purgeDetachedDatabases,
} from "../lifecycle";
import { databaseMarker } from "~/lib/databases/marker";

const db = mockDeep<PrismaClient>();
const NOW = new Date("2026-10-31T12:00:00Z");

beforeEach(() => {
  mockReset(db);
  clearPageChunksMany.mockReset();
  db.pageDatabase.updateMany.mockResolvedValue({ count: 0 });
});

describe("databaseIdsInBody", () => {
  it("reads the doc when there is one, else the Markdown markers", () => {
    const doc = { type: "doc", content: [{ type: "database", attrs: { databaseId: "a" } }] };
    expect(databaseIdsInBody({ doc, body: databaseMarker("b") })).toEqual(["a"]);
    expect(databaseIdsInBody({ doc: null, body: `x\n${databaseMarker("b")}\n` })).toEqual(["b"]);
    expect(databaseIdsInBody({})).toEqual([]);
  });
});

describe("syncPageDatabases", () => {
  it("detaches the page's databases whose block is gone and re-attaches the present ones", async () => {
    await syncPageDatabases(db, "page-1", { body: databaseMarker("keep") }, NOW);
    expect(db.pageDatabase.updateMany).toHaveBeenNthCalledWith(1, {
      where: { pageId: "page-1", detachedAt: null, id: { notIn: ["keep"] } },
      data: { detachedAt: NOW },
    });
    expect(db.pageDatabase.updateMany).toHaveBeenNthCalledWith(2, {
      where: { pageId: "page-1", id: { in: ["keep"] }, detachedAt: { not: null } },
      data: { detachedAt: null },
    });
  });

  it("with no block left, detaches every attached database of the page and touches no other page", async () => {
    await syncPageDatabases(db, "page-1", { doc: { type: "doc", content: [] } }, NOW);
    expect(db.pageDatabase.updateMany).toHaveBeenCalledTimes(1);
    expect(db.pageDatabase.updateMany).toHaveBeenCalledWith({
      where: { pageId: "page-1", detachedAt: null },
      data: { detachedAt: NOW },
    });
  });
});

describe("deleteDatabase", () => {
  it("deletes the database (rows cascade) and clears the rows' chunks in one go", async () => {
    db.knowledgePage.findMany.mockResolvedValue([{ id: "r1" }, { id: "r2" }] as never);
    db.pageDatabase.delete.mockResolvedValue({} as never);
    const result = await deleteDatabase(db, "db-1");
    expect(result).toEqual({ id: "db-1", rowCount: 2 });
    expect(db.pageDatabase.delete).toHaveBeenCalledWith({ where: { id: "db-1" } });
    expect(clearPageChunksMany).toHaveBeenCalledWith(["r1", "r2"]);
  });
});

describe("purgeDetachedDatabases", () => {
  it("purges only databases detached before the cutoff, one at a time, and reports failures", async () => {
    db.pageDatabase.findMany.mockResolvedValue([{ id: "old-1" }, { id: "old-2" }] as never);
    db.knowledgePage.findMany.mockResolvedValue([] as never);
    db.pageDatabase.delete
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(new Error("locked"));

    const result = await purgeDetachedDatabases(db, NOW);
    const expectedCutoff = new Date(NOW.getTime() - DETACHED_DATABASE_RETENTION_DAYS * 86_400_000);
    expect(result.cutoff).toEqual(expectedCutoff);
    expect(db.pageDatabase.findMany.mock.calls[0]![0]).toMatchObject({
      where: { detachedAt: { lt: expectedCutoff } },
    });
    expect(result.purged).toEqual([{ id: "old-1", rowCount: 0 }]);
    expect(result.errors).toEqual([{ id: "old-2", message: "locked" }]);
  });
});
