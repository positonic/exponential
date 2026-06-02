import { describe, it, expect, beforeEach, vi } from "vitest";
import jwt from "jsonwebtoken";

// Mock the OpenAI Realtime minter so tests never hit the network and so we can
// assert the real OPENAI_API_KEY never leaks into the device-bound payload.
vi.mock("~/server/services/voice/openai-realtime", () => ({
  createRealtimeSession: vi.fn(async () => ({
    ephemeralKey: "ek_test_ephemeral_123",
    expiresAt: 1_900_000_000,
    model: "gpt-4o-realtime-preview",
    voice: "alloy",
  })),
}));

import { getTestDb } from "~/test/test-db";
import { createUser, createApiKey, createWorkspace } from "~/test/factories";
import { createApiKeyCaller, createTestCaller } from "~/test/trpc-helpers";
import { mintVoiceSessionToken } from "~/server/utils/voice-token";
import { generateJWT } from "~/server/utils/jwt";

type Db = ReturnType<typeof getTestDb>;

describe("voice router (integration)", () => {
  let db: Db;
  beforeEach(() => {
    db = getTestDb();
  });

  describe("createSession (session minter)", () => {
    it("mints an OpenAI ephemeral key + voice-session JWT for a valid durable API key", async () => {
      const user = await createUser(db);
      const { raw } = await createApiKey(db, user.id);

      const res = await createApiKeyCaller(raw).voice.createSession();

      expect(res.openaiEphemeralKey).toBe("ek_test_ephemeral_123");
      expect(typeof res.voiceSessionToken).toBe("string");

      // The real server-side OpenAI key must never appear in the device payload.
      const payload = JSON.stringify(res);
      expect(payload).not.toContain(process.env.OPENAI_API_KEY ?? "sk-NEVER");
      expect(payload).not.toContain("sk-test-dummy-key-for-integration-tests");

      // voice-session JWT: correct audience, token type, subject, ~30-min expiry.
      const decoded = jwt.verify(res.voiceSessionToken, process.env.AUTH_SECRET!, {
        audience: "voice-session",
        issuer: "todo-app",
      }) as { sub: string; tokenType: string; exp: number; iat: number };

      expect(decoded.tokenType).toBe("voice-session");
      expect(decoded.sub).toBe(user.id);
      expect(decoded.exp - decoded.iat).toBe(30 * 60);
      expect(res.expiresInSeconds).toBe(1800);
    });

    it("mints a voice-session JWT from a NextAuth session cookie (no API key)", async () => {
      const user = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: user.id, name: "Cookie WS" });

      // createTestCaller authenticates via a session (the web client's path) —
      // no x-api-key is ever set.
      const res = await createTestCaller(user.id).voice.createSession();

      const decoded = jwt.verify(res.voiceSessionToken, process.env.AUTH_SECRET!, {
        audience: "voice-session",
        issuer: "todo-app",
      }) as { sub: string; tokenType: string; workspaceId?: string };

      expect(decoded.tokenType).toBe("voice-session");
      expect(decoded.sub).toBe(user.id);
      // The workspace claim from the previous ticket is still stamped on the
      // cookie path (resolves to the user's only membership).
      expect(decoded.workspaceId).toBe(ws.id);
    });

    it("cookie and x-api-key resolve to the same user; both carry the workspace claim", async () => {
      const user = await createUser(db);
      const ws = await createWorkspace(db, { ownerId: user.id, name: "Shared WS" });
      const { raw } = await createApiKey(db, user.id);

      const viaCookie = await createTestCaller(user.id).voice.createSession();
      const viaKey = await createApiKeyCaller(raw).voice.createSession();

      const decode = (token: string) =>
        jwt.verify(token, process.env.AUTH_SECRET!, {
          audience: "voice-session",
          issuer: "todo-app",
        }) as { sub: string; workspaceId?: string };

      const dc = decode(viaCookie.voiceSessionToken);
      const dk = decode(viaKey.voiceSessionToken);

      expect(dc.sub).toBe(user.id);
      expect(dk.sub).toBe(user.id);
      expect(dc.workspaceId).toBe(ws.id);
      expect(dk.workspaceId).toBe(ws.id);
    });

    it("rejects an invalid API key", async () => {
      await expect(
        createApiKeyCaller("not-a-real-key").voice.createSession(),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("rejects a missing API key", async () => {
      await expect(
        createApiKeyCaller(null).voice.createSession(),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("rejects an expired API key", async () => {
      const user = await createUser(db);
      const { raw } = await createApiKey(db, user.id, {
        expiresAt: new Date(Date.now() - 60_000),
      });
      await expect(
        createApiKeyCaller(raw).voice.createSession(),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
  });

  describe("dispatch (voice brain endpoint)", () => {
    it("accepts a valid voice-session token and echoes a stub for an unimplemented tool", async () => {
      const user = await createUser(db);
      const token = mintVoiceSessionToken({ id: user.id });

      // All four coarse tools are now real, so exercise the dispatch auth +
      // stub-echo fallthrough with an unknown tool name (the default case).
      const res = await createApiKeyCaller(null).voice.dispatch({
        token,
        toolName: "unknown_tool",
      });

      expect(res.speakable).toContain("unknown_tool");
      expect(res.needsConfirmation).toBe(false);
      expect(res.structured).toMatchObject({
        stub: true,
        userId: user.id,
        toolName: "unknown_tool",
      });
    });

    it("rejects a call with a missing/garbage token", async () => {
      await expect(
        createApiKeyCaller(null).voice.dispatch({ token: "garbage", toolName: "query" }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("rejects a JWT minted for a different surface (wrong audience)", async () => {
      const user = await createUser(db);
      const wrongAudience = generateJWT({ id: user.id }, { tokenType: "agent-context" });
      await expect(
        createApiKeyCaller(null).voice.dispatch({ token: wrongAudience, toolName: "query" }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
  });
});
