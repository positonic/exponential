import { describe, expect, it } from "vitest";
import { deriveMentions, deriveSupersedes } from "../linkDerivation";
import type { AdrDocForLinks, RepoIdentity } from "../linkDerivation";

function doc(overrides: Partial<AdrDocForLinks> & { id: string }): AdrDocForLinks {
  return {
    repositoryId: "repo1",
    number: null,
    statusRaw: null,
    body: "",
    ...overrides,
  };
}

describe("deriveSupersedes", () => {
  it("creates an edge from the superseder to the superseded", () => {
    const docs = [
      doc({ id: "old", number: 1, statusRaw: "Superseded by ADR-0003" }),
      doc({ id: "new", number: 3, statusRaw: "Accepted" }),
    ];
    expect(deriveSupersedes(docs)).toEqual([
      {
        type: "SUPERSEDES",
        fromId: "new",
        toId: "old",
        evidence: "Superseded by ADR-0003",
      },
    ]);
  });

  it("resolves bare numbers and 'ADR NNNN' spellings", () => {
    const bare = deriveSupersedes([
      doc({ id: "old", number: 1, statusRaw: "superseded by 0002" }),
      doc({ id: "new", number: 2 }),
    ]);
    expect(bare).toHaveLength(1);
    expect(bare[0]).toMatchObject({ fromId: "new", toId: "old" });

    const spaced = deriveSupersedes([
      doc({ id: "old", number: 1, statusRaw: "Superseded by ADR 39" }),
      doc({ id: "new", number: 39 }),
    ]);
    expect(spaced).toHaveLength(1);
  });

  it("derives from mid-status supersession text (real 'Deferred — premise superseded by' case)", () => {
    const links = deriveSupersedes([
      doc({
        id: "old",
        number: 19,
        statusRaw: "Deferred — 2026-06-14. Declaration premise superseded by ADR-0020",
      }),
      doc({ id: "new", number: 20 }),
    ]);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ fromId: "new", toId: "old" });
  });

  it("never guesses on an ambiguous number (duplicate 0055 pair)", () => {
    const links = deriveSupersedes([
      doc({ id: "old", number: 1, statusRaw: "Superseded by ADR-0055" }),
      doc({ id: "a", number: 55 }),
      doc({ id: "b", number: 55 }),
    ]);
    expect(links).toEqual([]);
  });

  it("yields nothing when the referenced number is absent", () => {
    expect(
      deriveSupersedes([
        doc({ id: "old", number: 1, statusRaw: "Superseded by ADR-0099" }),
      ]),
    ).toEqual([]);
  });

  it("ignores statuses without supersession text", () => {
    expect(
      deriveSupersedes([
        doc({ id: "a", number: 1, statusRaw: "Accepted — 2026-05-14." }),
        doc({ id: "b", number: 2, statusRaw: null }),
      ]),
    ).toEqual([]);
  });
});

describe("deriveMentions", () => {
  const REPOS: RepoIdentity[] = [
    { repositoryId: "r-api", fullName: "clear/clear-api", shortCode: "API" },
    { repositoryId: "r-pipe", fullName: "clear/clear-context-pipeline", shortCode: "PIPE" },
  ];

  it("links a SHORTCODE-NNNN reference to the other repo's doc with the line as evidence", () => {
    const source = doc({
      id: "pipe-2",
      repositoryId: "r-pipe",
      number: 2,
      body: "## Context\n\nThe API half of this decision is API-0003.\n",
    });
    const target = doc({ id: "api-3", repositoryId: "r-api", number: 3 });

    expect(deriveMentions([source], REPOS, [source, target])).toEqual([
      {
        type: "MENTIONS",
        fromId: "pipe-2",
        toId: "api-3",
        evidence: "The API half of this decision is API-0003.",
      },
    ]);
  });

  it("links a bare repo-name mention when a number on the same line identifies the doc", () => {
    // The motivating CLEAR case: clear-api/0003 and clear-context-pipeline/0002
    // are two halves of one decision written twice.
    const source = doc({
      id: "api-3",
      repositoryId: "r-api",
      number: 3,
      body: "The pipeline half is 0002 in clear-context-pipeline.\n",
    });
    const target = doc({ id: "pipe-2", repositoryId: "r-pipe", number: 2 });

    const links = deriveMentions([source], REPOS, [source, target]);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      fromId: "api-3",
      toId: "pipe-2",
      evidence: expect.stringContaining("clear-context-pipeline"),
    });
  });

  it("never links a doc to its own repo (own short code / own name)", () => {
    const a = doc({
      id: "api-1",
      repositoryId: "r-api",
      number: 1,
      body: "Supersedes API-0002; see clear-api 0002.\n",
    });
    const b = doc({ id: "api-2", repositoryId: "r-api", number: 2 });

    expect(deriveMentions([a], REPOS, [a, b])).toEqual([]);
  });

  it("ignores short codes that belong to no enrolled repo", () => {
    const source = doc({
      id: "api-1",
      repositoryId: "r-api",
      number: 1,
      body: "Follows RFC-1234 and HTTP-0002 conventions.\n",
    });
    expect(deriveMentions([source], REPOS, [source])).toEqual([]);
  });

  it("dedupes multiple references to the same target", () => {
    const source = doc({
      id: "pipe-1",
      repositoryId: "r-pipe",
      number: 1,
      body: "API-0003 is the sibling.\nAgain: API-0003.\n",
    });
    const target = doc({ id: "api-3", repositoryId: "r-api", number: 3 });

    expect(deriveMentions([source], REPOS, [source, target])).toHaveLength(1);
  });

  // ── False-edge regression cases (false edges are worse than missing ones) ──

  it("does NOT pair a repo name with a bare list marker or count", () => {
    const source = doc({
      id: "api-9",
      repositoryId: "r-api",
      number: 9,
      body: "1. Move ingestion to clear-context-pipeline\nWe retry 5 times before calling clear-context-pipeline.\n",
    });
    const targets = [
      doc({ id: "pipe-1", repositoryId: "r-pipe", number: 1 }),
      doc({ id: "pipe-5", repositoryId: "r-pipe", number: 5 }),
    ];
    expect(deriveMentions([source], REPOS, [source, ...targets])).toEqual([]);
  });

  it("treats a number that exists in the SOURCE repo as a local reference", () => {
    const source = doc({
      id: "api-9",
      repositoryId: "r-api",
      number: 9,
      body: "Supersedes ADR-0007; see also clear-context-pipeline.\n",
    });
    const local = doc({ id: "api-7", repositoryId: "r-api", number: 7 });
    const foreign = doc({ id: "pipe-7", repositoryId: "r-pipe", number: 7 });

    expect(
      deriveMentions([source, local], REPOS, [source, local, foreign]),
    ).toEqual([]);
  });

  it("never guesses when the target repo has duplicate numbers", () => {
    const source = doc({
      id: "pipe-1",
      repositoryId: "r-pipe",
      number: 1,
      body: "See API-0055 for details.\n",
    });
    const dupA = doc({ id: "api-55a", repositoryId: "r-api", number: 55 });
    const dupB = doc({ id: "api-55b", repositoryId: "r-api", number: 55 });

    expect(deriveMentions([source], REPOS, [source, dupA, dupB])).toEqual([]);
  });

  it("does not fire a shorter repo name inside a longer one, or inside words", () => {
    const repos = [
      ...REPOS,
      { repositoryId: "r-clear", fullName: "clear/clear", shortCode: "CLR" },
    ];
    const source = doc({
      id: "pipe-1",
      repositoryId: "r-pipe",
      number: 1,
      body: "clear-api handles auth (see 0004). Clearly capital matters.\n",
    });
    const clearDoc = doc({ id: "clear-4", repositoryId: "r-clear", number: 4 });
    const apiDoc = doc({ id: "api-4", repositoryId: "r-api", number: 4 });

    const links = deriveMentions([source], repos, [source, clearDoc, apiDoc]);
    // "clear-api" + 0004 → r-api's doc; the bare "clear" repo must NOT match
    // inside "clear-api" or "Clearly".
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ toId: "api-4" });
  });

  it("ignores numbers embedded in dates", () => {
    const source = doc({
      id: "pipe-1",
      repositoryId: "r-pipe",
      number: 1,
      body: "Released 2026-06-14 alongside clear-api.\n",
    });
    const target = doc({ id: "api-6", repositoryId: "r-api", number: 6 });
    expect(deriveMentions([source], REPOS, [source, target])).toEqual([]);
  });

  it("escapes regex metacharacters in repo names", () => {
    const repos = [
      ...REPOS,
      { repositoryId: "r-next", fullName: "acme/next.js", shortCode: "NEXT" },
    ];
    const source = doc({
      id: "api-1",
      repositoryId: "r-api",
      number: 1,
      body: "nextXjs is not the same repo, no number here anyway.\n",
    });
    // Must not throw and must not match "nextXjs" via an unescaped dot.
    expect(deriveMentions([source], repos, [source])).toEqual([]);
  });
});
