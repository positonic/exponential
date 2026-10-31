/**
 * Databases against a real Postgres (ADR-0078): the migration applies (GIN
 * index included), the GIN-backed filters return the right rows, access to
 * rows resolves through the holding page, rows stay out of the Pages list
 * while the access where-clause still admits them, removing the block
 * detaches and the purge deletes, and deleting the database or the holding
 * page cascades to the rows.
 */
import { describe, it, expect, beforeEach } from "vitest";

import { getTestDb } from "~/test/test-db";
import { createTestCaller } from "~/test/trpc-helpers";
import { createUser, createWorkspace, addWorkspaceMember, createKnowledgePage } from "~/test/factories";
import { buildKnowledgePageAccessWhere } from "~/server/services/access";
import { purgeDetachedDatabases } from "~/server/services/databases/lifecycle";
import { databaseMarker } from "~/lib/databases/marker";

type Db = ReturnType<typeof getTestDb>;

/** An owner, a member and a viewer in one workspace, plus a page the owner holds. */
async function setup(db: Db, slug: string) {
  const owner = await createUser(db);
  const member = await createUser(db);
  const viewer = await createUser(db);
  const outsider = await createUser(db);
  const ws = await createWorkspace(db, { ownerId: owner.id, slug });
  await addWorkspaceMember(db, ws.id, member.id, "member");
  await addWorkspaceMember(db, ws.id, viewer.id, "viewer");
  const page = await createKnowledgePage(db, {
    createdById: owner.id,
    workspaceId: ws.id,
    title: "Data strategy",
    body: "# Data strategy\n\nIntro.",
  });
  return { owner, member, viewer, outsider, ws, page };
}

/** The tracer: a Metrics database with a select, a number, and two rows, its marker in the page body. */
async function seedMetrics(db: Db, ownerId: string, pageId: string) {
  const caller = createTestCaller(ownerId);
  const database = await caller.database.create({ pageId, name: "Metrics" });
  const { property: status } = await caller.database.addProperty({
    id: database.id,
    name: "Status",
    type: "select",
    options: [{ name: "Not measured" }, { name: "Instrumenting" }, { name: "Tracked" }],
  });
  const { property: score } = await caller.database.addProperty({
    id: database.id,
    name: "Score",
    type: "number",
  });
  const latency = await caller.database.createRow({
    id: database.id,
    values: { Name: "Alert latency", Status: "Tracked", Score: 7 },
  });
  const coverage = await caller.database.createRow({
    id: database.id,
    values: { Name: "Coverage", Status: "Instrumenting", Score: 42 },
  });
  const { docVersion } = await db.knowledgePage.findUniqueOrThrow({
    where: { id: pageId },
    select: { docVersion: true },
  });
  await caller.page.update({
    id: pageId,
    body: `# Data strategy\n\nIntro.\n\n${database.marker}`,
    baseVersion: docVersion,
  });
  return { caller, database, status, score, latency, coverage };
}

describe("database router (integration)", () => {
  let db: Db;
  beforeEach(() => {
    db = getTestDb();
  });

  it("the tracer: create, add properties, add rows, read the page with its table and the row with its header", async () => {
    const { owner, page } = await setup(db, "db-tracer");
    const { caller, database, status, latency, coverage } = await seedMetrics(db, owner.id, page.id);

    const read = await caller.page.get({ id: page.id, format: "markdown" });
    expect(read.body).toContain(databaseMarker(database.id));
    expect(read.body).toContain("| Name | Status | Score |");
    expect(read.body).toContain(`| [Alert latency](/w/db-tracer/pages/${latency.id}) | Tracked | 7 |`);
    expect(read.body).toContain(`| [Coverage](/w/db-tracer/pages/${coverage.id}) | Instrumenting | 42 |`);

    const row = await caller.page.get({ id: latency.id, format: "markdown" });
    expect(row.body).toBe("**Status:** Tracked\n**Score:** 7");
    expect(row.database).toEqual({
      id: database.id,
      name: "Metrics",
      pageId: page.id,
      pageTitle: "Data strategy",
      header: "**Status:** Tracked\n**Score:** 7",
    });
    // The editor's read gets the prose only (null here) and the header beside it.
    const full = await caller.page.get({ id: latency.id });
    expect(full.body).toBeNull();
    expect(full.database?.header).toBe("**Status:** Tracked\n**Score:** 7");

    const stored = await db.knowledgePage.findUniqueOrThrow({ where: { id: latency.id } });
    expect(stored.databaseId).toBe(database.id);
    expect(stored.workspaceId).toBe(page.workspaceId);
    // Values are keyed by property id and hold the option id, not its name.
    const tracked = status.options!.find((o) => o.name === "Tracked")!.id;
    expect(stored.properties).toMatchObject({ [status.id]: tracked });
    // The stored body of the holding page holds the marker, never the rows.
    const holder = await db.knowledgePage.findUniqueOrThrow({ where: { id: page.id } });
    expect(holder.body).not.toContain("Alert latency");
  });

  it("filters and sorts through the compiled query against the GIN index", async () => {
    const { owner, page } = await setup(db, "db-query");
    const { caller, database, status, score, latency, coverage } = await seedMetrics(db, owner.id, page.id);

    const tracked = await caller.database.listRows({
      id: database.id,
      view: { filters: [{ propertyId: status.id, op: "eq", value: "Tracked" }], hiddenPropertyIds: [], propertyOrder: [] },
    });
    expect(tracked.rows.map((r) => r.id)).toEqual([latency.id]);

    const high = await caller.database.listRows({
      id: database.id,
      view: { filters: [{ propertyId: score.id, op: "gt", value: 10 }], hiddenPropertyIds: [], propertyOrder: [] },
    });
    expect(high.rows.map((r) => r.id)).toEqual([coverage.id]);

    await caller.database.update({
      id: database.id,
      view: { sort: { propertyId: score.id, direction: "desc" }, filters: [], hiddenPropertyIds: [], propertyOrder: [] },
    });
    const sorted = await caller.database.listRows({ id: database.id, limit: 1 });
    expect(sorted.rows.map((r) => r.id)).toEqual([coverage.id]);
    expect(sorted.nextCursor).toBe("1");
    const nextPage = await caller.database.listRows({ id: database.id, limit: 1, cursor: sorted.nextCursor! });
    expect(nextPage.rows.map((r) => r.id)).toEqual([latency.id]);
    expect(nextPage.nextCursor).toBeNull();

    const anyOf = await caller.database.listRows({
      id: database.id,
      view: { filters: [{ propertyId: status.id, op: "anyOf", value: ["Tracked", "Instrumenting"] }], hiddenPropertyIds: [], propertyOrder: [] },
    });
    expect(anyOf.rows).toHaveLength(2);
  });

  it("rejects a value of the wrong type naming the property, and writes nothing", async () => {
    const { owner, page } = await setup(db, "db-typed");
    const { caller, database } = await seedMetrics(db, owner.id, page.id);
    await expect(
      caller.database.createRow({ id: database.id, values: { Name: "Bad", Score: "many" } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: 'Property "Score" expects a number, got "many"' });
    expect(await db.knowledgePage.count({ where: { databaseId: database.id } })).toBe(2);
  });

  it("access to rows resolves through the holding page: viewers read, members write, outsiders see nothing", async () => {
    const { owner, member, viewer, outsider, page } = await setup(db, "db-access");
    const { database, status, latency } = await seedMetrics(db, owner.id, page.id);

    const asViewer = createTestCaller(viewer.id);
    expect((await asViewer.database.listRows({ id: database.id })).rows).toHaveLength(2);
    await expect(asViewer.database.createRow({ id: database.id, values: {} })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(asViewer.page.get({ id: latency.id })).resolves.toMatchObject({ canEdit: false });

    const asMember = createTestCaller(member.id);
    const updated = await asMember.database.updateRow({ rowId: latency.id, values: { Status: "Not measured" } });
    const notMeasured = status.options!.find((o) => o.name === "Not measured")!.id;
    expect(updated.values[status.id]).toBe(notMeasured);
    const revisions = await db.knowledgePageRevision.findMany({ where: { pageId: latency.id }, orderBy: { createdAt: "asc" } });
    expect(revisions.map((r) => r.kind)).toEqual(["create", "properties"]);
    expect(revisions[1]!.properties).toEqual(updated.values);

    // Restoring the row's first revision brings the values back with it.
    const first = revisions[0]!;
    await asMember.page.restore({ id: latency.id, revisionId: first.id });
    const restored = await db.knowledgePage.findUniqueOrThrow({ where: { id: latency.id } });
    expect(restored.properties).toEqual(first.properties);
    expect((restored.properties as Record<string, unknown>)[status.id]).not.toBe(notMeasured);

    const asOutsider = createTestCaller(outsider.id);
    await expect(asOutsider.page.get({ id: latency.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(asOutsider.database.listRows({ id: database.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("an invite-only holding page shuts its rows to a workspace member, whatever the row's copied placement", async () => {
    const { owner, member, page } = await setup(db, "db-invite");
    const { database, latency } = await seedMetrics(db, owner.id, page.id);
    await db.knowledgePage.update({ where: { id: page.id }, data: { isInviteOnly: true } });

    const asMember = createTestCaller(member.id);
    await expect(asMember.page.get({ id: latency.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(asMember.database.get({ id: database.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const visible = await db.knowledgePage.findMany({ where: buildKnowledgePageAccessWhere(member.id), select: { id: true } });
    expect(visible.map((p) => p.id)).not.toContain(latency.id);
  });

  it("rows stay out of the Pages list and tree while the access where-clause still admits them", async () => {
    const { owner, member, ws, page } = await setup(db, "db-list");
    const { latency, coverage } = await seedMetrics(db, owner.id, page.id);

    const asMember = createTestCaller(member.id);
    const listed = (await asMember.page.list({ workspaceId: ws.id })).map((p) => p.id);
    expect(listed).toContain(page.id);
    expect(listed).not.toContain(latency.id);
    expect((await asMember.page.tree({ workspaceId: ws.id })).map((p) => p.id)).toEqual([page.id]);

    // What `page.search` scopes by: the member can reach the rows.
    const admitted = await db.knowledgePage.findMany({
      where: { AND: [buildKnowledgePageAccessWhere(member.id), { workspaceId: ws.id }] },
      select: { id: true },
    });
    expect(admitted.map((p) => p.id).sort()).toEqual([page.id, latency.id, coverage.id].sort());
  });

  it("page.* refuses to move, publish or delete a row", async () => {
    const { owner, ws, page } = await setup(db, "db-guard");
    const { caller, latency } = await seedMetrics(db, owner.id, page.id);
    await expect(caller.page.move({ id: latency.id, workspaceId: ws.id, projectId: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.page.publish({ id: latency.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.page.delete({ id: latency.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await db.knowledgePage.count({ where: { id: latency.id } })).toBe(1);
  });

  it("removing the marker detaches, writing it back re-attaches, and the purge deletes after the window", async () => {
    const { owner, page } = await setup(db, "db-detach");
    const { caller, database } = await seedMetrics(db, owner.id, page.id);

    const version = async () =>
      (await db.knowledgePage.findUniqueOrThrow({ where: { id: page.id }, select: { docVersion: true } })).docVersion;

    await caller.page.update({ id: page.id, body: "# Data strategy\n\nNo block any more.", baseVersion: await version() });
    const detached = await db.pageDatabase.findUniqueOrThrow({ where: { id: database.id } });
    expect(detached.detachedAt).toBeInstanceOf(Date);
    expect(await db.knowledgePage.count({ where: { databaseId: database.id } })).toBe(2);
    expect((await caller.database.list({ pageId: page.id }))[0]!.detachedAt).not.toBeNull();

    await caller.page.update({ id: page.id, body: `# Back\n\n${database.marker}`, baseVersion: await version() });
    expect((await db.pageDatabase.findUniqueOrThrow({ where: { id: database.id } })).detachedAt).toBeNull();

    await caller.page.update({ id: page.id, body: "# Gone again", baseVersion: await version() });
    // Still inside the window: nothing happens.
    expect((await purgeDetachedDatabases(db, new Date())).purged).toEqual([]);
    const later = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
    const result = await purgeDetachedDatabases(db, later);
    expect(result.purged).toEqual([{ id: database.id, rowCount: 2 }]);
    expect(await db.pageDatabase.count({ where: { id: database.id } })).toBe(0);
    expect(await db.knowledgePage.count({ where: { databaseId: database.id } })).toBe(0);
  });

  it("relations (V3 tracer): a relation to another database writes edges both ways and the reverse column appears on its own", async () => {
    const { owner, page } = await setup(db, "db-relations");
    const { caller, database: metrics, latency, coverage } = await seedMetrics(db, owner.id, page.id);
    const problems = await caller.database.create({ pageId: page.id, name: "Problems" });
    const gaps = await caller.database.createRow({ id: problems.id, values: { Name: "Gaps" } });
    const noise = await caller.database.createRow({ id: problems.id, values: { Name: "Noise" } });

    // Metrics → Problems; Problems grows a "Metrics" column nobody created.
    const added = await caller.database.addProperty({
      id: metrics.id,
      name: "Problems",
      type: "relation",
      relation: { targetKind: "ROW", targetDatabaseId: problems.id },
    });
    expect(added.property.relation).toEqual({ targetKind: "ROW", targetDatabaseId: problems.id, many: true });
    expect(added.reverse?.databaseId).toBe(problems.id);
    const reverse = added.reverse!.property;
    expect(reverse).toMatchObject({
      name: "Metrics",
      type: "relation",
      relation: { targetKind: "ROW", targetDatabaseId: metrics.id, inverseOf: { databaseId: metrics.id, propertyId: added.property.id } },
    });
    const problemsDef = await caller.database.get({ id: problems.id });
    expect(problemsDef.properties.map((p) => p.name)).toEqual(["Name", "Metrics"]);

    // Set one cell by name, CLI-style: a comma-separated list of row ids.
    const written = await caller.database.updateRow({ rowId: latency.id, values: { Problems: `${gaps.id},${noise.id}` } });
    expect(written.relations[added.property.id]!.map((t) => [t.id, t.title, t.href])).toEqual([
      [gaps.id, "Gaps", `/w/db-relations/pages/${gaps.id}`],
      [noise.id, "Noise", `/w/db-relations/pages/${noise.id}`],
    ]);
    // Nothing landed in the values column.
    const stored = await db.knowledgePage.findUniqueOrThrow({ where: { id: latency.id } });
    expect(Object.keys(stored.properties as Record<string, unknown>)).not.toContain(added.property.id);

    // The other side reads the reverse value without anyone writing it.
    const problemRows = await caller.database.listRows({ id: problems.id });
    const byTitle = new Map(problemRows.rows.map((r) => [r.title, r]));
    expect(byTitle.get("Gaps")!.relations[reverse.id]!.map((t) => t.title)).toEqual(["Alert latency"]);
    expect(byTitle.get("Noise")!.relations[reverse.id]!.map((t) => t.title)).toEqual(["Alert latency"]);

    // Rewriting the cell replaces the edges on both sides; a second metric appends on the target.
    await caller.database.updateRow({ rowId: latency.id, values: { Problems: [gaps.id] } });
    await caller.database.updateRow({ rowId: coverage.id, values: { Problems: [gaps.id] } });
    const again = await caller.database.listRows({ id: problems.id });
    const rows = new Map(again.rows.map((r) => [r.title, r]));
    expect(rows.get("Gaps")!.relations[reverse.id]!.map((t) => t.title)).toEqual(["Alert latency", "Coverage"]);
    expect(rows.get("Noise")!.relations[reverse.id]).toEqual([]);

    // Writing from the reverse side keeps the forward side in step too.
    await caller.database.updateRow({ rowId: noise.id, values: { Metrics: [coverage.id] } });
    const metricRows = await caller.database.listRows({ id: metrics.id });
    const coverageRow = metricRows.rows.find((r) => r.id === coverage.id)!;
    expect(coverageRow.relations[added.property.id]!.map((t) => t.title).sort()).toEqual(["Gaps", "Noise"]);

    // The page's Markdown (the Metrics table is the one in the body) and a row header carry the links.
    const read = await caller.page.get({ id: page.id, format: "markdown" });
    expect(read.body).toContain("| Name | Status | Score | Problems |");
    expect(read.body).toContain(
      `| [Alert latency](/w/db-relations/pages/${latency.id}) | Tracked | 7 | [Gaps](/w/db-relations/pages/${gaps.id}) |`,
    );
    const rowRead = await caller.page.get({ id: gaps.id, format: "markdown" });
    expect(rowRead.body).toBe(
      `**Metrics:** [Alert latency](/w/db-relations/pages/${latency.id}), [Coverage](/w/db-relations/pages/${coverage.id})`,
    );

    // A target that is not a row of the related database is refused naming the property.
    await expect(
      caller.database.updateRow({ rowId: latency.id, values: { Problems: [latency.id] } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining('"Problems"') as string });

    // Deleting a row takes its edges on both sides with it.
    await caller.database.deleteRow({ rowId: gaps.id });
    expect(await db.databaseRelation.count({ where: { OR: [{ rowPageId: gaps.id }, { targetRowPageId: gaps.id }] } })).toBe(0);
  });

  it("a relation cannot point outside the workspace, and listInWorkspace offers only readable, attached databases", async () => {
    const { owner, viewer, outsider, page, ws } = await setup(db, "db-relations-ws");
    const { caller, database } = await seedMetrics(db, owner.id, page.id);
    const other = await setup(db, "db-relations-other");
    const foreign = await createTestCaller(other.owner.id).database.create({ pageId: other.page.id, name: "Elsewhere" });
    await expect(
      caller.database.addProperty({ id: database.id, name: "Far", type: "relation", relation: { targetKind: "ROW", targetDatabaseId: foreign.id } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("same workspace") as string });

    expect((await caller.database.listInWorkspace({ workspaceId: ws.id })).map((d) => d.name)).toEqual(["Metrics"]);
    expect((await createTestCaller(viewer.id).database.listInWorkspace({ workspaceId: ws.id })).map((d) => d.name)).toEqual(["Metrics"]);
    expect(await createTestCaller(outsider.id).database.listInWorkspace({ workspaceId: ws.id })).toEqual([]);
  });

  it("deleting the database, or the holding page, takes the rows with it", async () => {
    const { owner, page } = await setup(db, "db-cascade");
    const { caller, database, latency } = await seedMetrics(db, owner.id, page.id);

    await expect(caller.database.delete({ id: database.id })).resolves.toEqual({ id: database.id, rowCount: 2 });
    expect(await db.knowledgePage.count({ where: { id: latency.id } })).toBe(0);

    const second = await caller.database.create({ pageId: page.id, name: "Problems" });
    const row = await caller.database.createRow({ id: second.id, values: { Name: "Gaps" } });
    await db.knowledgePage.delete({ where: { id: page.id } });
    expect(await db.pageDatabase.count({ where: { id: second.id } })).toBe(0);
    expect(await db.knowledgePage.count({ where: { id: row.id } })).toBe(0);
  });

  it("a row page cannot hold a database, and the CLI round-trip of an expanded body writes no rows", async () => {
    const { owner, page } = await setup(db, "db-roundtrip");
    const { caller, database, latency } = await seedMetrics(db, owner.id, page.id);
    await expect(caller.database.create({ pageId: latency.id, name: "Nested" })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // Read expanded, write the same text back (what `pages update --body` does).
    const expanded = await caller.page.get({ id: page.id, format: "markdown" });
    await caller.page.update({ id: page.id, body: `${expanded.body}\n\nAppended by the CLI.`, baseVersion: expanded.docVersion });
    const stored = await db.knowledgePage.findUniqueOrThrow({ where: { id: page.id } });
    // The marker survives and the projected table is stripped from what is
    // stored; the database stays attached and its rows untouched.
    expect(stored.body).toContain(databaseMarker(database.id));
    expect(stored.body).not.toContain("| Name | Status | Score |");
    expect((await db.pageDatabase.findUniqueOrThrow({ where: { id: database.id } })).detachedAt).toBeNull();
    expect(await db.knowledgePage.count({ where: { databaseId: database.id } })).toBe(2);
    const reread = await caller.page.get({ id: page.id, format: "markdown" });
    expect(reread.body).toContain("Appended by the CLI.");
    // Exactly one table on re-read, not one per round trip.
    expect(reread.body!.split("| Name | Status | Score |").length - 1).toBe(1);
  });
});
