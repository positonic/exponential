import { describe, expect, it } from "vitest";
import { normalizeAccessibleRepos } from "../accessibleRepos";

/** A well-formed slice of GitHub's listReposAccessibleToInstallation payload. */
function githubPayload() {
  return {
    total_count: 2,
    repositories: [
      {
        id: 1,
        name: "exponential",
        full_name: "positonic/exponential",
        private: false,
        owner: { login: "positonic", id: 10 },
      },
      {
        id: 2,
        name: "secret-app",
        full_name: "acme/secret-app",
        private: true,
        owner: { login: "acme", id: 20 },
      },
    ],
  };
}

describe("normalizeAccessibleRepos", () => {
  it("maps a well-formed installation payload to RepoOption[]", () => {
    expect(normalizeAccessibleRepos(githubPayload())).toEqual([
      {
        owner: "positonic",
        name: "exponential",
        fullName: "positonic/exponential",
        private: false,
      },
      {
        owner: "acme",
        name: "secret-app",
        fullName: "acme/secret-app",
        private: true,
      },
    ]);
  });

  it("accepts a bare array as well as the { repositories } envelope", () => {
    const arr = githubPayload().repositories;
    expect(normalizeAccessibleRepos(arr)).toHaveLength(2);
  });

  it("maps the private flag correctly (only strict true is private)", () => {
    const result = normalizeAccessibleRepos({
      repositories: [
        { name: "a", full_name: "o/a", owner: { login: "o" }, private: true },
        { name: "b", full_name: "o/b", owner: { login: "o" }, private: false },
        { name: "c", full_name: "o/c", owner: { login: "o" } }, // missing → false
      ],
    });
    expect(result.map((r) => r.private)).toEqual([true, false, false]);
  });

  it("falls back to the full_name prefix when owner.login is absent", () => {
    const result = normalizeAccessibleRepos({
      repositories: [{ name: "repo", full_name: "owner-x/repo", private: false }],
    });
    expect(result[0]?.owner).toBe("owner-x");
  });

  it("derives full_name from owner + name when full_name is missing", () => {
    const result = normalizeAccessibleRepos({
      repositories: [{ name: "repo", owner: { login: "owner-y" }, private: false }],
    });
    expect(result[0]?.fullName).toBe("owner-y/repo");
  });

  it("drops malformed entries without throwing", () => {
    const result = normalizeAccessibleRepos({
      repositories: [
        null,
        "not-an-object",
        42,
        {}, // no name/owner
        { name: "ok", owner: { login: "o" }, private: false },
      ],
    });
    expect(result).toEqual([
      { owner: "o", name: "ok", fullName: "o/ok", private: false },
    ]);
  });

  it("tolerates empty and non-object inputs", () => {
    expect(normalizeAccessibleRepos({ repositories: [] })).toEqual([]);
    expect(normalizeAccessibleRepos([])).toEqual([]);
    expect(normalizeAccessibleRepos(null)).toEqual([]);
    expect(normalizeAccessibleRepos(undefined)).toEqual([]);
    expect(normalizeAccessibleRepos("garbage")).toEqual([]);
    expect(normalizeAccessibleRepos({})).toEqual([]);
  });
});
