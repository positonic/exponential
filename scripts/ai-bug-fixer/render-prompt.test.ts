import { describe, expect, it } from "vitest";
import { buildBrief } from "./render-prompt.mjs";

const bugTicket = {
  id: "c1",
  number: 12,
  title: "Fix the thing",
  type: "BUG",
  body: "It breaks.",
};

const featureTicket = {
  id: "c2",
  number: 13,
  title: "Build the thing",
  type: "FEATURE",
  body: "Please build it.",
};

describe("buildBrief framing (keyed on ticket type)", () => {
  it("gives BUG tickets the narrow-fix framing", () => {
    const brief = buildBrief(bugTicket);
    expect(brief).toContain("Bug fix task");
    expect(brief).toContain("smallest change");
  });

  it("gives non-BUG tickets the build-the-ticket framing", () => {
    const brief = buildBrief(featureTicket);
    expect(brief).toContain("Implementation task");
    expect(brief).toContain("Implement **only** what this ticket describes");
  });

  it("defaults missing type to BUG", () => {
    const brief = buildBrief({ ...bugTicket, type: undefined });
    expect(brief).toContain("Bug fix task");
  });
});

describe("buildBrief hard rules (keyed on trigger label)", () => {
  it("omits the schema ban when no label is given (existing behavior)", () => {
    expect(buildBrief(featureTicket)).not.toContain("prisma/schema.prisma");
    expect(buildBrief(featureTicket, "ai-fixable")).not.toContain(
      "prisma/schema.prisma",
    );
  });

  it("states the schema ban for ai-buildable, whatever the ticket type", () => {
    // The guard is keyed to the label, not the type — a BUG-type ticket
    // labelled ai-buildable must still be told to bail on schema changes.
    for (const ticket of [bugTicket, featureTicket]) {
      const brief = buildBrief(ticket, "ai-buildable");
      expect(brief).toContain("prisma/schema.prisma");
      expect(brief).toContain("needs-human.txt");
    }
  });
});
