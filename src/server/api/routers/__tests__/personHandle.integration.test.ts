/**
 * Person page handles against a real database.
 *
 * An integration test on purpose: the "taken" rule is finally decided by the
 * unique index on `User.handle` (two requests can pass the pre-check at once),
 * and that index only exists once the migration has been applied.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "~/test/test-db";
import { createTestCaller } from "~/test/trpc-helpers";
import { createUser } from "~/test/factories";

describe("person handles", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  it("opens your own page by the handle you set, and by your id", async () => {
    const user = await createUser(db);
    const caller = createTestCaller(user.id);

    expect(await caller.user.setHandle({ handle: "Ada-L" })).toEqual({ handle: "ada-l" });

    const byHandle = await caller.person.get({ userId: "ada-l" });
    const byId = await caller.person.get({ userId: user.id });
    expect(byHandle.user).toMatchObject({ id: user.id, handle: "ada-l" });
    expect(byId.user).toEqual(byHandle.user);
  });

  it("refuses a handle someone else holds, and frees it the moment they change it", async () => {
    const ada = await createUser(db);
    const bob = await createUser(db);
    await createTestCaller(ada.id).user.setHandle({ handle: "ada" });

    await expect(
      createTestCaller(bob.id).user.setHandle({ handle: "ada" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await createTestCaller(ada.id).user.setHandle({ handle: "ada-lovelace" });
    expect(await createTestCaller(bob.id).user.setHandle({ handle: "ada" })).toEqual({
      handle: "ada",
    });
  });

  it("lets any number of people have no handle, but never two the same one", async () => {
    const ada = await createUser(db);
    const bob = await createUser(db);
    expect(ada.handle).toBeNull();
    expect(bob.handle).toBeNull();

    await db.user.update({ where: { id: ada.id }, data: { handle: "shared" } });
    // Straight at the table, past the pre-check: the index is the backstop.
    await expect(
      db.user.update({ where: { id: bob.id }, data: { handle: "shared" } }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("answers a stranger's handle exactly like a handle nobody holds", async () => {
    const viewer = await createUser(db);
    const stranger = await createUser(db);
    await createTestCaller(stranger.id).user.setHandle({ handle: "stranger" });
    const caller = createTestCaller(viewer.id);

    const hidden = await caller.person.get({ userId: "stranger" }).catch((e: unknown) => e);
    const unknown = await caller.person.get({ userId: "nobody-here" }).catch((e: unknown) => e);

    expect(hidden).toMatchObject({ code: "NOT_FOUND", message: "Person not found" });
    expect(unknown).toMatchObject({ code: "NOT_FOUND", message: "Person not found" });
  });
});
