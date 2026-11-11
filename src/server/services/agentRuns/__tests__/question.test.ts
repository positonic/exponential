import { describe, it, expect, vi } from "vitest";

// The pure helpers under test sit beside postRunQuestion, whose comment
// writer pulls in the db module; keep that out of a pure test.
vi.mock("~/server/services/actions/comments", () => ({ createActionComment: vi.fn() }));

import { mentionLabel, resolveRunQuestionRecipient } from "../question";

describe("resolveRunQuestionRecipient", () => {
  it("is the person who assigned the Action", () => {
    expect(resolveRunQuestionRecipient({ requestedById: "assigner-1", agent: { ownerId: "owner-1" } })).toBe(
      "assigner-1",
    );
  });

  it("falls back to the agent's owner when no person assigned it (an agent reassigned, or a duty)", () => {
    expect(resolveRunQuestionRecipient({ requestedById: null, agent: { ownerId: "owner-1" } })).toBe("owner-1");
  });
});

describe("mentionLabel", () => {
  it("strips the characters that would break the @[Name](id) parser", () => {
    expect(mentionLabel("James [Ops] (he)")).toBe("James Ops he");
  });

  it("falls back when the name is missing or empty once stripped", () => {
    expect(mentionLabel(null)).toBe("there");
    expect(mentionLabel("[]()")).toBe("there");
  });
});
