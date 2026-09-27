import { describe, it, expect } from "vitest";
import {
  countsToMove,
  proposeMerge,
  resolveMergeChoices,
  suggestPrimary,
  unionValues,
  type MergeCandidate,
} from "../contactMerge";

function candidate(overrides: Partial<MergeCandidate> & { id: string }): MergeCandidate {
  return {
    firstName: null,
    lastName: null,
    email: null,
    phone: null,
    linkedIn: null,
    telegram: null,
    twitter: null,
    github: null,
    bluesky: null,
    about: null,
    profileType: null,
    organizationId: null,
    organizationName: null,
    skills: [],
    tags: [],
    aiSourcedFields: [],
    imageUrl: null,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    lastInteractionAt: null,
    connectionScore: 0,
    counts: {
      interactions: 0,
      communications: 0,
      deals: 0,
      meetings: 0,
      screenshots: 0,
      enrichments: 0,
      listMemberships: 0,
    },
    ...overrides,
  };
}

describe("suggestPrimary", () => {
  it("picks the contact with the most data", () => {
    const sparse = candidate({ id: "sparse", firstName: "Ada" });
    const rich = candidate({
      id: "rich",
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      createdAt: new Date("2025-01-01T00:00:00Z"),
    });
    expect(suggestPrimary([sparse, rich])).toBe("rich");
  });

  it("counts attached records, not just fields", () => {
    const fields = candidate({ id: "fields", firstName: "Ada", lastName: "L", email: "a@b.c" });
    const history = candidate({
      id: "history",
      firstName: "Ada",
      counts: { ...fields.counts, interactions: 5, deals: 1 },
    });
    expect(suggestPrimary([fields, history])).toBe("history");
  });

  it("breaks ties in favour of the oldest record", () => {
    const older = candidate({ id: "older", firstName: "Ada", createdAt: new Date("2023-01-01") });
    const newer = candidate({ id: "newer", firstName: "Ada", createdAt: new Date("2024-06-01") });
    expect(suggestPrimary([newer, older])).toBe("older");
  });
});

describe("proposeMerge", () => {
  it("keeps the primary's own value when it has one", () => {
    const a = candidate({ id: "a", phone: "+1 111" });
    const b = candidate({ id: "b", phone: "+1 222", lastName: "Lovelace", email: "x@y.z" });
    const proposal = proposeMerge([a, b], "a");
    const phone = proposal.fields.find((f) => f.key === "phone")!;
    expect(phone.suggestedContactId).toBe("a");
    expect(phone.status).toBe("conflict");
  });

  it("fills the primary's gaps from the richest other contact", () => {
    const primary = candidate({ id: "p", firstName: "Ada" });
    const thin = candidate({ id: "thin", email: "thin@example.com" });
    const rich = candidate({
      id: "rich",
      email: "rich@example.com",
      lastName: "Lovelace",
      phone: "+44",
    });
    const proposal = proposeMerge([primary, thin, rich], "p");
    const email = proposal.fields.find((f) => f.key === "email")!;
    expect(email.suggestedContactId).toBe("rich");
    expect(email.options.map((o) => o.contactId)).toEqual(["rich", "thin"]);
  });

  it("prefers a human-entered value over the primary's AI-sourced one", () => {
    const primary = candidate({
      id: "p",
      linkedIn: "https://linkedin.com/in/wrong-ada",
      aiSourcedFields: ["linkedIn"],
    });
    const human = candidate({ id: "h", linkedIn: "https://linkedin.com/in/real-ada" });
    const proposal = proposeMerge([primary, human], "p");
    const linkedIn = proposal.fields.find((f) => f.key === "linkedIn")!;
    expect(linkedIn.suggestedContactId).toBe("h");
    expect(linkedIn.options[0]).toMatchObject({ contactId: "p", isAiSourced: true });
  });

  it("falls back to an AI-sourced value when nothing else exists", () => {
    const primary = candidate({ id: "p" });
    const ai = candidate({ id: "ai", github: "adal", aiSourcedFields: ["github"] });
    const proposal = proposeMerge([primary, ai], "p");
    expect(proposal.fields.find((f) => f.key === "github")!.suggestedContactId).toBe("ai");
  });

  it("classifies field agreement", () => {
    const a = candidate({ id: "a", email: "Ada@Example.com", firstName: "Ada" });
    const b = candidate({ id: "b", email: "ada@example.com", firstName: "Augusta" });
    const proposal = proposeMerge([a, b], "a");
    const byKey = Object.fromEntries(proposal.fields.map((f) => [f.key, f.status]));
    expect(byKey.email).toBe("same"); // case-insensitive for email
    expect(byKey.firstName).toBe("conflict");
    expect(byKey.phone).toBe("empty");
    expect(byKey.lastName).toBe("empty");
  });

  it("shows the organization name, not its id", () => {
    const a = candidate({ id: "a", organizationId: "org-1", organizationName: "Analytical Engines" });
    const proposal = proposeMerge([a, candidate({ id: "b" })], "a");
    const org = proposal.fields.find((f) => f.key === "organizationId")!;
    expect(org.options[0]).toMatchObject({ value: "org-1", display: "Analytical Engines" });
  });

  it("unions skills and tags", () => {
    const a = candidate({ id: "a", skills: ["math", "poetry"], tags: ["vip"] });
    const b = candidate({ id: "b", skills: ["poetry", "engines "], tags: [" vip", "london"] });
    const proposal = proposeMerge([a, b], "a");
    expect(proposal.skills).toEqual(["math", "poetry", "engines"]);
    expect(proposal.tags).toEqual(["vip", "london"]);
  });

  it("rejects a primary that is not a candidate", () => {
    expect(() => proposeMerge([candidate({ id: "a" })], "zzz")).toThrow(/primaryId/);
  });
});

describe("resolveMergeChoices", () => {
  const primary = candidate({
    id: "p",
    firstName: "Ada",
    phone: "+1",
    twitter: "@ai_ada",
    aiSourcedFields: ["twitter"],
  });
  const other = candidate({ id: "o", firstName: "Augusta", lastName: "King", phone: "+2" });

  it("uses the proposal when no choices are given", () => {
    const resolved = resolveMergeChoices([primary, other], "p");
    expect(resolved.values.firstName).toBe("Ada");
    expect(resolved.values.lastName).toBe("King");
    expect(resolved.values.phone).toBe("+1");
    expect(resolved.sourceByField.lastName).toBe("o");
  });

  it("honours an override and a clear", () => {
    const resolved = resolveMergeChoices([primary, other], "p", {
      firstName: "o",
      phone: null,
    });
    expect(resolved.values.firstName).toBe("Augusta");
    expect(resolved.values.phone).toBeNull();
    expect(resolved.sourceByField.phone).toBeNull();
  });

  it("carries AI provenance only for values that were AI-sourced where they came from", () => {
    const resolved = resolveMergeChoices([primary, other], "p");
    expect(resolved.aiSourcedFields).toEqual(["twitter"]);
    const cleared = resolveMergeChoices([primary, other], "p", { twitter: null });
    expect(cleared.aiSourcedFields).toEqual([]);
  });

  it("rejects a choice pointing at a stranger or an empty value", () => {
    expect(() => resolveMergeChoices([primary, other], "p", { firstName: "nope" })).toThrow(
      /not part of this merge/,
    );
    expect(() => resolveMergeChoices([primary, other], "p", { lastName: "p" })).toThrow(
      /has no value/,
    );
  });
});

describe("helpers", () => {
  it("unionValues trims, dedupes and keeps first-seen order", () => {
    expect(unionValues([["a", "b "], [" b", "", "c"]])).toEqual(["a", "b", "c"]);
  });

  it("countsToMove sums only the duplicates", () => {
    const p = candidate({ id: "p", counts: { ...candidate({ id: "x" }).counts, deals: 9 } });
    const d1 = candidate({ id: "d1", counts: { ...p.counts, deals: 1, interactions: 2 } });
    const d2 = candidate({ id: "d2", counts: { ...p.counts, deals: 0, listMemberships: 3 } });
    expect(countsToMove([p, d1, d2], "p")).toMatchObject({
      deals: 1,
      interactions: 2,
      listMemberships: 3,
    });
  });
});
