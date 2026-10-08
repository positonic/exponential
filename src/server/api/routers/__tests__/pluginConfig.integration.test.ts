import { describe, it, expect, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { getTestDb } from "~/test/test-db";
import { createTestCaller } from "~/test/trpc-helpers";
import { createUser, createWorkspace, addWorkspaceMember } from "~/test/factories";

// Each user has one PluginConfig row per plugin and workspace, guarded by a
// unique index, so these need the real database: only Postgres decides
// whether overlapping first toggles can collide on it.
describe("pluginConfig router", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  describe("toggle", () => {
    it("lets overlapping first toggles all succeed and leaves one row", async () => {
      const user = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: user.id });
      const caller = createTestCaller(user.id);

      // No rows yet, so every call races to create its plugin's row. Several
      // plugins at once, so a find-then-create reliably collides somewhere.
      const pluginIds = ["okr", "crm", "product", "meetings", "docs"];
      const results = await Promise.allSettled(
        pluginIds.flatMap((pluginId) =>
          Array.from({ length: 10 }, () =>
            caller.pluginConfig.toggle({ pluginId, enabled: false, workspaceId: ws.id }),
          ),
        ),
      );

      expect(results.filter((r) => r.status === "rejected")).toEqual([]);
      const rows = await db.pluginConfig.findMany({ where: { userId: user.id } });
      expect(rows.map((r) => r.pluginId).sort()).toEqual([...pluginIds].sort());
      for (const row of rows) {
        expect(row).toMatchObject({ workspaceId: ws.id, enabled: false });
      }
    });

    it("flips enabled and leaves the row's settings as stored", async () => {
      const user = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: user.id });
      const caller = createTestCaller(user.id);
      const settings = { viewPrefs: { app: { view: "board" }, "app/features": { view: "list" } } };
      await db.pluginConfig.create({
        data: { pluginId: "product", workspaceId: ws.id, userId: user.id, enabled: true, settings },
      });

      const toggled = await caller.pluginConfig.toggle({
        pluginId: "product",
        enabled: false,
        workspaceId: ws.id,
      });

      expect(toggled).toMatchObject({ pluginId: "product", enabled: false, settings });
      const rows = await db.pluginConfig.findMany({ where: { userId: user.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ enabled: false, settings });
    });

    it("lets any workspace member toggle their own row", async () => {
      const owner = await createUser(db);
      const viewer = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id });
      await addWorkspaceMember(db, ws.id, viewer.id, "viewer");

      const toggled = await createTestCaller(viewer.id).pluginConfig.toggle({
        pluginId: "okr",
        enabled: true,
        workspaceId: ws.id,
      });

      expect(toggled).toMatchObject({ userId: viewer.id, workspaceId: ws.id, enabled: true });
    });

    it("rejects non-members without writing anything", async () => {
      const owner = await createUser(db);
      const stranger = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: owner.id });

      await expect(
        createTestCaller(stranger.id).pluginConfig.toggle({
          pluginId: "okr",
          enabled: true,
          workspaceId: ws.id,
        }),
      ).rejects.toThrow(TRPCError);
      expect(await db.pluginConfig.count({ where: { userId: stranger.id } })).toBe(0);
    });
  });
});
