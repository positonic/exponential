import { describe, expect, it } from "vitest";
import { deriveSupersedes } from "../linkDerivation";
import type { AdrDocForLinks } from "../linkDerivation";

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
