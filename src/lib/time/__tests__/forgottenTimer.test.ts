import { describe, it, expect } from "vitest";
import { flagForgottenTimers } from "../forgottenTimer";

const at = (h: number, m: number) => new Date(2026, 8, 11, h, m);
const entry = (id: string, source: string, start: Date, end: Date | null) => ({
  id,
  source,
  startedAt: start,
  endedAt: end,
});

describe("flagForgottenTimers", () => {
  it("flags a manual entry ending more than 60 minutes after the day's last other activity", () => {
    const flagged = flagForgottenTimers([
      entry("agent", "claude-desktop", at(9, 0), at(10, 30)),
      entry("timer", "plugin", at(10, 0), at(11, 31)), // 61 min past 10:30
    ]);
    expect([...flagged]).toEqual(["timer"]);
  });

  it("exactly 60 minutes is not flagged", () => {
    const flagged = flagForgottenTimers([
      entry("agent", "claude-desktop", at(9, 0), at(10, 30)),
      entry("timer", "manual", at(10, 0), at(11, 30)),
    ]);
    expect(flagged.size).toBe(0);
  });

  it("never flags proposed or agent-run entries, only manual ones", () => {
    const flagged = flagForgottenTimers([
      entry("manual", "manual", at(9, 0), at(9, 30)),
      entry("late-agent", "claude-desktop", at(9, 0), at(13, 0)),
      entry("late-run", "agent-run", at(9, 0), at(14, 0)),
    ]);
    expect(flagged.size).toBe(0);
  });

  it("ignores running entries and needs a second completed entry as reference", () => {
    expect(flagForgottenTimers([entry("only", "plugin", at(9, 0), at(18, 0))]).size).toBe(0);
    expect(
      flagForgottenTimers([
        entry("only", "plugin", at(9, 0), at(18, 0)),
        entry("running", "plugin", at(17, 0), null),
      ]).size,
    ).toBe(0);
  });

  it("uses the latest other end, not the earliest", () => {
    const flagged = flagForgottenTimers([
      entry("a", "claude-desktop", at(9, 0), at(9, 30)),
      entry("b", "claude-desktop", at(12, 0), at(12, 45)),
      entry("timer", "plugin", at(11, 0), at(13, 40)), // 55 min past 12:45
    ]);
    expect(flagged.size).toBe(0);
  });
});
