/**
 * The /time surfaces label rows and chart bars with an Action's name, and those
 * names may still hold the legacy Tiptap HTML that ADR-0017 tolerates on read.
 * None of these places can render it as a link — a chart label is SVG text, and
 * the table cell is a single-line label — so they must show the text a reader
 * would see. Until they did, the page printed raw `<a target="_blank" …>` source.
 */

import { describe, expect, test, vi } from "vitest";
import { render, screen } from "~/test/test-utils";

// Recharts measures its container, and happy-dom reports 0x0 - which makes
// ResponsiveContainer render nothing at all. Give it a fixed size so the axis
// labels this test is about actually reach the DOM.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  const { cloneElement } = await import("react");
  return {
    ...actual,
    // ResponsiveContainer's own job - hand the chart a measured size - is what
    // happy-dom cannot do, so stand in for it and pass a fixed one directly.
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) =>
      cloneElement(children, { width: 800, height: 400 }),
  };
});

import { TimeReports } from "~/app/_components/time/TimeReports";
import type { CalendarTimeEntry } from "~/app/_components/calendar/types";

const HTML_NAME =
  'Read <a target="_blank" rel="noopener noreferrer" class="text-blue-500 underline cursor-pointer" href="https://app.notion.com/p/PRD">Situation Analysis doc</a>';

function entry(name: string, id: string): CalendarTimeEntry {
  return {
    id: `te-${id}`,
    actionId: id,
    userId: "u1",
    workspaceId: "w1",
    startedAt: new Date("2026-09-14T08:00:00Z"),
    endedAt: new Date("2026-09-14T09:00:00Z"),
    source: "manual",
    status: "CONFIRMED",
    note: null,
    action: { id, name, projectId: null, workspaceId: "w1" },
  } as unknown as CalendarTimeEntry;
}

describe("TimeReports - By action labels", () => {
  test("labels the bar with the link text, never the raw HTML", () => {
    const { container } = render(<TimeReports entries={[entry(HTML_NAME, "a1")]} />);

    expect(screen.getAllByText("Read Situation Analysis doc").length).toBeGreaterThan(0);
    expect(container.textContent).not.toContain("target=");
    expect(container.textContent).not.toContain("</a>");
  });

  test("leaves a plain action name alone", () => {
    render(<TimeReports entries={[entry("Syntrofi contracts", "a2")]} />);
    expect(screen.getAllByText("Syntrofi contracts").length).toBeGreaterThan(0);
  });
});
