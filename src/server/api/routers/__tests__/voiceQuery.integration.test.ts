import { describe, it, expect, beforeEach } from "vitest";

import { getTestDb } from "~/test/test-db";
import { createUser, createProject, createAction } from "~/test/factories";
import { createApiKeyCaller } from "~/test/trpc-helpers";
import { mintVoiceSessionToken } from "~/server/utils/voice-token";

type Db = ReturnType<typeof getTestDb>;
const DAY_MS = 24 * 60 * 60 * 1000;

interface QueryStructured {
  intent: string;
  declined: boolean;
  project: { id: string; name: string } | null;
  actions: Array<{ id: string; name: string }>;
}

describe("voice query (integration)", () => {
  let db: Db;
  beforeEach(() => {
    db = getTestDb();
  });

  // Seed: overdue-in-Acme, inbox (no project), due-this-week-in-Acme.
  async function seed() {
    const user = await createUser(db);
    const acme = await createProject(db, { createdById: user.id, name: "Acme" });
    await createAction(db, {
      createdById: user.id,
      projectId: acme.id,
      name: "reply to the auditor",
      dueDate: new Date(Date.now() - 10 * DAY_MS), // overdue
    });
    await createAction(db, {
      createdById: user.id,
      name: "loose thought", // inbox: no projectId
    });
    await createAction(db, {
      createdById: user.id,
      projectId: acme.id,
      name: "ship the release",
      dueDate: new Date(), // due this week
    });
    return { user, caller: createApiKeyCaller(null), token: mintVoiceSessionToken({ id: user.id }) };
  }

  async function ask(phrase: string) {
    const { caller, token } = await seed();
    return caller.voice.dispatch({ token, toolName: "query", args: { phrase } });
  }

  it("answers 'what's overdue?'", async () => {
    const res = await ask("what's overdue?");
    expect(res.needsConfirmation).toBe(false);
    const s = res.structured as QueryStructured;
    expect(s.declined).toBe(false);
    expect(s.actions.map((a) => a.name)).toEqual(["reply to the auditor"]);
    expect(res.speakable.toLowerCase()).toContain("overdue");
  });

  it("answers 'what's in my inbox?'", async () => {
    const res = await ask("what's in my inbox?");
    const s = res.structured as QueryStructured;
    expect(s.declined).toBe(false);
    expect(s.actions.map((a) => a.name)).toEqual(["loose thought"]);
    expect(res.speakable.toLowerCase()).toContain("inbox");
  });

  it("answers 'what's due this week in Acme?' scoped to the project", async () => {
    const res = await ask("what's due this week in the Acme project?");
    const s = res.structured as QueryStructured;
    expect(s.declined).toBe(false);
    expect(s.project?.name).toBe("Acme");
    expect(s.actions.map((a) => a.name)).toEqual(["ship the release"]);
    expect(res.speakable).toContain("Acme");
  });

  it("declines an out-of-scope blocker question without fabricating", async () => {
    const res = await ask("what's blocking the launch?");
    expect(res.needsConfirmation).toBe(false);
    const s = res.structured as QueryStructured;
    expect(s.declined).toBe(true);
    expect(s.actions).toHaveLength(0);
    expect(res.speakable.toLowerCase()).toMatch(/can't|goals|okrs|blockers/);
  });

  it("declines an out-of-scope goals/OKR question", async () => {
    const res = await ask("how are my OKRs tracking?");
    const s = res.structured as QueryStructured;
    expect(s.declined).toBe(true);
    expect(s.actions).toHaveLength(0);
  });

  it("rejects a call with no valid voice-session token", async () => {
    await expect(
      createApiKeyCaller(null).voice.dispatch({
        token: "garbage",
        toolName: "query",
        args: { phrase: "what's overdue?" },
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
