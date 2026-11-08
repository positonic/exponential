/**
 * `decisions_made` copies Decision statements into an agenda snapshot every
 * workspace member can read, so it must list only Decisions the whole
 * workspace may see. Real DB: the filter is a nested relation query whose
 * meaning a mocked Prisma cannot check.
 */
import { describe, it, expect, beforeEach } from "vitest";
import type { Ceremony, CeremonyOccurrence } from "@prisma/client";
import { getTestDb } from "~/test/test-db";
import { createUser, createWorkspace, createProject } from "~/test/factories";
import { decisionsMadeSection } from "../sections/decisions_made";
import { occurrenceActionsSection } from "../sections/occurrence_actions";

describe("decisions_made audience", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  it("lists workspace-visible accepted Decisions and leaves out restricted and private ones", async () => {
    const owner = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: owner.id });
    const open = await createProject(db, { createdById: owner.id, workspaceId: ws.id });
    const restricted = await createProject(db, { createdById: owner.id, workspaceId: ws.id, isRestricted: true });
    const privateMeeting = await db.transcriptionSession.create({
      data: { sessionId: `s-${Date.now()}-a`, userId: owner.id, workspaceId: ws.id, projectId: restricted.id, title: "1:1" },
    });
    const teamMeeting = await db.transcriptionSession.create({
      data: { sessionId: `s-${Date.now()}-b`, userId: owner.id, workspaceId: ws.id, title: "All hands" },
    });
    const decidedAt = new Date("2026-11-12T00:00:00Z");
    let n = 0;
    const decision = (statement: string, extra: Record<string, string | null> = {}) =>
      db.decision.create({
        data: { workspaceId: ws.id, number: ++n, statement, status: "ACCEPTED", reviewState: "CONFIRMED", createdById: owner.id, decidedAt, ...extra },
      });
    await decision("Workspace-wide");
    await decision("In the open project", { projectId: open.id });
    await decision("From the all-hands", { transcriptionSessionId: teamMeeting.id });
    await decision("In the restricted project", { projectId: restricted.id });
    await decision("From the private meeting", { transcriptionSessionId: privateMeeting.id });

    const items = await decisionsMadeSection.run(
      {
        db,
        workspaceId: ws.id,
        ceremony: { id: "cer-1", workspaceId: ws.id, productId: null } as Ceremony,
        occurrence: { id: "occ-1", scheduledStart: new Date("2026-11-17T10:00:00Z") } as CeremonyOccurrence,
        previousOccurrence: { id: "occ-0", scheduledStart: new Date("2026-11-10T10:00:00Z") } as CeremonyOccurrence,
        participantUserIds: [owner.id],
        projectIds: [],
        now: new Date("2026-11-17T10:00:00Z"),
        workspacePath: `/w/${ws.slug}`,
      },
      { key: "made", type: "decisions_made", title: "Decisions made" },
    );

    expect(items.map((i) => i.title).sort()).toEqual(["From the all-hands", "In the open project", "Workspace-wide"]);
  });

  it("occurrence_actions lists open-project and occurrence-linked Actions, never a restricted project's", async () => {
    const owner = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: owner.id });
    const open = await createProject(db, { createdById: owner.id, workspaceId: ws.id });
    const restricted = await createProject(db, { createdById: owner.id, workspaceId: ws.id, isRestricted: true });
    const ceremony = await db.ceremony.create({
      data: { workspaceId: ws.id, name: "PP", slug: "pp", timezone: "UTC", startsOn: new Date("2026-11-01T00:00:00Z"), ownerId: owner.id, createdById: owner.id },
    });
    const previous = await db.ceremonyOccurrence.create({
      data: { ceremonyId: ceremony.id, workspaceId: ws.id, scheduledStart: new Date("2026-11-10T10:00:00Z"), scheduledEnd: new Date("2026-11-10T11:00:00Z"), definitionSnapshot: {} },
    });
    const due = new Date("2026-11-12T00:00:00Z");
    const action = (name: string, data: Record<string, unknown>) =>
      db.action.create({ data: { name, createdById: owner.id, workspaceId: ws.id, dueDate: due, assignees: { create: { userId: owner.id } }, ...data } });
    await action("Open project work", { projectId: open.id });
    await action("Restricted project work", { projectId: restricted.id });
    await action("Added on last week's agenda", { occurrenceId: previous.id });

    const items = await occurrenceActionsSection.run(
      {
        db,
        workspaceId: ws.id,
        ceremony,
        occurrence: { id: "occ-1", scheduledStart: new Date("2026-11-17T10:00:00Z") } as CeremonyOccurrence,
        previousOccurrence: previous,
        participantUserIds: [owner.id],
        projectIds: [open.id, restricted.id],
        now: new Date("2026-11-17T10:00:00Z"),
        workspacePath: `/w/${ws.slug}`,
      },
      { key: "status", type: "occurrence_actions", title: "Status on action points" },
    );

    expect(items.map((i) => i.title).sort()).toEqual(["Added on last week's agenda", "Open project work"]);
  });
});
