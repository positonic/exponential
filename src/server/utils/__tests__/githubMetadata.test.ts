import { describe, expect, it } from "vitest";

import { repositoryFullNamesFromMetadata } from "~/server/utils/githubMetadata";

describe("repositoryFullNamesFromMetadata", () => {
  it("skips workspace-installation metadata that has no repository", () => {
    const keys = [
      JSON.stringify({ githubUsername: "a", installationId: 1 }),
      JSON.stringify({ repository: { fullName: "acme/web" } }),
    ];
    expect(repositoryFullNamesFromMetadata(keys)).toEqual(["acme/web"]);
  });

  it("de-duplicates and ignores malformed keys and missing fullName", () => {
    const keys = [
      JSON.stringify({ repository: { fullName: "acme/web" } }),
      JSON.stringify({ repository: { fullName: "acme/web" } }),
      JSON.stringify({ repository: {} }),
      JSON.stringify({ repository: null }),
      "not json",
      "null",
    ];
    expect(repositoryFullNamesFromMetadata(keys)).toEqual(["acme/web"]);
  });
});
