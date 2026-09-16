import { describe, expect, it } from "vitest";
import { adrSlug, buildAdrDraft, renderAdrMarkdown, splitBodySections } from "../renderAdrMarkdown";
import { parseAdr } from "~/server/services/adrSync/parser";

const base = {
  number: 61,
  statement: "Ceremonies are definitions with occurrences",
  body: null,
  status: "ACCEPTED" as const,
  decidedAt: new Date("2026-09-12T10:00:00Z"),
  deciderNames: [] as string[],
};

describe("adrSlug", () => {
  it("slugs a statement and caps the length on a word boundary", () => {
    expect(adrSlug("Ceremonies are definitions with occurrences")).toBe(
      "ceremonies-are-definitions-with-occurrences",
    );
    const long = adrSlug(
      "We should absolutely always prefer deterministic queries over generated narratives everywhere",
    );
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long.endsWith("-")).toBe(false);
  });

  it("never produces an empty slug", () => {
    expect(adrSlug("!!!")).toBe("decision");
  });
});

describe("splitBodySections", () => {
  it("keeps text that appears before any heading", () => {
    const { intro, sections } = splitBodySections("Some preamble\n\n## Context\n\n- a point");
    expect(intro).toBe("Some preamble");
    expect(sections).toEqual([{ heading: "Context", content: "- a point" }]);
  });

  it("treats a body with no headings as one unnamed block", () => {
    expect(splitBodySections("Just a paragraph.")).toEqual({ intro: "Just a paragraph.", sections: [] });
  });

  it("is empty for an absent body", () => {
    expect(splitBodySections(null)).toEqual({ intro: "", sections: [] });
  });
});

describe("renderAdrMarkdown", () => {
  it("puts the statement in the title and the Decision section, with the status the parser reads", () => {
    const md = renderAdrMarkdown(base);
    expect(md).toContain("# Ceremonies are definitions with occurrences");
    expect(md).toContain("## Status\n\nAccepted — 2026-09-12");
    expect(md).toContain("## Decision\n\nCeremonies are definitions with occurrences");
  });

  it("orders the body's sections the way the house ADRs read", () => {
    const md = renderAdrMarkdown({
      ...base,
      body: "## Consequences\n\n- slower\n\n## Context\n\n- the problem\n\n## Alternatives considered\n\n- do nothing",
    });
    expect(md.indexOf("## Context")).toBeLessThan(md.indexOf("## Decision"));
    expect(md.indexOf("## Decision")).toBeLessThan(md.indexOf("## Alternatives considered"));
    expect(md.indexOf("## Alternatives considered")).toBeLessThan(md.indexOf("## Consequences"));
  });

  it("uses a heading-less body as the context rather than dropping it", () => {
    const md = renderAdrMarkdown({ ...base, body: "We kept hitting the same argument." });
    expect(md).toContain("## Context\n\nWe kept hitting the same argument.");
  });

  it("keeps unrecognised sections and stray intro prose", () => {
    const md = renderAdrMarkdown({
      ...base,
      body: "Loose opening.\n\n## Context\n\n- a\n\n## Rollout\n\n- behind a flag",
    });
    expect(md).toContain("## Rollout\n\n- behind a flag");
    expect(md).toContain("## Notes\n\nLoose opening.");
  });

  it("names the deciders and the meeting it came from", () => {
    const md = renderAdrMarkdown({
      ...base,
      deciderNames: ["Andi", "Zineb", "James"],
      meetingTitle: "Product Prioritisation",
      meetingDate: new Date("2026-09-10T09:00:00Z"),
    });
    expect(md).toContain("Decided by Andi, Zineb and James.");
    expect(md).toContain('Drafted from Exponential decision D-0061, recorded in "Product Prioritisation" on 2026-09-10.');
  });

  it("says where it came from even with no meeting", () => {
    expect(renderAdrMarkdown(base)).toContain("Drafted from Exponential decision D-0061.");
  });

  it("omits the date when the decision has none", () => {
    expect(renderAdrMarkdown({ ...base, decidedAt: null })).toContain("## Status\n\nAccepted\n");
  });
});

describe("the rendered file survives the ADR sync parser", () => {
  it("reads back with the same title, status and number", () => {
    const draft = buildAdrDraft(
      { ...base, body: "## Context\n\n- the problem", deciderNames: ["Andi"] },
      { nextNumber: 61, adrPath: "docs/adr" },
    );
    const parsed = parseAdr({ path: draft.path, content: draft.markdown });
    expect(parsed.title).toBe("Ceremonies are definitions with occurrences");
    expect(parsed.status).toBe("ACCEPTED");
    expect(parsed.number).toBe(61);
    expect(parsed.isTemplate).toBe(false);
    // The status line doubles as the date line the parser reads, so the
    // decided-at survives the round trip without a separate `Date:` row.
    expect(parsed.decidedAt?.toISOString().slice(0, 10)).toBe("2026-09-12");
  });

  it("a proposed decision reads back as PROPOSED", () => {
    const draft = buildAdrDraft({ ...base, status: "PROPOSED" }, { nextNumber: 7, adrPath: "docs/adr" });
    expect(parseAdr({ path: draft.path, content: draft.markdown }).status).toBe("PROPOSED");
  });
});

describe("buildAdrDraft", () => {
  it("numbers the filename and puts it under the configured path", () => {
    const draft = buildAdrDraft(base, { nextNumber: 61, adrPath: "docs/adr" });
    expect(draft.path).toBe("docs/adr/0061-ceremonies-are-definitions-with-occurrences.md");
    expect(draft.number).toBe(61);
  });

  it("tolerates a trailing slash on the configured path", () => {
    expect(buildAdrDraft(base, { nextNumber: 2, adrPath: "docs/decisions/" }).path).toBe(
      "docs/decisions/0002-ceremonies-are-definitions-with-occurrences.md",
    );
  });
});
