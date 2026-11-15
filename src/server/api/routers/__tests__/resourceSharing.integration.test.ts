/**
 * Filing shares (ADR-0082), against a real database: the visibility rule is a
 * relation filter three joins deep in Prisma and an EXISTS in the Knowledge
 * search's SQL, and a mocked client cannot say whether either admits the
 * right rows. Every case here is one person looking for another's Resource.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { getTestDb } from "~/test/test-db";
import { createTestCaller } from "~/test/trpc-helpers";
import {
  addProjectMember,
  addTeamMember,
  addWorkspaceMember,
  createProject,
  createTeam,
  createUser,
  createWorkspace,
} from "~/test/factories";
import { KnowledgeService } from "~/server/services/KnowledgeService";
import { alreadyInProjectFromError } from "~/server/services/resources/alreadyInProject";

// `resource.create` schedules its slow work with `after()`, which needs a
// request scope. Nothing here indexes on save, so the callback is dropped.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  after: vi.fn(),
}));

const EMBEDDING = Array.from({ length: 1536 }, () => 0.01);

describe("Resources filed under a Project are shared with it", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
    vi.spyOn(KnowledgeService.prototype, "generateEmbedding").mockResolvedValue(EMBEDDING);
  });

  /** A workspace with an owner, a member, and an open Project the owner filed a page under. */
  async function setup(project: { isRestricted?: boolean; isPublic?: boolean } = {}) {
    const owner = await createUser(db, { name: "Owner" });
    const member = await createUser(db, { name: "Member" });
    const ws = await createWorkspace(db, { ownerId: owner.id });
    await addWorkspaceMember(db, ws.id, member.id);
    const proj = await createProject(db, { createdById: owner.id, workspaceId: ws.id, ...project });
    const { resource } = await createTestCaller(owner.id).resource.create({
      title: "Villa in Lanzarote",
      url: `https://example.com/rooms/${randomUUID()}`,
      pageText: "Villa in Lanzarote, 1,240 total, free cancellation",
      projectId: proj.id,
      generateEmbeddings: false,
      forReference: true,
    });
    return { owner, member, ws, proj, resource };
  }

  /** Index one chunk for a Resource, as an embed would, without calling a model. */
  async function indexChunk(resource: { id: string; userId: string; projectId: string | null; workspaceId: string | null }) {
    await db.$executeRaw`
      INSERT INTO "KnowledgeChunk" (id, content, embedding, "sourceType", "sourceId", "chunkIndex", "userId", "projectId", "workspaceId")
      VALUES (${randomUUID()}, 'free cancellation', ${`[${EMBEDDING.join(",")}]`}::vector, 'resource', ${resource.id}, 0, ${resource.userId}, ${resource.projectId}, ${resource.workspaceId})`;
  }

  async function searchHits(userId: string, workspaceId: string): Promise<string[]> {
    const { results } = await createTestCaller(userId).resource.search({ query: "cancellation", workspaceId });
    return results.map((result) => result.sourceId);
  }

  it("filing puts the Resource in the Project's workspace, whatever workspace was named", async () => {
    const { owner, ws, proj } = await setup();
    const elsewhere = await createWorkspace(db, { ownerId: owner.id });

    const { resource } = await createTestCaller(owner.id).resource.create({
      title: "Filed",
      url: `https://example.com/${randomUUID()}`,
      projectId: proj.id,
      workspaceId: elsewhere.id,
      generateEmbeddings: false,
    });

    expect(resource.workspaceId).toBe(ws.id);
  });

  it("a member who can see the Project lists, opens and finds a Resource another member filed there", async () => {
    const { member, ws, proj, resource } = await setup();
    await indexChunk(resource);
    const caller = createTestCaller(member.id);

    const listed = await caller.resource.list({ projectId: proj.id });
    expect(listed.resources).toHaveLength(1);
    expect(listed.resources[0]).toMatchObject({
      id: resource.id,
      isMine: false,
      owner: { name: "Owner" },
      // Read state is the owner's alone.
      readStatus: null,
      readAt: null,
    });

    const opened = await caller.resource.get({ id: resource.id });
    expect(opened.resource).toMatchObject({ id: resource.id, isMine: false, readStatus: null });
    expect(opened.resource).not.toHaveProperty("pageText");

    const identities = await caller.resource.identities();
    expect(identities.items).toEqual([
      expect.objectContaining({ id: resource.id, isMine: false, readStatus: null, project: { id: proj.id, name: proj.name } }),
    ]);

    expect(await searchHits(member.id, ws.id)).toEqual([resource.id]);
  });

  it("a shared Resource is on its owner's Reading list only", async () => {
    const { owner, member, ws, proj } = await setup();
    await createTestCaller(owner.id).resource.create({
      title: "Queued",
      url: `https://example.com/${randomUUID()}`,
      projectId: proj.id,
      generateEmbeddings: false,
    });

    const mine = await createTestCaller(owner.id).resource.list({ readStatus: "unread", workspaceId: ws.id });
    expect(mine.resources.map((r) => r.title)).toEqual(["Queued"]);

    const caller = createTestCaller(member.id);
    expect((await caller.resource.list({ readStatus: "unread", workspaceId: ws.id })).resources).toEqual([]);
    expect((await caller.resource.list({ readStatus: "unread", projectId: proj.id })).resources).toEqual([]);
    expect((await caller.resource.list({ readStatus: "read", projectId: proj.id })).resources).toEqual([]);
    // Nor on their Knowledge page, which is their own Resources.
    expect((await caller.resource.list({ workspaceId: ws.id })).resources).toEqual([]);
  });

  it("a workspace member who cannot see a restricted Project cannot list, open or find its Resources", async () => {
    const { member, ws, proj, resource } = await setup({ isRestricted: true });
    await indexChunk(resource);
    const caller = createTestCaller(member.id);

    await expect(caller.resource.list({ projectId: proj.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.resource.get({ id: resource.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await caller.resource.identities()).items).toEqual([]);
    expect(await searchHits(member.id, ws.id)).toEqual([]);
  });

  it("a member added to a restricted Project sees what is filed there", async () => {
    const { member, ws, proj, resource } = await setup({ isRestricted: true });
    await indexChunk(resource);
    await addProjectMember(db, proj.id, member.id, "viewer");
    const caller = createTestCaller(member.id);

    expect((await caller.resource.list({ projectId: proj.id })).resources.map((r) => r.id)).toEqual([resource.id]);
    expect((await caller.resource.get({ id: resource.id })).resource.id).toBe(resource.id);
    expect(await searchHits(member.id, ws.id)).toEqual([resource.id]);
  });

  it("a Resource with no Project is invisible to everyone but its owner", async () => {
    const { owner, member, ws } = await setup();
    const { resource: unfiled } = await createTestCaller(owner.id).resource.create({
      title: "Private",
      url: `https://example.com/${randomUUID()}`,
      workspaceId: ws.id,
      generateEmbeddings: false,
    });
    await indexChunk(unfiled);
    const caller = createTestCaller(member.id);

    await expect(caller.resource.get({ id: unfiled.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await caller.resource.list({ workspaceId: ws.id })).resources).toEqual([]);
    expect((await caller.resource.identities()).items.map((item) => item.id)).not.toContain(unfiled.id);
    expect(await searchHits(member.id, ws.id)).not.toContain(unfiled.id);
    // The owner still finds it.
    expect(await searchHits(owner.id, ws.id)).toContain(unfiled.id);
  });

  it("someone who can merely read a public Project is not shown what its members filed", async () => {
    const { ws, proj, resource } = await setup({ isPublic: true });
    await indexChunk(resource);
    const stranger = await createUser(db, { name: "Stranger" });
    const caller = createTestCaller(stranger.id);

    expect((await caller.resource.list({ projectId: proj.id })).resources).toEqual([]);
    await expect(caller.resource.get({ id: resource.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await caller.resource.identities()).items).toEqual([]);
    await expect(caller.resource.search({ query: "cancellation", workspaceId: ws.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("a non-owner cannot describe, move, archive, delete, pin, re-index or change the read state of a shared Resource", async () => {
    const { member, proj, resource } = await setup();
    const other = await createProject(db, { createdById: member.id, workspaceId: resource.workspaceId! });
    const caller = createTestCaller(member.id);
    const notFound = { code: "NOT_FOUND" };

    await expect(caller.resource.update({ id: resource.id, description: "mine now" })).rejects.toMatchObject(notFound);
    await expect(caller.resource.update({ id: resource.id, projectId: other.id })).rejects.toMatchObject(notFound);
    await expect(caller.resource.archive({ id: resource.id })).rejects.toMatchObject(notFound);
    await expect(caller.resource.unarchive({ id: resource.id })).rejects.toMatchObject(notFound);
    await expect(caller.resource.delete({ id: resource.id })).rejects.toMatchObject(notFound);
    await expect(caller.resource.setPinned({ id: resource.id, pinned: true })).rejects.toMatchObject(notFound);
    await expect(caller.resource.regenerateEmbeddings({ id: resource.id })).rejects.toMatchObject(notFound);
    await expect(caller.resource.setReadStatus({ id: resource.id, readStatus: "to_read" })).rejects.toMatchObject(notFound);

    const row = await db.resource.findUniqueOrThrow({ where: { id: resource.id } });
    expect(row).toMatchObject({
      description: null,
      projectId: proj.id,
      archivedAt: null,
      pinnedAsContext: false,
      readStatus: "read",
    });
  });

  it("when the owner leaves the workspace, their Resources stop being visible through its Projects", async () => {
    const { owner, member, ws, proj, resource } = await setup();
    await indexChunk(resource);
    // The workspace passes to the member, and the person who filed the page leaves.
    await db.workspaceUser.update({
      where: { userId_workspaceId: { userId: member.id, workspaceId: ws.id } },
      data: { role: "owner" },
    });
    await db.workspaceUser.delete({ where: { userId_workspaceId: { userId: owner.id, workspaceId: ws.id } } });
    const caller = createTestCaller(member.id);

    expect((await caller.resource.list({ projectId: proj.id })).resources).toEqual([]);
    await expect(caller.resource.get({ id: resource.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await caller.resource.identities()).items).toEqual([]);
    expect(await searchHits(member.id, ws.id)).toEqual([]);
  });

  it("an owner who belongs to the workspace through a team still shares", async () => {
    const { owner, member, ws, proj, resource } = await setup();
    await indexChunk(resource);
    const team = await createTeam(db);
    await db.team.update({ where: { id: team.id }, data: { workspaceId: ws.id } });
    await addTeamMember(db, team.id, owner.id);
    await db.workspaceUser.update({
      where: { userId_workspaceId: { userId: member.id, workspaceId: ws.id } },
      data: { role: "owner" },
    });
    await db.workspaceUser.delete({ where: { userId_workspaceId: { userId: owner.id, workspaceId: ws.id } } });
    const caller = createTestCaller(member.id);

    expect((await caller.resource.list({ projectId: proj.id })).resources.map((r) => r.id)).toEqual([resource.id]);
    expect(await searchHits(member.id, ws.id)).toEqual([resource.id]);
  });

  describe("a page is filed once per Project (keen.quill)", () => {
    /**
     * The page the owner filed in `setup`, as another visit to it: other dates
     * and a tracking parameter. The page declares its own address, which is
     * what makes the two visits one page.
     */
    const anotherVisit = (url: string) => `${url}?check_in=2027-03-01&utm_source=mail`;

    async function refusal(attempt: Promise<unknown>) {
      const error = await attempt.then(
        () => null,
        (thrown: unknown) => thrown,
      );
      expect(error).toMatchObject({ code: "CONFLICT" });
      return alreadyInProjectFromError(error);
    }

    it("a save for reference into a Project that already lists the page files nothing and names the Resource and its owner", async () => {
      const { owner, member, proj, resource } = await setup();

      const already = await refusal(
        createTestCaller(member.id).resource.create({
          title: "Villa",
          url: anotherVisit(resource.url!),
          declaredUrl: resource.url!,
          projectId: proj.id,
          generateEmbeddings: false,
          forReference: true,
        }),
      );

      expect(already).toEqual({
        resourceId: resource.id,
        title: "Villa in Lanzarote",
        projectId: proj.id,
        owner: { id: owner.id, name: "Owner" },
      });
      expect(await db.resource.count({ where: { projectId: proj.id } })).toBe(1);
      expect(await db.resource.count({ where: { userId: member.id } })).toBe(0);
    });

    it("with the Reading list requested, the caller gets their own queued Resource with no Project", async () => {
      const { member, ws, proj, resource } = await setup();

      const out = await createTestCaller(member.id).resource.create({
        title: "Villa",
        url: anotherVisit(resource.url!),
        declaredUrl: resource.url!,
        projectId: proj.id,
        workspaceId: ws.id,
        generateEmbeddings: false,
        readStatus: "to_read",
      });

      expect(out.created).toBe(true);
      expect(out.alreadyInProject).toMatchObject({ resourceId: resource.id, owner: { name: "Owner" } });
      expect(out.resource).toMatchObject({
        userId: member.id,
        projectId: null,
        workspaceId: ws.id,
        readStatus: "to_read",
        identity: resource.identity,
      });
      expect(await db.resource.count({ where: { projectId: proj.id } })).toBe(1);
    });

    it("moving a Resource into a Project that already lists the page is refused the same way", async () => {
      const { owner, member, ws, proj, resource } = await setup();
      const caller = createTestCaller(member.id);
      const { resource: mine } = await caller.resource.create({
        title: "Villa",
        url: anotherVisit(resource.url!),
        declaredUrl: resource.url!,
        workspaceId: ws.id,
        generateEmbeddings: false,
      });

      const already = await refusal(caller.resource.update({ id: mine.id, projectId: proj.id }));

      expect(already).toMatchObject({ resourceId: resource.id, owner: { id: owner.id } });
      expect((await db.resource.findUniqueOrThrow({ where: { id: mine.id } })).projectId).toBeNull();
    });

    it("saving a page into a Project where only the caller's own Resource exists updates it as before", async () => {
      const { owner, proj, resource } = await setup();

      const out = await createTestCaller(owner.id).resource.create({
        title: "Villa",
        url: anotherVisit(resource.url!),
        declaredUrl: resource.url!,
        projectId: proj.id,
        generateEmbeddings: false,
        forReference: true,
      });

      expect(out).toMatchObject({ created: false, alreadyInProject: null, resource: { id: resource.id } });
      expect(out.resource.url).toBe(`${resource.url}?check_in=2027-03-01`);
    });

    it("an archived Resource, or one whose owner has left, no longer holds the page's place", async () => {
      const { owner, member, proj, resource } = await setup();
      await createTestCaller(owner.id).resource.archive({ id: resource.id });

      const out = await createTestCaller(member.id).resource.create({
        title: "Villa",
        url: resource.url!,
        projectId: proj.id,
        generateEmbeddings: false,
        forReference: true,
      });

      expect(out).toMatchObject({ created: true, alreadyInProject: null, resource: { projectId: proj.id } });
    });

    it("a different page on the same site is filed normally", async () => {
      const { member, proj } = await setup();

      const out = await createTestCaller(member.id).resource.create({
        title: "Another villa",
        url: `https://example.com/rooms/${randomUUID()}`,
        projectId: proj.id,
        generateEmbeddings: false,
        forReference: true,
      });

      expect(out).toMatchObject({ created: true, alreadyInProject: null, resource: { projectId: proj.id } });
    });
  });

  describe("Project editors can unfile a Resource (woody.wolf)", () => {
    it("an editor unfiles a Resource they do not own: it leaves the Project for everyone and returns to its owner untouched", async () => {
      const { owner, member, ws, proj, resource } = await setup();
      await indexChunk(resource);
      await createTestCaller(owner.id).resource.update({ id: resource.id, description: "For January" });
      const before = await db.resource.findUniqueOrThrow({ where: { id: resource.id } });

      const out = await createTestCaller(member.id).resource.unfile({ id: resource.id });

      expect(out).toEqual({ id: resource.id, projectId: null, unfiled: true });
      const after = await db.resource.findUniqueOrThrow({ where: { id: resource.id } });
      expect(after).toMatchObject({
        userId: owner.id,
        projectId: null,
        workspaceId: ws.id,
        description: "For January",
        readStatus: before.readStatus,
        readAt: before.readAt,
        pageText: before.pageText,
        archivedAt: null,
      });

      // Gone from the Project for everyone, the owner included.
      expect((await createTestCaller(member.id).resource.list({ projectId: proj.id })).resources).toEqual([]);
      expect((await createTestCaller(owner.id).resource.list({ projectId: proj.id })).resources).toEqual([]);
      // Nobody else can see it, in the reader, the identities read or search.
      await expect(createTestCaller(member.id).resource.get({ id: resource.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect((await createTestCaller(member.id).resource.identities()).items).toEqual([]);
      expect(await searchHits(member.id, ws.id)).toEqual([]);
      // The owner still has it, index and all.
      expect((await createTestCaller(owner.id).resource.get({ id: resource.id })).resource.id).toBe(resource.id);
      expect(await searchHits(owner.id, ws.id)).toEqual([resource.id]);
    });

    it("a member who can see but not edit the Project cannot unfile", async () => {
      const { ws, proj, resource } = await setup();
      const viewer = await createUser(db, { name: "Viewer" });
      await addWorkspaceMember(db, ws.id, viewer.id, "viewer");
      const caller = createTestCaller(viewer.id);
      expect((await caller.resource.list({ projectId: proj.id })).resources).toHaveLength(1);

      await expect(caller.resource.unfile({ id: resource.id })).rejects.toMatchObject({ code: "FORBIDDEN" });

      expect((await db.resource.findUniqueOrThrow({ where: { id: resource.id } })).projectId).toBe(proj.id);
    });

    it("someone who cannot see the Resource is told it does not exist", async () => {
      const { resource } = await setup({ isRestricted: true });
      const outsider = await createUser(db, { name: "Outsider" });

      await expect(createTestCaller(outsider.id).resource.unfile({ id: resource.id })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("unfiling is all an editor can do: delete, archive, describe and move stay the owner's", async () => {
      const { member, resource } = await setup();
      const caller = createTestCaller(member.id);
      const notFound = { code: "NOT_FOUND" };

      await expect(caller.resource.delete({ id: resource.id })).rejects.toMatchObject(notFound);
      await expect(caller.resource.archive({ id: resource.id })).rejects.toMatchObject(notFound);
      await expect(caller.resource.update({ id: resource.id, description: "x" })).rejects.toMatchObject(notFound);
      await expect(caller.resource.update({ id: resource.id, projectId: null })).rejects.toMatchObject(notFound);
    });

    it("the owner can unfile their own, and unfiling twice is not an error", async () => {
      const { owner, resource } = await setup();
      const caller = createTestCaller(owner.id);

      expect(await caller.resource.unfile({ id: resource.id })).toMatchObject({ unfiled: true });
      expect(await caller.resource.unfile({ id: resource.id })).toEqual({ id: resource.id, projectId: null, unfiled: false });
    });
  });

  it("moving a Resource into a Project in another workspace takes its index entries with it", async () => {
    const { owner, member, ws, proj } = await setup();
    const personal = await createWorkspace(db, { ownerId: owner.id });
    const caller = createTestCaller(owner.id);
    const { resource: unfiled } = await caller.resource.create({
      title: "Saved at home",
      url: `https://example.com/${randomUUID()}`,
      workspaceId: personal.id,
      generateEmbeddings: false,
    });
    await indexChunk(unfiled);
    expect(await searchHits(member.id, ws.id)).not.toContain(unfiled.id);

    const moved = await caller.resource.update({ id: unfiled.id, projectId: proj.id });

    expect(moved.resource.workspaceId).toBe(ws.id);
    expect(await searchHits(member.id, ws.id)).toContain(unfiled.id);
    expect(await searchHits(owner.id, personal.id)).not.toContain(unfiled.id);
  });
});
