/**
 * The action-kind agenda item end to end (ADR-0059, V9): `addAgendaItem`
 * crosses the Action write module's gates and writes the Action, its
 * assignee and its occurrence link for real; `getOccurrence` then reads the
 * Action's live state, and completing the Action elsewhere shows on the next
 * read with no regeneration.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "~/test/test-db";
import { createTestCaller } from "~/test/trpc-helpers";
import { createUser, createWorkspace, createProject, addWorkspaceMember } from "~/test/factories";

describe("ceremony agenda action items", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  async function setup() {
    const owner = await createUser(db);
    const zineb = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: owner.id });
    await addWorkspaceMember(db, ws.id, zineb.id);
    const project = await createProject(db, { createdById: owner.id, workspaceId: ws.id });
    const ceremony = await db.ceremony.create({
      data: {
        workspaceId: ws.id,
        name: "Product Prioritisation",
        slug: "product-prioritisation",
        timezone: "UTC",
        startsOn: new Date("2026-11-01T00:00:00Z"),
        ownerId: owner.id,
        createdById: owner.id,
        projects: { create: { projectId: project.id } },
      },
    });
    const occurrence = await db.ceremonyOccurrence.create({
      data: {
        ceremonyId: ceremony.id,
        workspaceId: ws.id,
        scheduledStart: new Date("2026-11-10T10:00:00Z"),
        scheduledEnd: new Date("2026-11-10T11:00:00Z"),
        definitionSnapshot: {},
        agenda: {
          version: 1,
          generatedAt: "2026-11-09T10:00:00Z",
          sections: [{ key: "actions", type: "free_text", title: "Action points", items: [] }],
        },
      },
    });
    return { owner, zineb, ws, project, occurrence };
  }

  it("creates exactly one Action owned by the assignee, in the ceremony's project, linked to the occurrence", async () => {
    const { owner, zineb, ws, project, occurrence } = await setup();
    const caller = createTestCaller(owner.id);

    const res = await caller.ceremony.addAgendaItem({
      workspaceId: ws.id,
      occurrenceId: occurrence.id,
      sectionKey: "actions",
      kind: "action",
      title: "Respond to stakeholders with revised success metrics",
      assigneeId: zineb.id,
      dueDate: new Date("2026-11-14T00:00:00Z"),
    });

    const actions = await db.action.findMany({ where: { occurrenceId: occurrence.id }, include: { assignees: true } });
    expect(actions).toHaveLength(1);
    const action = actions[0]!;
    expect(action).toMatchObject({ projectId: project.id, workspaceId: ws.id, source: "ceremony", status: "ACTIVE" });
    expect(action.assignees.map((a) => a.userId)).toEqual([zineb.id]);
    const item = res.agenda.sections[0]!.items[0]!;
    expect(item).toMatchObject({ refType: "action", refId: action.id, addedByUserId: owner.id });

    // Completed elsewhere: the next read shows it, with no regeneration.
    await db.action.update({ where: { id: action.id }, data: { status: "COMPLETED", completedAt: new Date() } });
    const read = await caller.ceremony.getOccurrence({ workspaceId: ws.id, occurrenceId: occurrence.id });
    expect(read.agenda?.sections[0]!.items[0]!.live).toMatchObject({ kind: "action", status: "COMPLETED" });
  });

  it("ticking the item completes the Action; unticking reopens it", async () => {
    const { owner, zineb, ws, occurrence } = await setup();
    const caller = createTestCaller(owner.id);
    const added = await caller.ceremony.addAgendaItem({
      workspaceId: ws.id,
      occurrenceId: occurrence.id,
      sectionKey: "actions",
      kind: "action",
      title: "Send the deck",
      assigneeId: zineb.id,
    });
    const item = added.agenda.sections[0]!.items[0]!;

    await caller.ceremony.resolveAgendaItem({ workspaceId: ws.id, occurrenceId: occurrence.id, itemId: item.id, resolved: true });
    expect(await db.action.findUniqueOrThrow({ where: { id: item.refId } })).toMatchObject({ status: "COMPLETED" });

    await caller.ceremony.resolveAgendaItem({ workspaceId: ws.id, occurrenceId: occurrence.id, itemId: item.id, resolved: false });
    expect(await db.action.findUniqueOrThrow({ where: { id: item.refId } })).toMatchObject({ status: "ACTIVE" });
  });
});
