/**
 * An Action's name may still hold the legacy Tiptap HTML that ADR-0017
 * tolerates on read. PR 673 routed the /time page and the side-nav timer
 * through toPlainText(); the calendar renders the same TimeEntry rows that
 * page does, and until this fix its blocks printed the raw
 * `<a target="_blank" …>` source at the reader.
 *
 * None of these surfaces can render that markup as a link: the tooltip line
 * and the aria-label are strings, and each block is its own click target,
 * where an anchor would swallow the click that opens the entry. They show the
 * text a reader would see.
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
    startedAt: new Date("2026-10-08T08:00:00Z"),
    endedAt: new Date("2026-10-08T09:00:00Z"),
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
    scheduledStart: new Date("2026-10-08T08:00:00Z"),
    scheduledEnd: new Date("2026-10-08T09:00:00Z"),
    duration: 60,
    status: "ACTIVE",
    project: null,
    source: "action",
  };
}

/** No markup reaches the reader, and no anchor is nested in the click target. */
function expectTextNotMarkup(container: HTMLElement) {
  expect(container.textContent).toContain("Read Situation Analysis doc");
  expect(container.textContent).not.toContain("target=");
  expect(container.textContent).not.toContain("</a>");
  expect(container.querySelectorAll("a")).toHaveLength(0);
}

describe("CalendarTimeEntryBlock", () => {
  test("shows the link text of a legacy HTML name, never its markup", () => {
    const { container } = render(
      <CalendarTimeEntryBlock entry={timeEntry(HTML_NAME)} style={{ height: 60 }} />,
    );

    expectTextNotMarkup(container);
  });

  test("reduces the name to text for the aria-label", () => {
    render(
      <CalendarTimeEntryBlock entry={timeEntry(HTML_NAME)} style={{ height: 60 }} />,
    );

    expect(
      screen.getByLabelText("Time entry: Read Situation Analysis doc"),
    ).toBeTruthy();
  });

  test("falls back to Untitled when the name reduces to nothing", () => {
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

    expectTextNotMarkup(container);
  });
});

describe("CalendarDayView scheduled actions", () => {
  test("shows the link text of a legacy HTML name, never its markup", () => {
    const { container } = render(
      <CalendarDayView
        events={[]}
        scheduledActions={[scheduledAction(HTML_NAME)]}
        selectedDate={new Date("2026-10-08T08:00:00Z")}
      />,
    );

    expectTextNotMarkup(container);
  });

  test("leaves a plain action name alone", () => {
    const { container } = render(
      <CalendarDayView
        events={[]}
        scheduledActions={[scheduledAction("Syntrofi contracts")]}
        selectedDate={new Date("2026-10-08T08:00:00Z")}
      />,
    );

    expect(container.textContent).toContain("Syntrofi contracts");
  });
});
