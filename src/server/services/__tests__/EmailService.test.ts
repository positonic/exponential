/**
 * Unit tests for resolvePostmark — the resolver that decides whether a send uses
 * a workspace's own Postmark config or the instance-global env default.
 * `~/server/db` is mocked so only findFirst behavior is exercised.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("~/server/db", () => ({
  db: { integration: { findFirst } },
}));

import { resolvePostmark } from "../EmailService";

const ENV_KEY = "env-server-token";
const ENV_FROM = "noreply@platform.test";

/** A workspace integration row with the given credential rows. */
function integrationWith(
  credentials: { key: string; keyType: string; isEncrypted: boolean }[],
) {
  return { id: "int_1", credentials };
}

beforeEach(() => {
  findFirst.mockReset();
  process.env.AUTH_POSTMARK_KEY = ENV_KEY;
  process.env.AUTH_POSTMARK_FROM = ENV_FROM;
  delete process.env.POSTMARK_SERVER_TOKEN;
});

describe("resolvePostmark", () => {
  it("returns env config when no workspaceId is given (never queries the db)", async () => {
    const result = await resolvePostmark();
    expect(result).toEqual({ apiKey: ENV_KEY, from: ENV_FROM });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("falls back to env config when the workspace has no postmark integration", async () => {
    findFirst.mockResolvedValue(null);
    const result = await resolvePostmark("ws_1");
    expect(result).toEqual({ apiKey: ENV_KEY, from: ENV_FROM });
  });

  it("uses the workspace config when both credentials are present", async () => {
    findFirst.mockResolvedValue(
      integrationWith([
        { key: "ws-token", keyType: "api_key", isEncrypted: false },
        { key: "hello@workspace.test", keyType: "from_address", isEncrypted: false },
      ]),
    );
    const result = await resolvePostmark("ws_1");
    expect(result).toEqual({ apiKey: "ws-token", from: "hello@workspace.test" });
  });

  it("falls back to env when the workspace config is missing the from-address", async () => {
    findFirst.mockResolvedValue(
      integrationWith([
        { key: "ws-token", keyType: "api_key", isEncrypted: false },
      ]),
    );
    const result = await resolvePostmark("ws_1");
    expect(result).toEqual({ apiKey: ENV_KEY, from: ENV_FROM });
  });

  it("looks up the integration by workspaceId only, not by user", async () => {
    findFirst.mockResolvedValue(null);
    await resolvePostmark("ws_1");
    const where = findFirst.mock.calls[0]?.[0]?.where as Record<string, unknown>;
    expect(where).toMatchObject({
      provider: "postmark",
      status: "ACTIVE",
      workspaceId: "ws_1",
    });
    expect(where).not.toHaveProperty("userId");
  });
});
