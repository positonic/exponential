import { describe, expect, it } from "vitest";
import {
  DAILY_SUMMARY_EMPTY,
  DAILY_SUMMARY_HEADINGS,
  renderDailySummaryMarkdown,
  renderDailySummaryPlainText,
} from "../render";
import type { DailySummaryDigest } from "../types";

const BASE = "https://app.test";

export const fullDigest: DailySummaryDigest = {
  firstName: "James",
  yesterday: [
    {
      startLocal: "09:00",
      title: "CLEAR daily standup",
      recordingUrl: `${BASE}/recording/rec1`,
      source: "calendar",
    },
    { startLocal: "14:00", title: "Coffee with Ira", recordingUrl: null, source: "calendar" },
    { startLocal: null, title: "Offsite", recordingUrl: null, source: "calendar" },
    {
      startLocal: "16:30",
      title: "Pipeline sync",
      recordingUrl: `${BASE}/recording/rec2`,
      source: "recording",
    },
  ],
  todayMeetings: [
    { startLocal: "09:00", title: "CLEAR daily standup" },
    { startLocal: null, title: "Public holiday" },
  ],
  todaysActions: [{ name: "Gather medical bills" }, { name: "Pay Malte" }],
  overdueCount: 32,
  todayUrl: `${BASE}/today`,
  cycles: [
    {
      productName: "CLEAR",
      name: "Cycle 15",
      range: "3 Sep – 16 Sep",
      daysLeft: 7,
      completed: 0,
      committed: 2,
      unit: "pts",
      elapsedPct: 51,
      pace: "behind",
      cycleUrl: `${BASE}/w/acme/products/clear/cycles/cy1`,
      inFlight: [
        {
          label: "C-532 x.com signals - poc",
          status: "IN_PROGRESS",
          url: `${BASE}/w/acme/products/clear/tickets/t532`,
        },
      ],
      upNext: [
        {
          label: "C-154 Specify a pipeline testing thunderdome",
          url: `${BASE}/w/acme/products/clear/tickets/t154`,
        },
        {
          label: "C-470 Define delivery playbook",
          url: `${BASE}/w/acme/products/clear/tickets/t470`,
        },
      ],
      unrefinedCount: 2,
    },
  ],
};

export const emptyDigest: DailySummaryDigest = {
  firstName: "there",
  yesterday: [],
  todayMeetings: [],
  todaysActions: [],
  overdueCount: 0,
  todayUrl: `${BASE}/today`,
  cycles: [],
};

const HEADINGS = Object.values(DAILY_SUMMARY_HEADINGS);

describe("renderDailySummaryMarkdown", () => {
  it("renders every section heading in bold, in order, for a full digest", () => {
    const md = renderDailySummaryMarkdown(fullDigest);
    const positions = HEADINGS.map((h) => md.indexOf(`**${h}**`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("links recordings, tickets, the cycle and /today with [label](url)", () => {
    const md = renderDailySummaryMarkdown(fullDigest);
    expect(md).toContain(`1. 09:00 CLEAR daily standup — [recording](${BASE}/recording/rec1)`);
    expect(md).toContain(`4. 16:30 Pipeline sync (recorded) — [recording](${BASE}/recording/rec2)`);
    expect(md).toContain(`32 overdue → [/today](${BASE}/today)`);
    expect(md).toContain(
      `**🔄 Current cycle** — [Cycle 15](${BASE}/w/acme/products/clear/cycles/cy1) · 3 Sep – 16 Sep · 7 days left`,
    );
    expect(md).toContain("0 / 2 pts done · 51% elapsed · Behind pace");
    expect(md).toContain(
      `- [C-532 x.com signals - poc](${BASE}/w/acme/products/clear/tickets/t532) — In progress`,
    );
    expect(md).toContain(
      `1. [C-154 Specify a pipeline testing thunderdome](${BASE}/w/acme/products/clear/tickets/t154)`,
    );
    expect(md).toContain("2 of your cycle tickets still need refinement");
  });

  it("renders all-day items without a time prefix", () => {
    const md = renderDailySummaryMarkdown(fullDigest);
    expect(md).toContain("3. Offsite\n");
    expect(md).toContain("2. Public holiday\n");
  });

  it("renders one empty-state line per section for an empty digest", () => {
    const md = renderDailySummaryMarkdown(emptyDigest);
    for (const h of HEADINGS) expect(md).toContain(`**${h}**`);
    for (const line of Object.values(DAILY_SUMMARY_EMPTY)) {
      if (line === DAILY_SUMMARY_EMPTY.inFlight) continue; // only inside a cycle block
      expect(md).toContain(line);
    }
    expect(md).toContain("☀️ Good morning there! 👋");
    expect(md).toContain(`0 overdue → [/today](${BASE}/today)`);
    expect(md).not.toContain("need refinement");
  });
});

describe("renderDailySummaryPlainText", () => {
  it("has no markdown syntax and puts each URL on its own line after the item", () => {
    const text = renderDailySummaryPlainText(fullDigest);
    expect(text).not.toMatch(/\*\*|\]\(/);
    expect(text).toContain(
      `1. 09:00 CLEAR daily standup — recording\n   ${BASE}/recording/rec1\n`,
    );
    expect(text).toContain(`32 overdue → ${BASE}/today`);
    expect(text).toContain(
      `🔄 Current cycle — Cycle 15 · 3 Sep – 16 Sep · 7 days left\n0 / 2 pts done · 51% elapsed · Behind pace\n   ${BASE}/w/acme/products/clear/cycles/cy1\n`,
    );
    expect(text).toContain(
      `• C-532 x.com signals - poc — In progress\n   ${BASE}/w/acme/products/clear/tickets/t532`,
    );
    expect(text).toContain(
      `1. C-154 Specify a pipeline testing thunderdome\n   ${BASE}/w/acme/products/clear/tickets/t154`,
    );
  });

  it("renders every heading and empty state for an empty digest", () => {
    const text = renderDailySummaryPlainText(emptyDigest);
    for (const h of HEADINGS) expect(text).toContain(`\n${h}\n`);
    expect(text).toContain(DAILY_SUMMARY_EMPTY.yesterday);
    expect(text).toContain(DAILY_SUMMARY_EMPTY.todayMeetings);
    expect(text).toContain(DAILY_SUMMARY_EMPTY.todaysActions);
    expect(text).toContain(DAILY_SUMMARY_EMPTY.cycle);
    expect(text).toContain(DAILY_SUMMARY_EMPTY.upNext);
  });

  it("phrases days left / over and the unrefined count in the singular", () => {
    const one = {
      ...fullDigest,
      cycles: [{ ...fullDigest.cycles[0]!, daysLeft: -1, unrefinedCount: 1, inFlight: [] }],
    };
    const text = renderDailySummaryPlainText(one);
    expect(text).toContain("· 1 day over");
    expect(text).toContain("1 of your cycle tickets still needs refinement");
    expect(text).toContain(DAILY_SUMMARY_EMPTY.inFlight);
  });
});
