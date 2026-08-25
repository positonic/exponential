import { describe, expect, it } from "vitest";
import {
  buildRailBlocks,
  DEFAULT_RAIL_BLOCK_MINUTES,
  resolveActionDurationMinutes,
  type RailSchedulableAction,
} from "~/lib/actions/railBlocks";

/** Local-time Date so `hourFloat` (which reads local getters) is deterministic. */
function at(hour: number, minute = 0): Date {
  return new Date(2026, 7, 5, hour, minute, 0, 0);
}

function action(overrides: Partial<RailSchedulableAction> = {}): RailSchedulableAction {
  return {
    id: "a1",
    name: "Write the thing",
    scheduledStart: at(10, 30),
    ...overrides,
  };
}

describe("resolveActionDurationMinutes", () => {
  it("uses `duration` when set", () => {
    expect(
      resolveActionDurationMinutes({ duration: 25, scheduledEnd: null }, at(10, 30)),
    ).toBe(25);
  });

  it("uses the scheduledStart→scheduledEnd span when only `scheduledEnd` is set", () => {
    expect(
      resolveActionDurationMinutes(
        { duration: null, scheduledEnd: at(10, 40) },
        at(10, 30),
      ),
    ).toBe(10);
  });

  it("falls back to 60 minutes when neither is set", () => {
    expect(
      resolveActionDurationMinutes({ duration: null, scheduledEnd: null }, at(10, 30)),
    ).toBe(DEFAULT_RAIL_BLOCK_MINUTES);
  });

  it("prefers `duration` over a conflicting `scheduledEnd`", () => {
    // Matches convertActionToCalendarItem's precedence in the calendar's
    // overlap utility: duration wins.
    expect(
      resolveActionDurationMinutes(
        { duration: 15, scheduledEnd: at(12, 0) },
        at(10, 30),
      ),
    ).toBe(15);
  });

  it("accepts ISO strings for scheduledEnd", () => {
    expect(
      resolveActionDurationMinutes(
        { duration: null, scheduledEnd: at(11, 0).toISOString() },
        at(10, 30),
      ),
    ).toBe(30);
  });

  it("falls back to the default when scheduledEnd is not after the start", () => {
    expect(
      resolveActionDurationMinutes(
        { duration: null, scheduledEnd: at(10, 0) },
        at(10, 30),
      ),
    ).toBe(DEFAULT_RAIL_BLOCK_MINUTES);
  });

  it("ignores a non-positive duration and falls through", () => {
    expect(
      resolveActionDurationMinutes(
        { duration: 0, scheduledEnd: at(10, 45) },
        at(10, 30),
      ),
    ).toBe(15);
  });
});

describe("buildRailBlocks", () => {
  it("renders a 10:30–10:40 action as a 10-minute block", () => {
    const [block] = buildRailBlocks({
      actions: [action({ scheduledEnd: at(10, 40) })],
    });

    expect(block).toMatchObject({
      id: "act-a1",
      title: "Write the thing",
      start: 10.5,
      kind: "task",
    });
    expect(block!.end).toBeCloseTo(10 + 40 / 60, 10);
  });

  it("uses `duration` when it conflicts with scheduledEnd", () => {
    const [block] = buildRailBlocks({
      actions: [action({ duration: 15, scheduledEnd: at(12, 0) })],
    });

    expect(block!.start).toBe(10.5);
    expect(block!.end).toBeCloseTo(10.75, 10);
  });

  it("falls back to a 60-minute block when scheduledEnd is not after the start", () => {
    // The only route left to the fallback: a length was stated, but a useless
    // one. `hasUserChosenTime` lets it through; the resolver rescues it.
    const [block] = buildRailBlocks({
      actions: [action({ scheduledEnd: at(10, 0) })],
    });

    expect(block!.start).toBe(10.5);
    expect(block!.end).toBe(11.5);
  });

  it("skips actions with no scheduledStart", () => {
    expect(
      buildRailBlocks({ actions: [action({ scheduledStart: null })] }),
    ).toEqual([]);
  });

  it("skips actions with a scheduledStart but no stated length", () => {
    expect(buildRailBlocks({ actions: [action()] })).toEqual([]);
  });

  it("keeps timed actions while dropping untimed ones alongside them", () => {
    const blocks = buildRailBlocks({
      actions: [
        action({ id: "untimed-1" }),
        action({ id: "untimed-2" }),
        action({ id: "timed", duration: 30 }),
      ],
    });

    expect(blocks.map((b) => b.id)).toEqual(["act-timed"]);
  });

  it("leaves calendar events alone — they carry their own start and end", () => {
    const blocks = buildRailBlocks({
      events: [
        {
          id: "ev1",
          summary: "Standup",
          start: { dateTime: at(9, 0).toISOString() },
          end: { dateTime: at(9, 15).toISOString() },
        },
      ],
      actions: [action()], // untimed, dropped
    });

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ id: "ev1", start: 9, end: 9.25 });
  });

  it("maps calendar events to `cal` blocks and skips ones missing a bound", () => {
    const blocks = buildRailBlocks({
      events: [
        {
          id: "ev1",
          summary: "Standup",
          start: { dateTime: at(9, 0).toISOString() },
          end: { dateTime: at(9, 15).toISOString() },
        },
        {
          id: "ev2",
          summary: "No end",
          start: { dateTime: at(9, 0).toISOString() },
          end: null,
        },
      ],
    });

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ id: "ev1", title: "Standup", kind: "cal" });
    expect(blocks[0]!.end).toBe(9.25);
  });

  it("titles an untitled calendar event", () => {
    const [block] = buildRailBlocks({
      events: [
        {
          id: "ev1",
          summary: null,
          start: { dateTime: at(9, 0).toISOString() },
          end: { dateTime: at(10, 0).toISOString() },
        },
      ],
    });

    expect(block!.title).toBe("Untitled");
  });

  it("returns an empty list for empty or missing input", () => {
    expect(buildRailBlocks({})).toEqual([]);
    expect(buildRailBlocks({ events: null, actions: null })).toEqual([]);
  });
});
