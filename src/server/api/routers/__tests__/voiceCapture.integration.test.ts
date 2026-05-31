import { describe, it, expect, beforeEach } from "vitest";

import { getTestDb } from "~/test/test-db";
import { createUser, createProject } from "~/test/factories";
import { createApiKeyCaller } from "~/test/trpc-helpers";
import { mintVoiceSessionToken } from "~/server/utils/voice-token";

type Db = ReturnType<typeof getTestDb>;

// dispatch is a public procedure authed by the voice-session JWT, so an
// unauthenticated (no x-api-key) caller carrying a minted token is exactly the
// device's coarse-tool callback.
describe("voice capture_action (integration)", () => {
  let db: Db;
  beforeEach(() => {
    db = getTestDb();
  });

  async function callerFor(userId: string) {
    const token = mintVoiceSessionToken({ id: userId });
    const caller = createApiKeyCaller(null);
    return { token, caller };
  }

  it("creates an Action with the parsed name + due date and returns a speakable read-back", async () => {
    const user = await createUser(db);
    const { token, caller } = await callerFor(user.id);

    const res = await caller.voice.dispatch({
      token,
      toolName: "capture_action",
      args: { phrase: "draft the investor update by Friday" },
    });

    // Speakable read-back, non-destructive.
    expect(res.speakable.toLowerCase()).toContain("investor update");
    expect(res.needsConfirmation).toBe(false);

    const structured = res.structured as {
      action: { id: string; name: string; dueDate: Date | null };
      inbox: boolean;
    };
    expect(structured.action.name.toLowerCase()).toContain("investor update");
    // "by Friday" must be extracted as a due date.
    expect(structured.action.dueDate).not.toBeNull();

    // Actually persisted.
    const row = await db.action.findUnique({ where: { id: structured.action.id } });
    expect(row?.name.toLowerCase()).toContain("investor update");
    expect(row?.source).toBe("voice");
    expect(row?.status).toBe("ACTIVE");
  });

  it("attaches the Action to a clearly-named Project", async () => {
    const user = await createUser(db);
    await createProject(db, { createdById: user.id, name: "Acme" });
    const { token, caller } = await callerFor(user.id);

    const res = await caller.voice.dispatch({
      token,
      toolName: "capture_action",
      args: { phrase: "send the contract for the Acme project tomorrow" },
    });

    const structured = res.structured as {
      action: { id: string; project: { id: string; name: string } | null };
      inbox: boolean;
    };
    expect(structured.inbox).toBe(false);
    expect(structured.action.project?.name).toBe("Acme");
    expect(res.speakable).toContain("Acme");
  });

  it("lands an Action with no clear Project in the inbox (projectId null)", async () => {
    const user = await createUser(db);
    await createProject(db, { createdById: user.id, name: "Acme" });
    const { token, caller } = await callerFor(user.id);

    const res = await caller.voice.dispatch({
      token,
      toolName: "capture_action",
      args: { phrase: "remember to stretch" },
    });

    const structured = res.structured as {
      action: { id: string; project: { id: string; name: string } | null };
      inbox: boolean;
    };
    expect(structured.inbox).toBe(true);
    expect(structured.action.project).toBeNull();

    const row = await db.action.findUnique({ where: { id: structured.action.id } });
    expect(row?.projectId).toBeNull();
  });

  it("capture never raises the confirmation gate", async () => {
    const user = await createUser(db);
    const { token, caller } = await callerFor(user.id);

    const res = await caller.voice.dispatch({
      token,
      toolName: "capture_action",
      args: { phrase: "book the venue" },
    });

    expect(res.needsConfirmation).toBe(false);
  });

  it("rejects a capture call with no valid voice-session token", async () => {
    await expect(
      createApiKeyCaller(null).voice.dispatch({
        token: "garbage",
        toolName: "capture_action",
        args: { phrase: "anything" },
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
