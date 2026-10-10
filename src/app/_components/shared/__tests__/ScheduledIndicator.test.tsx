import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScheduledIndicator } from "../ScheduledIndicator";
import { hasUserChosenTime } from "~/lib/actions/scheduling";

const START = new Date(2026, 7, 5, 10, 30, 0, 0);
const END = new Date(2026, 7, 5, 10, 40, 0, 0);

describe("ScheduledIndicator", () => {
  it("marks a task with a duration as scheduled, showing the time", () => {
    render(<ScheduledIndicator action={{ scheduledStart: START, duration: 30 }} />);

    expect(screen.getByText("10:30 AM")).toBeDefined();
    expect(screen.getByText("Scheduled for 10:30 AM, 30 min")).toBeDefined();
    expect(screen.queryByLabelText("Not scheduled")).toBeNull();
  });

  it("marks a task with a scheduledEnd as scheduled", () => {
    render(<ScheduledIndicator action={{ scheduledStart: START, scheduledEnd: END }} />);

    expect(screen.getByText("Scheduled for 10:30 AM")).toBeDefined();
  });

  it("marks a bare scheduledStart as NOT scheduled", () => {
    // The stamped-instant case — no length, so nobody chose this time.
    render(<ScheduledIndicator action={{ scheduledStart: START }} />);

    expect(screen.getByLabelText("Not scheduled")).toBeDefined();
    expect(screen.queryByText("10:30 AM")).toBeNull();
  });

  it("marks a task with no schedule at all as NOT scheduled", () => {
    render(<ScheduledIndicator action={{}} />);

    expect(screen.getByLabelText("Not scheduled")).toBeDefined();
  });

  it("agrees with the rail's predicate for every shape", () => {
    // The point of the ticket: the row and the rail cannot disagree.
    const shapes = [
      {},
      { scheduledStart: START },
      { scheduledStart: START, duration: 30 },
      { scheduledStart: START, scheduledEnd: END },
      { scheduledStart: START, duration: 0 },
      { duration: 30 },
    ];

    for (const shape of shapes) {
      const { unmount } = render(<ScheduledIndicator action={shape} />);
      const isScheduled = screen.queryByLabelText("Not scheduled") === null;
      expect(isScheduled).toBe(hasUserChosenTime(shape));
      unmount();
    }
  });

  it("conveys state without relying on colour", () => {
    // Each state carries its own text: a label for unscheduled, and a
    // screen-reader line plus visible time for scheduled.
    const { unmount } = render(<ScheduledIndicator action={{}} />);
    expect(screen.getByLabelText("Not scheduled")).toBeDefined();
    unmount();

    render(<ScheduledIndicator action={{ scheduledStart: START, duration: 15 }} />);
    expect(screen.getByText("Scheduled for 10:30 AM, 15 min")).toBeDefined();
  });

  it("applies the host row's chip class, plus the unscheduled one when unset", () => {
    const { container, unmount } = render(
      <ScheduledIndicator
        action={{ scheduledStart: START, duration: 30 }}
        className="chip"
        unscheduledClassName="chip--quiet"
      />,
    );
    expect(container.querySelector("span")!.className).toBe("chip");
    unmount();

    const { container: bare } = render(
      <ScheduledIndicator
        action={{}}
        className="chip"
        unscheduledClassName="chip--quiet"
      />,
    );
    expect(bare.querySelector("span")!.className).toBe("chip chip--quiet");
  });
});
