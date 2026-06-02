import { describe, it, expect, beforeEach, vi } from "vitest";
import jwt from "jsonwebtoken";

// Mock the OpenAI Realtime minter so createSession never hits the network.
vi.mock("~/server/services/voice/openai-realtime", () => ({
  createRealtimeSession: vi.fn(async () => ({
    ephemeralKey: "ek_test_ephemeral_123",
    expiresAt: 1_900_000_000,
    model: "gpt-4o-realtime-preview",
    voice: "alloy",
  })),
}));

import { getTestDb } from "~/test/test-db";
import {
  createUser,
  createWorkspace,
  createProject,
  createAction,
  createApiKey,
} from "~/test/factories";
import { createApiKeyCaller } from "~/test/trpc-helpers";

type Db = ReturnType<typeof getTestDb>;
const DAY_MS = 24 * 60 * 60 * 1000;

interface QueryStructured {
  declined: boolean;
  actions: Array<{ id: string; name: string }>;
}

/** Decode the workspaceId claim baked into a minted voice-session token. */
function workspaceClaim(token: string): string | undefined {
  const decoded = jwt.verify(token, process.env.AUTH_SECRET!, {
    audience: "voice-session",
    issuer: "todo-app",
  }) as { workspaceId?: string };
  return decoded.workspaceId;
}

describe("voice workspace scoping (integration): createSession → JWT claim → dispatch", () => {
  let db: Db;
  beforeEach(() => {
    db = getTestDb();
  });

  /**
   * One user, two workspaces (Alpha + Beta), each with one overdue action. The
   * user owns both, so membership is valid for either. A third workspace is owned
   * by someone else to exercise the privilege-escalation rejection.
   */
  async function seed() {
    const user = await createUser(db);
    const alpha = await createWorkspace(db, { ownerId: user.id, name: "Alpha" });
    const beta = await createWorkspace(db, { ownerId: user.id, name: "Beta" });

    await createAction(db, {
      createdById: user.id,
      workspaceId: alpha.id,
      name: "alpha overdue",
      dueDate: new Date(Date.now() - 10 * DAY_MS),
    });
    await createAction(db, {
      createdById: user.id,
      workspaceId: beta.id,
      name: "beta overdue",
      dueDate: new Date(Date.now() - 10 * DAY_MS),
    });

    const { raw } = await createApiKey(db, user.id);
    return { user, alpha, beta, raw };
  }

  it("stamps the explicit (validated) workspaceId into the voice-session JWT", async () => {
    const { alpha, raw } = await seed();

    const session = await createApiKeyCaller(raw).voice.createSession({
      workspaceId: alpha.id,
    });

    expect(workspaceClaim(session.voiceSessionToken)).toBe(alpha.id);
  });

  it("rejects createSession for a workspace the caller is not a member of", async () => {
    const { raw } = await seed();
    const stranger = await createUser(db);
    const foreign = await createWorkspace(db, { ownerId: stranger.id, name: "Foreign" });

    await expect(
      createApiKeyCaller(raw).voice.createSession({ workspaceId: foreign.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("a token minted for workspace A only ever sees workspace A's data through dispatch", async () => {
    const { alpha, beta, raw } = await seed();

    const aSession = await createApiKeyCaller(raw).voice.createSession({
      workspaceId: alpha.id,
    });
    const bSession = await createApiKeyCaller(raw).voice.createSession({
      workspaceId: beta.id,
    });

    const aRes = await createApiKeyCaller(null).voice.dispatch({
      token: aSession.voiceSessionToken,
      toolName: "query",
      args: { phrase: "what's overdue?" },
    });
    const bRes = await createApiKeyCaller(null).voice.dispatch({
      token: bSession.voiceSessionToken,
      toolName: "query",
      args: { phrase: "what's overdue?" },
    });

    const aActions = (aRes.structured as QueryStructured).actions.map((x) => x.name);
    const bActions = (bRes.structured as QueryStructured).actions.map((x) => x.name);

    expect(aActions).toEqual(["alpha overdue"]);
    expect(bActions).toEqual(["beta overdue"]);
  });

  it("captures into the session's workspace (the stamped claim reaches the mutating tool)", async () => {
    const { user, alpha, raw } = await seed();

    const session = await createApiKeyCaller(raw).voice.createSession({
      workspaceId: alpha.id,
    });

    await createApiKeyCaller(null).voice.dispatch({
      token: session.voiceSessionToken,
      toolName: "capture_action",
      args: { phrase: "buy milk" },
    });

    const created = await db.action.findFirst({
      where: { createdById: user.id, name: { contains: "milk", mode: "insensitive" } },
      select: { workspaceId: true },
    });
    expect(created?.workspaceId).toBe(alpha.id);
  });
});
