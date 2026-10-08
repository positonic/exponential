import { describe, it, expect } from "vitest";
import {
  renderShutdownRecapAgentContext,
  renderShutdownRecapMarkdown,
  renderShutdownRecapPlainText,
} from "../render";
import type { ShutdownRecap } from "../types";

function recap(overrides: Partial<ShutdownRecap> = {}): ShutdownRecap {
  return {
    firstName: "James",
    dayLabel: "Thursday 8 October",
    dayKey: "2026-10-08",
    timezone: "Europe/Berlin",
    done: [
      { actionId: "d1", title: "Ship V4a", url: "https://app.test/a/d1", projectName: "Ceremonies", goalTitle: null, keyResultTitle: "5 ceremonies live" },
    ],
    moved: ["Commented on ticket: Recap", "Moved action: A", "Moved action: B", "Moved action: C", "Moved action: D", "Moved action: E"],
    time: ["5h 10m of attention"],
    leftUndone: [
      { n: 1, actionId: "a1", title: "Write [the] brief", url: "https://app.test/a/a1", detail: null },
      { n: 2, actionId: "o1", title: "Old thing", url: "https://app.test/a/o1", detail: "overdue · due 2 Oct" },
    ],
    moreOverdue: 3,
    tomorrowMeetings: ["09:30 Standup"],
    tomorrowActions: [{ n: 3, actionId: "t1", title: "Ship the recap", url: null, detail: "scheduled" }],
    todayUrl: "https://app.test/today",
    ...overrides,
  };
}

describe("renderShutdownRecapMarkdown", () => {
  it("opens with the narrative and numbers the actions you can reply about", () => {
    const md = renderShutdownRecapMarkdown(recap(), "Good day, James.");

    expect(md.startsWith("Good day, James.")).toBe(true);
    expect(md).toContain("- [Ship V4a](https://app.test/a/d1) — 5 ceremonies live");
    expect(md).toContain("1. [Write the brief](https://app.test/a/a1)");
    expect(md).toContain("2. [Old thing](https://app.test/a/o1) — overdue · due 2 Oct");
    expect(md).toContain("…and 3 more overdue on [Today](https://app.test/today)");
    expect(md).toContain("- 📅 09:30 Standup");
    expect(md).toContain("3. Ship the recap — scheduled");
  });

  it("shows five moved lines and counts the rest", () => {
    const md = renderShutdownRecapMarkdown(recap(), "x");
    expect(md).toContain("- Moved action: D");
    expect(md).not.toContain("Moved action: E");
    expect(md).toContain("- and 1 more");
  });

  it("says so plainly when the day is empty instead of dropping the sections", () => {
    const md = renderShutdownRecapMarkdown(
      recap({ done: [], moved: [], time: [], leftUndone: [], moreOverdue: 0, tomorrowMeetings: [], tomorrowActions: [] }),
      "A quiet one.",
    );
    expect(md).toContain("Nothing ticked off today.");
    expect(md).toContain("Nothing left open. Clean slate.");
    expect(md).toContain("Nothing on the calendar or your list yet.");
    expect(md).not.toContain("What moved");
    expect(md).not.toContain("Time");
  });
});

describe("renderShutdownRecapPlainText", () => {
  it("carries no markdown links", () => {
    const text = renderShutdownRecapPlainText(recap(), "Good day.");
    expect(text).not.toMatch(/\]\(/);
    expect(text).toContain("1. Write [the] brief");
    expect(text).toContain("• Ship V4a — 5 ceremonies live");
  });
});

describe("renderShutdownRecapAgentContext", () => {
  it("maps every number in the message to its action id", () => {
    const context = renderShutdownRecapAgentContext(recap())!;
    expect(context).toContain("Shutdown recap for 2026-10-08 (Europe/Berlin)");
    expect(context).toContain('1 = action a1 "Write [the] brief" (left undone today)');
    expect(context).toContain('2 = action o1 "Old thing" (left undone today, overdue · due 2 Oct)');
    expect(context).toContain('3 = action t1 "Ship the recap" (already on tomorrow\'s list, scheduled)');
  });

  it("is null when there is nothing numbered to reply about", () => {
    expect(renderShutdownRecapAgentContext(recap({ leftUndone: [], tomorrowActions: [] }))).toBeNull();
  });
});
