import jwt from "jsonwebtoken";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { signUnsubscribeToken } from "~/server/services/crm/crmUnsubscribeToken";
import { signSubscribeToken, verifySubscribeToken } from "../subscribeToken";

const originalSecret = process.env.AUTH_SECRET;
beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret";
});
afterAll(() => {
  process.env.AUTH_SECRET = originalSecret;
});

describe("subscribe tokens", () => {
  it("round-trips the workspace and email", () => {
    const before = Math.floor(Date.now() / 1000) * 1000;
    const signup = verifySubscribeToken(signSubscribeToken("ws-1", "ada@example.com"));
    expect(signup).toMatchObject({ workspaceId: "ws-1", email: "ada@example.com" });
    expect(signup!.requestedAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("rejects tampered, foreign-purpose, wrongly signed and expired tokens", () => {
    const token = signSubscribeToken("ws-1", "ada@example.com");
    expect(verifySubscribeToken(`${token}x`)).toBeNull();
    // An unsubscribe token is signed with the same secret but is not a signup.
    expect(verifySubscribeToken(signUnsubscribeToken("c1"))).toBeNull();
    expect(
      verifySubscribeToken(jwt.sign({ workspaceId: "ws-1", email: "a@b.co", purpose: "update-subscribe" }, "other")),
    ).toBeNull();
    const expired = jwt.sign({ workspaceId: "ws-1", email: "a@b.co", purpose: "update-subscribe" }, "test-secret", {
      expiresIn: -10,
    });
    expect(verifySubscribeToken(expired)).toBeNull();
  });
});
