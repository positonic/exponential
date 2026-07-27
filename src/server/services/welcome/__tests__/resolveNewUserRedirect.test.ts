import { describe, it, expect } from "vitest";
import { resolveNewUserRedirect } from "../resolveNewUserRedirect";

const NOW = new Date("2026-07-17T12:00:00Z");

function hoursAgo(hours: number): Date {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000);
}

describe("resolveNewUserRedirect", () => {
  it("redirects a new user (<24h old) who hasn't completed welcome", () => {
    expect(
      resolveNewUserRedirect(
        { createdAt: hoursAgo(1), welcomeCompletedAt: null },
        NOW,
      ),
    ).toBe("/welcome");
  });

  it("redirects right up to the 24h boundary", () => {
    expect(
      resolveNewUserRedirect(
        { createdAt: hoursAgo(23.99), welcomeCompletedAt: null },
        NOW,
      ),
    ).toBe("/welcome");
  });

  it("does not redirect once the account is 24 hours old", () => {
    expect(
      resolveNewUserRedirect(
        { createdAt: hoursAgo(24), welcomeCompletedAt: null },
        NOW,
      ),
    ).toBeNull();
  });

  it("does not redirect an older account regardless of welcome completion", () => {
    expect(
      resolveNewUserRedirect(
        { createdAt: hoursAgo(24 * 30), welcomeCompletedAt: null },
        NOW,
      ),
    ).toBeNull();
  });

  it("does not redirect when account age is unknown (no owned workspace)", () => {
    expect(
      resolveNewUserRedirect({ createdAt: null, welcomeCompletedAt: null }, NOW),
    ).toBeNull();
  });

  it("does not redirect when welcome is completed, regardless of age", () => {
    expect(
      resolveNewUserRedirect(
        { createdAt: hoursAgo(1), welcomeCompletedAt: hoursAgo(0.5) },
        NOW,
      ),
    ).toBeNull();
    expect(
      resolveNewUserRedirect(
        { createdAt: hoursAgo(100), welcomeCompletedAt: hoursAgo(50) },
        NOW,
      ),
    ).toBeNull();
  });
});
