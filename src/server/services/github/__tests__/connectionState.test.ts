import { describe, expect, it } from "vitest";
import {
  GITHUB_APP_ENV_KEYS,
  isGithubAppConfigured,
  resolveGithubConnectionState,
} from "../connectionState";

/** A complete, valid GitHub App env — every required key present and non-blank. */
function fullEnv(): Record<string, string | undefined> {
  return {
    GITHUB_APP_ID: "123456",
    GITHUB_PRIVATE_KEY: "-----BEGIN KEY-----\nabc\n-----END KEY-----",
    GITHUB_APP_SLUG: "exponential-app",
    GITHUB_WEBHOOK_SECRET: "whsec_abc",
  };
}

describe("isGithubAppConfigured", () => {
  it("returns true when all four env vars are present", () => {
    expect(isGithubAppConfigured(fullEnv())).toBe(true);
  });

  it("returns false when any single env var is missing", () => {
    for (const key of GITHUB_APP_ENV_KEYS) {
      const env = fullEnv();
      delete env[key];
      expect(isGithubAppConfigured(env)).toBe(false);
    }
  });

  it("treats empty or whitespace-only values as missing", () => {
    for (const key of GITHUB_APP_ENV_KEYS) {
      const blank = fullEnv();
      blank[key] = "";
      expect(isGithubAppConfigured(blank)).toBe(false);

      const spaces = fullEnv();
      spaces[key] = "   ";
      expect(isGithubAppConfigured(spaces)).toBe(false);
    }
  });

  it("returns false for an empty environment", () => {
    expect(isGithubAppConfigured({})).toBe(false);
  });
});

describe("resolveGithubConnectionState", () => {
  const installation = { id: "int_1" };

  it("short-circuits to NOT_CONFIGURED when the app is not configured, ignoring install/repos", () => {
    expect(
      resolveGithubConnectionState({
        appConfigured: false,
        installation,
        repoCount: 5,
      }),
    ).toBe("NOT_CONFIGURED");

    expect(
      resolveGithubConnectionState({
        appConfigured: false,
        installation: null,
        repoCount: 0,
      }),
    ).toBe("NOT_CONFIGURED");
  });

  it("returns NOT_INSTALLED when configured but no installation exists", () => {
    expect(
      resolveGithubConnectionState({
        appConfigured: true,
        installation: null,
        repoCount: 0,
      }),
    ).toBe("NOT_INSTALLED");
  });

  it("returns NO_REPOS when installed but zero repos are tracked", () => {
    expect(
      resolveGithubConnectionState({
        appConfigured: true,
        installation,
        repoCount: 0,
      }),
    ).toBe("NO_REPOS");
  });

  it("returns CONNECTED when installed and at least one repo is tracked", () => {
    expect(
      resolveGithubConnectionState({
        appConfigured: true,
        installation,
        repoCount: 1,
      }),
    ).toBe("CONNECTED");

    expect(
      resolveGithubConnectionState({
        appConfigured: true,
        installation,
        repoCount: 42,
      }),
    ).toBe("CONNECTED");
  });

  it("treats a negative repo count as NO_REPOS (defensive)", () => {
    expect(
      resolveGithubConnectionState({
        appConfigured: true,
        installation,
        repoCount: -1,
      }),
    ).toBe("NO_REPOS");
  });
});
