import { describe, it, expect, beforeEach } from "vitest";

import { getTestDb } from "~/test/test-db";
import { createUser, createAction } from "~/test/factories";
import { createApiKeyCaller } from "~/test/trpc-helpers";
import { mintVoiceSessionToken } from "~/server/utils/voice-token";

type Db = ReturnType<typeof getTestDb>;

interface CompleteStructured {
  resolution: "one" | "ambiguous" | "none";
  completed?: boolean;
  options?: Array<{ id: string; name: string }>;
  pendingCompletion?: { id: string; name: string };
}

describe("voice complete_action (integration) — confirmation gate", () => {
  let db: Db;
  beforeEach(() => {
    db = getTestDb();
  });

  function caller(userId: string) {
    return { token: mintVoiceSessionToken({ id: userId }), api: createApiKeyCaller(null) };
  }

  it("gates a clear match: needsConfirmation, and the Action is NOT yet completed", async () => {
    const user = await createUser(db);
    const action = await createAction(db, {
      createdById: user.id,
      name: "JWT refactor",
      status: "ACTIVE",
    });
    const { token, api } = caller(user.id);

    const res = await api.voice.dispatch({
      token,
      toolName: "complete_action",
      args: { phrase: "mark the JWT refactor as done" },
    });

    expect(res.needsConfirmation).toBe(true);
    expect(res.speakable.toLowerCase()).toContain("confirm");
    expect((res.structured as CompleteStructured).resolution).toBe("one");

    // Critical: unconfirmed destructive intent must NOT execute.
    const row = await db.action.findUnique({ where: { id: action.id } });
    expect(row?.status).toBe("ACTIVE");
    expect(row?.completedAt).toBeNull();
  });

  it("completes only after a confirm flag", async () => {
    const user = await createUser(db);
    const action = await createAction(db, {
      createdById: user.id,
      name: "JWT refactor",
      status: "ACTIVE",
    });
    const { token, api } = caller(user.id);

    const res = await api.voice.dispatch({
      token,
      toolName: "complete_action",
      args: { phrase: "mark the JWT refactor as done" },
      confirm: true,
    });

    expect(res.needsConfirmation).toBe(false);
    expect((res.structured as CompleteStructured).completed).toBe(true);
    expect(res.speakable.toLowerCase()).toContain("done");

    const row = await db.action.findUnique({ where: { id: action.id } });
    expect(row?.status).toBe("COMPLETED");
    expect(row?.completedAt).not.toBeNull();
  });

  it("asks which one for near-duplicate matches and completes nothing", async () => {
    const user = await createUser(db);
    const a1 = await createAction(db, { createdById: user.id, name: "update the website", status: "ACTIVE" });
    const a2 = await createAction(db, { createdById: user.id, name: "update the budget", status: "ACTIVE" });
    const { token, api } = caller(user.id);

    // Even WITH confirm, an ambiguous description must not complete anything.
    const res = await api.voice.dispatch({
      token,
      toolName: "complete_action",
      args: { phrase: "mark update as done" },
      confirm: true,
    });

    expect(res.needsConfirmation).toBe(false);
    expect((res.structured as CompleteStructured).resolution).toBe("ambiguous");

    const r1 = await db.action.findUnique({ where: { id: a1.id } });
    const r2 = await db.action.findUnique({ where: { id: a2.id } });
    expect(r1?.status).toBe("ACTIVE");
    expect(r2?.status).toBe("ACTIVE");
  });

  it("handles no match gracefully without mutating", async () => {
    const user = await createUser(db);
    await createAction(db, { createdById: user.id, name: "JWT refactor", status: "ACTIVE" });
    const { token, api } = caller(user.id);

    const res = await api.voice.dispatch({
      token,
      toolName: "complete_action",
      args: { phrase: "mark the quarterly board deck as done" },
      confirm: true,
    });

    expect(res.needsConfirmation).toBe(false);
    expect((res.structured as CompleteStructured).resolution).toBe("none");
  });

  it("rejects a complete call with no valid voice-session token", async () => {
    await expect(
      createApiKeyCaller(null).voice.dispatch({
        token: "garbage",
        toolName: "complete_action",
        args: { phrase: "mark anything as done" },
        confirm: true,
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
