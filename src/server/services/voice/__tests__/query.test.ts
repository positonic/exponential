import { describe, it, expect } from "vitest";

import { classifyQuery, describeActions } from "../query";

describe("classifyQuery", () => {
  it("flags goals / OKRs / objectives / key results as out of scope", () => {
    for (const q of [
      "how are my goals?",
      "what's my progress on the Q2 objective?",
      "show my OKRs",
      "any key results at risk?",
      "what's my kpi",
    ]) {
      expect(classifyQuery(q).outOfScope).toBe(true);
    }
  });

  it("flags blockers / dependencies / tickets as out of scope", () => {
    for (const q of [
      "what's blocking the launch?",
      "what am I blocked on?",
      "what does this depend on?",
      "what am I waiting on?",
      "show my tickets",
    ]) {
      expect(classifyQuery(q).outOfScope).toBe(true);
    }
  });

  it("classifies overdue", () => {
    expect(classifyQuery("what's overdue?")).toMatchObject({
      outOfScope: false,
      temporal: "overdue",
      inbox: false,
    });
    expect(classifyQuery("anything past due").temporal).toBe("overdue");
  });

  it("classifies inbox", () => {
    expect(classifyQuery("what's in my inbox?")).toMatchObject({
      outOfScope: false,
      inbox: true,
    });
  });

  it("classifies due this week and due today", () => {
    expect(classifyQuery("what's due this week in Acme?").temporal).toBe(
      "due_this_week",
    );
    expect(classifyQuery("what's due today?").temporal).toBe("due_today");
  });

  it("overdue takes precedence over a bare week mention", () => {
    expect(classifyQuery("what's overdue this week?").temporal).toBe("overdue");
  });

  it("returns no temporal/inbox for a vague question", () => {
    expect(classifyQuery("tell me about the Acme project")).toMatchObject({
      outOfScope: false,
      temporal: null,
      inbox: false,
    });
  });
});

describe("describeActions", () => {
  it("reports an empty inbox specially", () => {
    expect(describeActions("in your inbox", true, [])).toBe("Your inbox is empty.");
  });

  it("reports nothing for an empty scoped result", () => {
    expect(describeActions("overdue", false, [])).toBe("You have nothing overdue.");
  });

  it("names up to two results inline", () => {
    expect(describeActions("overdue", false, ["call Sam", "send report"])).toBe(
      "You have 2 actions overdue: call Sam and send report.",
    );
  });

  it("enumerates up to five results inline", () => {
    expect(
      describeActions("due this week in Acme", false, ["a", "b", "c", "d"]),
    ).toBe("You have 4 actions due this week in Acme: a, b, c and d.");
  });

  it("caps the list and counts the rest beyond five", () => {
    expect(
      describeActions("overdue", false, ["a", "b", "c", "d", "e", "f", "g"]),
    ).toBe("You have 7 actions overdue: a, b, c, d and e, and 2 more.");
  });

  it("phrases the inbox lead differently", () => {
    expect(describeActions("in your inbox", true, ["loose thought"])).toBe(
      "Your inbox has 1 action: loose thought.",
    );
  });

  it("strips markdown from names", () => {
    expect(describeActions("overdue", false, ["**ship** it"])).toBe(
      "You have 1 action overdue: ship it.",
    );
  });
});
