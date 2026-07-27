import { describe, it, expect, beforeAll } from "vitest";
import jwt from "jsonwebtoken";

import {
  signUnsubscribeToken,
  verifyUnsubscribeToken,
} from "../crmUnsubscribeToken";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-for-unsubscribe";
});

describe("crmUnsubscribeToken", () => {
  it("round-trips a contact id", () => {
    const token = signUnsubscribeToken("contact-123");
    expect(verifyUnsubscribeToken(token)).toBe("contact-123");
  });

  it("rejects a tampered token", () => {
    const token = signUnsubscribeToken("contact-123");
    const tampered = token.slice(0, -2) + (token.endsWith("a") ? "bb" : "aa");
    expect(verifyUnsubscribeToken(tampered)).toBeNull();
  });

  it("rejects a token signed with a different secret (foreign)", () => {
    const foreign = jwt.sign(
      { contactId: "contact-123", purpose: "crm-unsubscribe" },
      "some-other-secret",
    );
    expect(verifyUnsubscribeToken(foreign)).toBeNull();
  });

  it("rejects a validly-signed token with the wrong purpose", () => {
    const wrongPurpose = jwt.sign(
      { contactId: "contact-123", purpose: "something-else" },
      process.env.AUTH_SECRET!,
    );
    expect(verifyUnsubscribeToken(wrongPurpose)).toBeNull();
  });

  it("rejects garbage", () => {
    expect(verifyUnsubscribeToken("not-a-jwt")).toBeNull();
  });
});
