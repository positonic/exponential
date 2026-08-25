import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generateInviteUrl, generateTeamInviteUrl } from "../tokens";

// tokens.ts pulls in ~/lib/urls, whose request-scoped half imports
// next/headers; the env-only helper under test never calls it.
vi.mock("next/headers", () => ({ headers: () => new Headers() }));

describe("invite URL generation", () => {
  const originalNextAuthUrl = process.env.NEXTAUTH_URL;
  const originalPublicAppUrl = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    delete process.env.NEXTAUTH_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  afterEach(() => {
    if (originalNextAuthUrl === undefined) delete process.env.NEXTAUTH_URL;
    else process.env.NEXTAUTH_URL = originalNextAuthUrl;
    if (originalPublicAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = originalPublicAppUrl;
  });

  it("uses the public app URL when NEXTAUTH_URL is unset", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";

    expect(generateInviteUrl("tok123")).toBe(
      "https://app.example.com/invite/tok123",
    );
    expect(generateTeamInviteUrl("tok123")).toBe(
      "https://app.example.com/team-invite/tok123",
    );
  });

  it("ignores NEXTAUTH_URL entirely", () => {
    process.env.NEXTAUTH_URL = "http://localhost:3000";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";

    expect(generateInviteUrl("tok123")).toBe(
      "https://app.example.com/invite/tok123",
    );
  });

  it("falls back to the production URL when no env is set", () => {
    expect(generateInviteUrl("tok123")).toBe(
      "https://www.exponential.im/invite/tok123",
    );
  });
});
