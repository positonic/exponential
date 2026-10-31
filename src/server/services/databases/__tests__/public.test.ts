/**
 * Databases on a published page (ADR-0078 §4): tables projected for the
 * public render, titles linking only to published rows; a row page's header.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import { publicDatabaseTables, publicRowHeader } from "../public";

const db = mockDeep<PrismaClient>();
const TITLE = "ptitle000001";
const STATUS = "pstatus00001";
const OWNER = "powner000001";

beforeEach(() => {
  mockReset(db);
  db.user.findMany.mockResolvedValue([{ id: "u-ana", name: "Ana", email: null }] as never);
});

describe("publicDatabaseTables", () => {
  it("projects visible columns in view order and links only published rows", async () => {
    db.pageDatabase.findMany.mockResolvedValue([
      {
        id: "db1",
        name: "Metrics",
        properties: [
          { id: TITLE, name: "Name", type: "title" },
          { id: STATUS, name: "Status", type: "select", options: [{ id: "o_tr", name: "Tracked", color: "green" }] },
          { id: OWNER, name: "Owner", type: "person" },
        ],
        view: { filters: [], hiddenPropertyIds: [OWNER], propertyOrder: [STATUS, TITLE, OWNER] },
        titlePropertyId: TITLE,
      },
    ] as never);
    db.$queryRaw.mockResolvedValue([
      { id: "r1", title: "Alert latency", properties: { [STATUS]: "o_tr", [OWNER]: ["u-ana"] }, databaseId: "db1", createdById: "u-ana", createdAt: new Date(), updatedAt: new Date() },
      { id: "r2", title: "", properties: {}, databaseId: "db1", createdById: "u-ana", createdAt: new Date(), updatedAt: new Date() },
    ] as never);
    db.knowledgePage.findMany.mockResolvedValue([{ id: "r1", publicId: "abcd1234", publicSlug: "alert-latency" }] as never);

    const tables = await publicDatabaseTables(db, "page-1");
    const metrics = tables.get("db1")!;
    expect(metrics.name).toBe("Metrics");
    expect(metrics.columns).toEqual(["Status", "Name"]);
    expect(metrics.rows).toEqual([
      { cells: ["Tracked", "Alert latency"], href: "/p/alert-latency-abcd1234" },
      { cells: ["", "Untitled"] },
    ]);
    // Only attached databases of this page are projected.
    expect(db.pageDatabase.findMany.mock.calls[0]![0]).toMatchObject({ where: { pageId: "page-1", detachedAt: null } });
  });

  it("returns an empty map for a page without databases", async () => {
    db.pageDatabase.findMany.mockResolvedValue([] as never);
    expect((await publicDatabaseTables(db, "page-1")).size).toBe(0);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
});

describe("publicRowHeader", () => {
  it("lists every non-title property with its display value, people by name", async () => {
    db.pageDatabase.findUnique.mockResolvedValue({
      name: "Metrics",
      pageId: "page-1",
      properties: [
        { id: TITLE, name: "Name", type: "title" },
        { id: STATUS, name: "Status", type: "select", options: [{ id: "o_tr", name: "Tracked", color: "green" }] },
        { id: OWNER, name: "Owner", type: "person" },
        { id: "pby", name: "Added by", type: "createdBy" },
      ],
    } as never);
    const header = await publicRowHeader(db, {
      id: "r1",
      databaseId: "db1",
      properties: { [STATUS]: "o_tr", [OWNER]: ["u-ana"] },
      createdAt: new Date("2026-10-03T00:00:00Z"),
      updatedAt: new Date("2026-10-04T00:00:00Z"),
      createdById: "u-ana",
    });
    expect(header).toEqual({
      database: { name: "Metrics", pageId: "page-1" },
      fields: [
        { name: "Status", value: "Tracked" },
        { name: "Owner", value: "Ana" },
        { name: "Added by", value: "Ana" },
      ],
    });
  });

  it("is null for an ordinary page", async () => {
    expect(await publicRowHeader(db, { id: "p", databaseId: null, properties: null, createdAt: new Date(), updatedAt: new Date(), createdById: "u" })).toBeNull();
  });
});
