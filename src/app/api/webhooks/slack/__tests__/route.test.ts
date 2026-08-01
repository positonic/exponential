/**
 * Unit tests for the Slack webhook's credential decryption and signature
 * verification (2026-07-30 integration-secrets audit, V2).
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` — no real DB, ever
 * (see CLAUDE.md "Test database safety").
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.hoisted(() => {
  process.env.OPENAI_API_KEY ??= "sk-test-dummy";
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.NODE_ENV ??= "test";
  process.env.GOOGLE_CLIENT_ID ??= "test";
  process.env.GOOGLE_CLIENT_SECRET ??= "test";
  process.env.MASTRA_API_URL ??= "http://localhost:4111";
  process.env.AUTH_DISCORD_ID ??= "test";
  process.env.AUTH_DISCORD_SECRET ??= "test";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  // Raw 32-byte key (encryption.ts accepts raw or base64-encoded 32 bytes).
  process.env.DATABASE_ENCRYPTION_KEY = "0".repeat(32);
});

vi.mock("openai", () => ({
  default: class MockOpenAI {
    constructor(_opts?: unknown) {
      // intentionally empty
    }
  },
}));

vi.mock("next-auth", () => ({
  default: () => ({ auth: () => null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("next-auth/providers/discord", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/google", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/notion", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/postmark", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/microsoft-entra-id", () => ({ default: vi.fn() }));

vi.mock("~/server/auth", () => ({
  auth: () => null,
  handlers: {},
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

const dbHolder: { current: DeepMockProxy<PrismaClient> | null } = { current: null };
function getDbMock(): DeepMockProxy<PrismaClient> {
  if (!dbHolder.current) dbHolder.current = mockDeep<PrismaClient>();
  return dbHolder.current;
}
vi.mock("~/server/db", () => {
  const proxy = new Proxy(
    {},
    {
      get(_t, prop) {
        const m = getDbMock() as unknown as Record<string | symbol, unknown>;
        return m[prop as string];
      },
    },
  );
  return { db: proxy };
});

import type { NextRequest } from "next/server";
import { POST } from "../route";
import { encryptToBase64 } from "~/server/utils/encryption";

const SIGNING_SECRET = "test-signing-secret";
const TEAM_ID = "T0TESTTEAM";

/**
 * A payload the router doesn't recognize as event/command/interactive, so a
 * verified request short-circuits to the "Received but not processed" fallback
 * without touching any handler (handlers would need far deeper DB mocks).
 */
const NEUTRAL_BODY = JSON.stringify({ type: "unit_test_probe", team_id: TEAM_ID });

function slackSignature(body: string, timestamp: string, secret: string): string {
  return `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${body}`, "utf8").digest("hex")}`;
}

function makeRequest(opts: { body?: string; timestamp?: string | null; signature?: string | null }) {
  const body = opts.body ?? NEUTRAL_BODY;
  const headers = new Headers({ "content-type": "application/json" });
  if (opts.timestamp) headers.set("x-slack-request-timestamp", opts.timestamp);
  if (opts.signature) headers.set("x-slack-signature", opts.signature);
  return new Request("http://localhost/api/webhooks/slack", {
    method: "POST",
    headers,
    body,
  }) as unknown as NextRequest;
}

function integrationRow(secretRow: { key: string; isEncrypted: boolean }) {
  return {
    id: "int-1",
    provider: "slack",
    status: "ACTIVE",
    user: { id: "user-1" },
    team: null,
    credentials: [
      { id: "cred-1", keyType: "SIGNING_SECRET", key: secretRow.key, isEncrypted: secretRow.isEncrypted },
      { id: "cred-2", keyType: "BOT_TOKEN", key: "xoxb-not-used-here", isEncrypted: false },
    ],
  };
}

describe("Slack webhook signature verification", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
  });

  function stubIntegration(secretRow: { key: string; isEncrypted: boolean }) {
    db.integration.findFirst.mockResolvedValue(
      integrationRow(secretRow) as unknown as Awaited<ReturnType<PrismaClient["integration"]["findFirst"]>>,
    );
  }

  it("accepts a correctly signed request when the secret is stored encrypted", async () => {
    stubIntegration({ key: encryptToBase64(SIGNING_SECRET), isEncrypted: true });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const res = await POST(
      makeRequest({ timestamp, signature: slackSignature(NEUTRAL_BODY, timestamp, SIGNING_SECRET) }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true });
  });

  it("accepts a correctly signed request when the secret is stored plaintext", async () => {
    stubIntegration({ key: SIGNING_SECRET, isEncrypted: false });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const res = await POST(
      makeRequest({ timestamp, signature: slackSignature(NEUTRAL_BODY, timestamp, SIGNING_SECRET) }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true });
  });

  it("rejects an unsigned request with 401", async () => {
    stubIntegration({ key: SIGNING_SECRET, isEncrypted: false });
    const res = await POST(makeRequest({ timestamp: null, signature: null }));
    expect(res.status).toBe(401);
  });

  it("rejects a request signed under the wrong secret with 401", async () => {
    stubIntegration({ key: SIGNING_SECRET, isEncrypted: false });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const res = await POST(
      makeRequest({ timestamp, signature: slackSignature(NEUTRAL_BODY, timestamp, "wrong-secret") }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects a signed request when the integration has no signing secret", async () => {
    db.integration.findFirst.mockResolvedValue({
      ...integrationRow({ key: SIGNING_SECRET, isEncrypted: false }),
      credentials: [{ id: "cred-2", keyType: "BOT_TOKEN", key: "xoxb-not-used-here", isEncrypted: false }],
    } as unknown as Awaited<ReturnType<PrismaClient["integration"]["findFirst"]>>);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const res = await POST(
      makeRequest({ timestamp, signature: slackSignature(NEUTRAL_BODY, timestamp, SIGNING_SECRET) }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects a request whose secret row is undecryptable ciphertext", async () => {
    // Valid-looking base64 that is not a real AES-GCM payload under the test
    // key — getDecryptedKey returns null, the record omits SIGNING_SECRET,
    // and verification must fail closed.
    stubIntegration({ key: Buffer.from("garbage-ciphertext-that-wont-decrypt").toString("base64"), isEncrypted: true });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const res = await POST(
      makeRequest({ timestamp, signature: slackSignature(NEUTRAL_BODY, timestamp, SIGNING_SECRET) }),
    );
    expect(res.status).toBe(401);
  });
});
