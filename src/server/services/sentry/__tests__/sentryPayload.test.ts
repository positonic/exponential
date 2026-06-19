/**
 * Unit tests for the pure Sentry webhook helpers — signature verification,
 * payload normalization, and Markdown body building. No DB, no env, no mocks:
 * these are deliberately side-effect-free so they can be exhaustively tested.
 */

import { describe, it, expect } from "vitest";
import crypto from "crypto";
import {
  buildBugBody,
  normalizeSentryPayload,
  verifySentrySignature,
  type SentryBug,
} from "../sentryPayload";

const SECRET = "test-client-secret";

function sign(body: string, secret = SECRET): string {
  return crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

describe("verifySentrySignature", () => {
  const body = JSON.stringify({ action: "created", data: { issue: { id: "1" } } });

  it("accepts a signature computed with the right secret over the exact body", () => {
    expect(verifySentrySignature(body, sign(body), SECRET)).toBe(true);
  });

  it("rejects a wrong signature", () => {
    const wrong = sign(body).replace(/.$/, (c) => (c === "0" ? "1" : "0"));
    expect(verifySentrySignature(body, wrong, SECRET)).toBe(false);
  });

  it("rejects when the body was tampered after signing", () => {
    const signature = sign(body);
    const tampered = body.replace('"1"', '"999"');
    expect(verifySentrySignature(tampered, signature, SECRET)).toBe(false);
  });

  it("rejects a signature made with a different secret", () => {
    expect(verifySentrySignature(body, sign(body, "other-secret"), SECRET)).toBe(
      false,
    );
  });

  it("rejects a malformed (wrong-length) signature without throwing", () => {
    expect(verifySentrySignature(body, "deadbeef", SECRET)).toBe(false);
  });
});

describe("normalizeSentryPayload", () => {
  it("normalizes an issue/created event into a SentryBug", () => {
    const bug = normalizeSentryPayload("issue", {
      action: "created",
      data: {
        issue: {
          id: 42,
          title: "TypeError: undefined is not a function",
          level: "error",
          culprit: "app/page.tsx",
          permalink: "https://sentry.io/issues/42",
          shortId: "EXPONENTIAL-1AB",
        },
      },
    });
    expect(bug).toEqual({
      issueId: "42",
      title: "TypeError: undefined is not a function",
      level: "error",
      culprit: "app/page.tsx",
      url: "https://sentry.io/issues/42",
      shortId: "EXPONENTIAL-1AB",
    });
  });

  it("returns null for issue/created without an id (malformed)", () => {
    expect(
      normalizeSentryPayload("issue", { action: "created", data: { issue: {} } }),
    ).toBeNull();
  });

  it("ignores a non-created issue action (e.g. resolved)", () => {
    expect(
      normalizeSentryPayload("issue", {
        action: "resolved",
        data: { issue: { id: "1" } },
      }),
    ).toBeNull();
  });

  it("ignores unrelated resources (e.g. installation)", () => {
    expect(normalizeSentryPayload("installation", { action: "created" })).toBeNull();
  });

  it("does not throw on null/garbage bodies", () => {
    expect(normalizeSentryPayload("issue", null)).toBeNull();
    expect(normalizeSentryPayload("issue", "not-an-object")).toBeNull();
  });
});

describe("buildBugBody", () => {
  const base: SentryBug = {
    issueId: "42",
    title: "Boom",
    level: "error",
    culprit: "app/page.tsx",
    url: "https://sentry.io/issues/42",
    shortId: "EXPONENTIAL-1AB",
  };

  it("includes provenance, level, culprit, short id, and a Sentry link", () => {
    const md = buildBugBody(base);
    expect(md).toContain("Reported automatically from Sentry.");
    expect(md).toContain("**Level:** error");
    expect(md).toContain("**Culprit:** app/page.tsx");
    expect(md).toContain("**Sentry issue:** EXPONENTIAL-1AB");
    expect(md).toContain("[View in Sentry](https://sentry.io/issues/42)");
  });

  it("omits absent fields without leaving empty bullets", () => {
    const md = buildBugBody({
      issueId: "1",
      title: "Boom",
      level: null,
      culprit: null,
      url: null,
      shortId: null,
    });
    expect(md).toContain("Reported automatically from Sentry.");
    expect(md).not.toContain("**Level:**");
    expect(md).not.toContain("View in Sentry");
  });
});
