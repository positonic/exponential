/**
 * The painter's own decisions: a drag marks the rectangle it covers (one
 * range per day), a drag that starts on marked time clears instead, and
 * Enter toggles a single cell for keyboard users.
 */

import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "~/test/test-utils";
import "@testing-library/jest-dom/vitest";

import { addDays, startOfWeek } from "../availabilityPainterModel";

const { markMutate, clearMutate, gridData } = vi.hoisted(() => ({
  markMutate: vi.fn(),
  clearMutate: vi.fn(),
  gridData: {
    current: null as null | {
      cellStartsAt: Date[];
      cellMinutes: number;
      statuses: ("free" | "busy" | "outside")[];
      blocks: { id: string; startsAt: Date; endsAt: Date; isAllDay: boolean; note: string | null }[];
    },
  },
}));

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({
      availability: {
        myGrid: { invalidate: vi.fn(), cancel: vi.fn(), setData: vi.fn() },
        listUpcoming: { invalidate: vi.fn() },
      },
    }),
    availability: {
      myGrid: { useQuery: () => ({ data: gridData.current, isLoading: false }) },
      mark: { useMutation: () => ({ mutate: markMutate, isPending: false }) },
      clear: { useMutation: () => ({ mutate: clearMutate, isPending: false }) },
    },
  },
}));

vi.mock("@mantine/notifications", () => ({ notifications: { show: vi.fn() } }));

import { AvailabilityPainter } from "../AvailabilityPainter";

const monday = startOfWeek(new Date());
const at = (dayOffset: number, hours: number, minutes = 0) => {
  const day = addDays(monday, dayOffset);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes);
};

/** The cell's accessible name prefix, built the way the painter builds it. */
function cell(dayOffset: number, hours: number, minutes = 0): HTMLElement {
  const startsAt = at(dayOffset, hours, minutes);
  const label = `${addDays(monday, dayOffset).toLocaleDateString(undefined, { weekday: "short", day: "numeric" })} ${startsAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
  return screen.getByRole("button", { name: (name) => name.startsWith(`${label} —`) });
}

beforeEach(() => {
  markMutate.mockReset();
  clearMutate.mockReset();
  // Mon–Wed, 09:00–11:00 local, all free.
  const cellStartsAt: Date[] = [];
  for (let day = 0; day < 3; day++) {
    for (let minutes = 9 * 60; minutes < 11 * 60; minutes += 30) {
      cellStartsAt.push(at(day, Math.floor(minutes / 60), minutes % 60));
    }
  }
  gridData.current = {
    cellStartsAt,
    cellMinutes: 30,
    statuses: cellStartsAt.map(() => "free"),
    blocks: [],
  };
});

afterEach(cleanup);

describe("AvailabilityPainter", () => {
  test("a drag across two days marks one range per day", () => {
    render(<AvailabilityPainter />);

    fireEvent.pointerDown(cell(0, 9), { button: 0, pointerType: "mouse" });
    fireEvent.pointerEnter(cell(1, 9, 30));
    fireEvent.pointerUp(window);

    expect(markMutate).toHaveBeenCalledWith({
      ranges: [
        { startsAt: at(0, 9), endsAt: at(0, 10) },
        { startsAt: at(1, 9), endsAt: at(1, 10) },
      ],
    });
    expect(clearMutate).not.toHaveBeenCalled();
  });

  test("a drag that starts on marked time clears instead", () => {
    gridData.current!.blocks = [
      { id: "b", startsAt: at(2, 9), endsAt: at(2, 11), isAllDay: false, note: null },
    ];
    render(<AvailabilityPainter />);

    expect(cell(2, 10)).toHaveAttribute("aria-pressed", "true");
    fireEvent.pointerDown(cell(2, 10), { button: 0, pointerType: "mouse" });
    fireEvent.pointerUp(window);

    expect(clearMutate).toHaveBeenCalledWith({
      ranges: [{ startsAt: at(2, 10), endsAt: at(2, 10, 30) }],
    });
    expect(markMutate).not.toHaveBeenCalled();
  });

  test("Enter toggles a single cell", () => {
    render(<AvailabilityPainter />);

    fireEvent.keyDown(cell(1, 10), { key: "Enter" });

    expect(markMutate).toHaveBeenCalledWith({
      ranges: [{ startsAt: at(1, 10), endsAt: at(1, 10, 30) }],
    });
  });
});
