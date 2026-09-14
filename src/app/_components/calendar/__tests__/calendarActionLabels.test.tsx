/**
 * An Action's name may still hold the legacy Tiptap HTML that ADR-0017
 * tolerates on read. The calendar renders the same TimeEntry rows the /time
 * page does, and until PR 673's seam reached it the blocks printed raw
 * `<a target="_blank" …>` source at the reader.
 *
 * Each surface picks the treatment it can carry: the block body renders the
 * name the way the scheduled-action block beside it already does, while the
 * tooltip line and the aria-label — both single-line strings — show the text a
 * reader would see.
 */

import { describe, expect, test } from "vitest";
import { render, screen } from "~/test/test-utils";

import { CalendarTimeEntryBlock } from "~/app/_components/calendar/CalendarTimeEntryBlock";
import { TimeEntryDragOverlay } from "~/app/_components/calendar/CalendarDndComponents";
import { CalendarDayView } from "~/app/_components/CalendarDayView";
import type {
  CalendarTimeEntry,
  ScheduledAction,
} from "~/app/_components/calendar/types";

const HTML_NAME =
  'Read <a target="_blank" rel="noopener noreferrer" class="text-blue-500 underline cursor-pointer" href="https://app.notion.com/p/PRD">Situation Analysis doc</a>';

function timeEntry(name: string): CalendarTimeEntry {
  return {
    id: "te-1",
    userId: "u1",
    actionId: "a1",
    workspaceId: "w1",
    startedAt: new Date("2026-09-14T08:00:00Z"),
    endedAt: new Date("2026-09-14T09:00:00Z"),
    source: "manual",
    status: "CONFIRMED",
    note: null,
    action: { id: "a1", name, projectId: null, workspaceId: "w1" },
  };
}

function scheduledAction(name: string): ScheduledAction {
  return {
    id: "sa-1",
    actionId: "a1",
    dailyPlanActionId: null,
    name,
    scheduledStart: new Date("2026-09-14T08:00:00Z"),
    scheduledEnd: new Date("2026-09-14T09:00:00Z"),
    duration: 60,
    status: "ACTIVE",
    project: null,
    source: "action",
  };
}

describe("CalendarTimeEntryBlock", () => {
  test("shows the link text of a legacy HTML name, never its markup", () => {
    const { container } = render(
      <CalendarTimeEntryBlock entry={timeEntry(HTML_NAME)} style={{ height: 60 }} />,
    );

    expect(container.textContent).toContain("Situation Analysis doc");
    expect(container.textContent).not.toContain("target=");
    expect(container.textContent).not.toContain("</a>");
  });

  test("reduces the name to text for the aria-label", () => {
    render(
      <CalendarTimeEntryBlock entry={timeEntry(HTML_NAME)} style={{ height: 60 }} />,
    );

    expect(
      screen.getByLabelText("Time entry: Read Situation Analysis doc"),
    ).toBeTruthy();
  });

  test("falls back to Untitled in the aria-label when the name reduces to nothing", () => {
    render(
      <CalendarTimeEntryBlock entry={timeEntry("<p></p>")} style={{ height: 60 }} />,
    );

    expect(screen.getByLabelText("Time entry: Untitled")).toBeTruthy();
  });

  test("leaves a plain action name alone", () => {
    render(
      <CalendarTimeEntryBlock
        entry={timeEntry("Syntrofi contracts")}
        style={{ height: 60 }}
      />,
    );

    expect(screen.getByLabelText("Time entry: Syntrofi contracts")).toBeTruthy();
    expect(screen.getByText("Syntrofi contracts")).toBeTruthy();
  });
});

describe("TimeEntryDragOverlay", () => {
  test("shows the link text of a legacy HTML name, never its markup", () => {
    const { container } = render(
      <TimeEntryDragOverlay entry={timeEntry(HTML_NAME)} />,
    );

    expect(container.textContent).toContain("Situation Analysis doc");
    expect(container.textContent).not.toContain("target=");
    expect(container.textContent).not.toContain("</a>");
  });
});

describe("CalendarDayView scheduled actions", () => {
  test("shows the link text of a legacy HTML name, never its markup", () => {
    const { container } = render(
      <CalendarDayView
        events={[]}
        scheduledActions={[scheduledAction(HTML_NAME)]}
        selectedDate={new Date("2026-09-14T08:00:00Z")}
      />,
    );

    expect(container.textContent).toContain("Situation Analysis doc");
    expect(container.textContent).not.toContain("target=");
    expect(container.textContent).not.toContain("</a>");
  });

  test("leaves a plain action name alone", () => {
    const { container } = render(
      <CalendarDayView
        events={[]}
        scheduledActions={[scheduledAction("Syntrofi contracts")]}
        selectedDate={new Date("2026-09-14T08:00:00Z")}
      />,
    );

    expect(container.textContent).toContain("Syntrofi contracts");
  });
});
