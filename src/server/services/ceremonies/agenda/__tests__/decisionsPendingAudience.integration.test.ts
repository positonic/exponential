/**
 * `decisions_pending` copies Decision statements and owners into an agenda
 * snapshot every workspace member can read, so it must list only Decisions
 * the whole workspace may see. Real DB: the filter is a nested relation query
 * whose meaning a mocked Prisma cannot check.
 */
import { describe, it, expect, beforeEach } from "vitest";
import type { Ceremony, CeremonyOccurrence, PrismaClient } from "@prisma/client";
import { getTestDb } from "~/test/test-db";
import { createUser, createWorkspace, createProject } from "~/test/factories";
import { decisionsPendingSection } from "../sections/decisions_pending";
import type { SectionContext } from "../types";

function sectionCtx(db: PrismaClient, workspaceId: string, slug: string, userId: string, projectIds: string[]): SectionContext {
  const now = new Date("2026-11-17T10:00:00Z");
  return {
    db,
    workspaceId,
    ceremony: { id: "cer-1", workspaceId, productId: null } as Ceremony,
    occurrence: { id: "occ-1", scheduledStart: now } as CeremonyOccurrence,
    previousOccurrence: null,
    participantUserIds: [userId],
    projectIds,
    now,
    workspacePath: `/w/${slug}`,
  };
}

describe("decisions_pending audience", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  async function seed() {
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
    let n = 0;
    const decision = (statement: string, extra: Record<string, string | null> = {}) =>
      db.decision.create({
        data: { workspaceId: ws.id, number: ++n, statement, status: n % 2 ? "OPEN" : "PROPOSED", reviewState: "CONFIRMED", createdById: owner.id, ...extra },
      });
    await decision("Workspace-wide");
    await decision("In the open project", { projectId: open.id });
    await decision("From the all-hands", { transcriptionSessionId: teamMeeting.id });
    await decision("In the restricted project", { projectId: restricted.id });
    await decision("From the private meeting", { transcriptionSessionId: privateMeeting.id });
    // Not confirmed yet: a draft never reaches an agenda.
    await db.decision.create({
      data: { workspaceId: ws.id, number: ++n, statement: "Draft decision", status: "OPEN", reviewState: "DRAFT", createdById: owner.id },
    });
    // Another workspace's open, confirmed Decision.
    const other = await createWorkspace(db, { ownerId: owner.id });
    await db.decision.create({
      data: { workspaceId: other.id, number: 1, statement: "Other workspace", status: "OPEN", reviewState: "CONFIRMED", createdById: owner.id },
    });
    return { owner, ws, open, restricted };
  }

  it("lists workspace-visible pending Decisions and leaves out restricted, private, draft and other-workspace ones", async () => {
    const { owner, ws } = await seed();
    const items = await decisionsPendingSection.run(sectionCtx(db, ws.id, ws.slug, owner.id, []), {
      key: "dec",
      type: "decisions_pending",
      title: "Decisions",
    });
    expect(items.map((i) => i.title).sort()).toEqual(["From the all-hands", "In the open project", "Workspace-wide"]);
  });

  it("leaves a restricted project's own Decisions off a ceremony scoped to that project", async () => {
    const { owner, ws, open, restricted } = await seed();
    const items = await decisionsPendingSection.run(sectionCtx(db, ws.id, ws.slug, owner.id, [open.id, restricted.id]), {
      key: "dec",
      type: "decisions_pending",
      title: "Decisions",
    });
    expect(items.map((i) => i.title)).toEqual(["In the open project"]);
  });
});
