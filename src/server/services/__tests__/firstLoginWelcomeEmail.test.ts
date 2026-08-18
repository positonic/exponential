/**
 * Unit tests for `buildFirstLoginWelcomeEmail` — the pure content builder for
 * the Welcome email (the single onboarding email a user ever receives). Covers
 * the variant frame (invited vs organic), the inviter fallback, the
 * deterministic chat-tool slot, and HTML escaping of attacker-writable names.
 * `~/server/db` is mocked because the module imports it for `resolvePostmark`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

vi.mock("~/server/db", () => ({
  db: { integration: { findFirst: vi.fn() } },
}));

import { buildFirstLoginWelcomeEmail } from "../EmailService";

beforeEach(() => {
  process.env.NEXTAUTH_URL = "https://app.test/";
});

describe("buildFirstLoginWelcomeEmail", () => {
  it("organic signup: generic subject, 'Thanks for signing up', Slack default", () => {
    const { subject, htmlBody, textBody } = buildFirstLoginWelcomeEmail({
      to: "organic@example.com",
    });
    expect(subject).toBe(
      "Welcome to Exponential — here's the only thing you need to do",
    );
    expect(textBody).toContain("Thanks for signing up for Exponential.");
    expect(textBody).toContain("Slack thread");
    expect(htmlBody).toContain("Hi there,");
  });

  it("invited: subject and heading name the workspace, opening names the inviter", () => {
    const { subject, htmlBody, textBody } = buildFirstLoginWelcomeEmail({
      to: "invitee@example.com",
      name: "Alex",
      invited: { workspaceName: "Syntrofi", inviterName: "James" },
    });
    expect(subject).toBe("Welcome to Syntrofi on Exponential");
    expect(htmlBody).toContain("You&#39;ve joined Syntrofi");
    expect(textBody).toContain("James added you to Syntrofi — you're in.");
    expect(htmlBody).toContain("Hi Alex,");
  });

  it("invited without an inviter name: nameless opening", () => {
    const { textBody } = buildFirstLoginWelcomeEmail({
      to: "invitee@example.com",
      invited: { workspaceName: "Acme", inviterName: null },
    });
    expect(textBody).toContain("You've been added to Acme — you're in.");
  });

  it("chat-tool slot: Matrix only, and 'Slack or Matrix' when both", () => {
    const matrixOnly = buildFirstLoginWelcomeEmail({
      to: "a@example.com",
      invited: { workspaceName: "W", inviterName: null },
      chatTools: { slack: false, matrix: true },
    });
    expect(matrixOnly.textBody).toContain("Matrix thread");
    expect(matrixOnly.textBody).not.toContain("Slack or Matrix");

    const both = buildFirstLoginWelcomeEmail({
      to: "a@example.com",
      invited: { workspaceName: "W", inviterName: null },
      chatTools: { slack: true, matrix: true },
    });
    expect(both.textBody).toContain("Slack or Matrix thread");
  });

  it("escapes attacker-writable workspace and inviter names in the HTML body", () => {
    const { htmlBody } = buildFirstLoginWelcomeEmail({
      to: "x@example.com",
      invited: {
        workspaceName: '<img src=x onerror=alert(1)>',
        inviterName: "<b>Evil</b>",
      },
    });
    expect(htmlBody).not.toContain("<img src=x");
    expect(htmlBody).not.toContain("<b>Evil</b>");
    expect(htmlBody).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("treats a whitespace-only name as missing", () => {
    const { htmlBody } = buildFirstLoginWelcomeEmail({
      to: "x@example.com",
      name: "   ",
    });
    expect(htmlBody).toContain("Hi there,");
  });

  it("strips a trailing slash from NEXTAUTH_URL in the Daily Planning link", () => {
    const { htmlBody, textBody } = buildFirstLoginWelcomeEmail({
      to: "x@example.com",
    });
    expect(htmlBody).toContain("https://app.test/daily-plan");
    expect(htmlBody).not.toContain("https://app.test//daily-plan");
    expect(textBody).toContain("https://app.test/daily-plan");
  });
});
