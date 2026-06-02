import { describe, it, expect } from "vitest";

import { buildDailyBriefSpeakable } from "../dailyBrief";
import { DEFAULT_MAX_SPEAKABLE_LENGTH } from "../speakable";
import type {
  BriefingData,
  BriefingActionLite,
  BriefingProjectLite,
} from "~/server/services/briefingService";

function action(name: string, priority = "Quick"): BriefingActionLite {
  return { id: `a-${name}`, name, dueDate: null, priority, projectName: null };
}

function project(name: string): BriefingProjectLite {
  return { id: `p-${name}`, name, progress: 10, actionCount: 2 };
}

function briefing(overrides: Partial<BriefingData> = {}): BriefingData {
  return {
    dueTodayActions: [],
    overdueActions: [],
    projectsNeedingAttention: [],
    ...overrides,
  };
}

describe("buildDailyBriefSpeakable", () => {
  it("says you're clear when nothing is due or overdue", () => {
    expect(buildDailyBriefSpeakable(briefing())).toBe(
      "Nothing's due today and nothing's overdue.",
    );
  });

  it("names up to two due-today actions inline", () => {
    const out = buildDailyBriefSpeakable(
      briefing({
        dueTodayActions: [action("call Sam"), action("send report")],
      }),
    );
    expect(out).toBe("2 actions due today: call Sam and send report.");
  });

  it("summarises (does not list) when more than two are due today", () => {
    const out = buildDailyBriefSpeakable(
      briefing({
        dueTodayActions: [
          action("call Sam"),
          action("send report"),
          action("book venue"),
          action("pay invoice"),
        ],
      }),
    );
    expect(out).toBe("4 actions due today, including call Sam and send report.");
  });

  it("includes overdue and projects-needing-attention counts", () => {
    const out = buildDailyBriefSpeakable(
      briefing({
        dueTodayActions: [action("ship it")],
        overdueActions: [action("old one"), action("older one")],
        projectsNeedingAttention: [project("Acme")],
      }),
    );
    expect(out).toBe(
      "1 action due today: ship it. 2 actions overdue. 1 project needing attention.",
    );
  });

  it("reports overdue even when nothing is due today", () => {
    const out = buildDailyBriefSpeakable(
      briefing({ overdueActions: [action("late thing")] }),
    );
    expect(out).toBe("1 action overdue.");
  });

  it("stays within the speakable length ceiling", () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      action(`a very long action name number ${i} that rambles on`),
    );
    const out = buildDailyBriefSpeakable(briefing({ dueTodayActions: many }));
    expect(out.length).toBeLessThanOrEqual(DEFAULT_MAX_SPEAKABLE_LENGTH);
  });

  it("strips markdown from action names", () => {
    const out = buildDailyBriefSpeakable(
      briefing({ dueTodayActions: [action("**ship** the _thing_")] }),
    );
    expect(out).toBe("1 action due today: ship the thing.");
  });
});
