import { describe, expect, it } from "vitest";
import {
  githubInstallNotice,
  parseGithubInstallResult,
  workspaceGithubSettingsPath,
} from "../installResult";

describe("parseGithubInstallResult", () => {
  it("accepts the known results", () => {
    expect(parseGithubInstallResult("connected")).toBe("connected");
    expect(parseGithubInstallResult("updated")).toBe("updated");
    expect(parseGithubInstallResult("failed")).toBe("failed");
    expect(parseGithubInstallResult("forbidden")).toBe("forbidden");
  });

  it("ignores anything else, so a crafted link cannot choose the message", () => {
    expect(parseGithubInstallResult(null)).toBeNull();
    expect(parseGithubInstallResult("")).toBeNull();
    expect(parseGithubInstallResult("true")).toBeNull();
    expect(parseGithubInstallResult("Your account is locked")).toBeNull();
  });
});

describe("workspaceGithubSettingsPath", () => {
  it("opens the Integrations section of that workspace", () => {
    expect(workspaceGithubSettingsPath("acme")).toBe(
      "/w/acme/settings?section=integrations",
    );
  });

  it("carries the install result", () => {
    expect(workspaceGithubSettingsPath("acme", "connected")).toBe(
      "/w/acme/settings?section=integrations&github=connected",
    );
  });

  it("round-trips through parse", () => {
    const url = new URL(
      workspaceGithubSettingsPath("acme", "failed"),
      "https://example.test",
    );
    expect(parseGithubInstallResult(url.searchParams.get("github"))).toBe(
      "failed",
    );
  });
});

describe("githubInstallNotice", () => {
  it("is green for a completed install and red for a failed one", () => {
    expect(githubInstallNotice("connected").color).toBe("green");
    expect(githubInstallNotice("updated").color).toBe("green");
    expect(githubInstallNotice("failed").color).toBe("red");
    expect(githubInstallNotice("forbidden").color).toBe("red");
  });
});
