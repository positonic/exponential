import { describe, it, expect } from "vitest";
import { assistantOnItToast } from "../assistantOnIt";

const human = { user: { name: "Grace", isAgent: false } };
const aria = { user: { name: "Aria", isAgent: true } };

describe("assistantOnItToast", () => {
  it("names the Assistant when the create started a run", () => {
    expect(
      assistantOnItToast({ name: "Book the venue", agentRunsQueued: 1, assignees: [human, aria] }),
    ).toEqual({ title: "Aria is on it", message: 'Working on "Book the venue"' });
  });

  it("shows nothing when no run started, whoever is assigned", () => {
    expect(assistantOnItToast({ name: "Book the venue", agentRunsQueued: 0, assignees: [aria] })).toBeNull();
    expect(assistantOnItToast({ name: "Book the venue", agentRunsQueued: 0, assignees: [human] })).toBeNull();
  });

  it("falls back to 'Your Assistant' for an unnamed agent principal", () => {
    expect(
      assistantOnItToast({
        name: "Book the venue",
        agentRunsQueued: 1,
        assignees: [{ user: { name: null, isAgent: true } }],
      })?.title,
    ).toBe("Your Assistant is on it");
  });
});
