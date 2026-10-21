/**
 * Component tests for MeetingOccurrencePicker's "Add occurrence" option. It
 * must only be offered when the server's `addOccurrence` would accept the
 * time: `assertSlotFree` refuses a time any occurrence of the ceremony holds
 * by `scheduledStart` OR by `cadenceStart`, so an occurrence moved off its
 * tick still blocks an add on the vacated tick.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "~/test/test-utils";
import "@testing-library/jest-dom/vitest";

import { MeetingOccurrencePicker, type MeetingOccurrenceOption } from "../MeetingOccurrencePicker";

const TICK = new Date("2026-09-09T07:00:00.000Z");
const MOVED_TO = new Date("2026-09-09T13:30:00.000Z");
const ELSEWHERE = new Date("2026-09-10T10:00:00.000Z");
const CEREMONIES = [{ id: "cer-1", name: "Daily Standup" }];

function setup(occurrences: MeetingOccurrenceOption[], addOccurrenceAt: Date) {
  const onAddOccurrence = vi.fn();
  render(
    <MeetingOccurrencePicker
      occurrences={occurrences}
      value={null}
      onChange={vi.fn()}
      ceremonies={CEREMONIES}
      onAddOccurrence={onAddOccurrence}
      addOccurrenceAt={addOccurrenceAt}
    >
      {() => <button type="button">trigger</button>}
    </MeetingOccurrencePicker>,
  );
  fireEvent.click(screen.getByText("trigger"));
  return { onAddOccurrence };
}

const addOption = () => screen.queryByTestId("add-occurrence-cer-1");

describe("MeetingOccurrencePicker — Add occurrence", () => {
  beforeEach(() => vi.clearAllMocks());

  it("offers an add at a time no occurrence holds, and emits the ceremony id", () => {
    const { onAddOccurrence } = setup(
      [{ id: "occ-1", ceremonyId: "cer-1", ceremonyName: "Daily Standup", scheduledStart: TICK, cadenceStart: TICK }],
      ELSEWHERE,
    );
    expect(addOption()).toBeInTheDocument();
    fireEvent.click(addOption()!);
    expect(onAddOccurrence).toHaveBeenCalledWith("cer-1");
  });

  it("offers an add for a ceremony with no occurrence in the window", () => {
    setup([], ELSEWHERE);
    expect(addOption()).toBeInTheDocument();
  });

  it("hides the add when an occurrence already starts at that time", () => {
    setup(
      [{ id: "occ-1", ceremonyId: "cer-1", ceremonyName: "Daily Standup", scheduledStart: TICK, cadenceStart: TICK }],
      new Date(TICK),
    );
    expect(addOption()).not.toBeInTheDocument();
  });

  it("hides the add on a vacated tick — the moved occurrence still holds it", () => {
    setup(
      [{ id: "occ-1", ceremonyId: "cer-1", ceremonyName: "Daily Standup", scheduledStart: MOVED_TO, cadenceStart: TICK }],
      new Date(TICK),
    );
    expect(addOption()).not.toBeInTheDocument();
  });

  it("hides the add at the moved occurrence's new time too", () => {
    setup(
      [{ id: "occ-1", ceremonyId: "cer-1", ceremonyName: "Daily Standup", scheduledStart: MOVED_TO, cadenceStart: TICK }],
      new Date(MOVED_TO),
    );
    expect(addOption()).not.toBeInTheDocument();
  });

  it("treats an ad hoc occurrence (no tick) as holding only its start", () => {
    setup(
      [{ id: "occ-1", ceremonyId: "cer-1", ceremonyName: "Daily Standup", scheduledStart: MOVED_TO, cadenceStart: null }],
      new Date(TICK),
    );
    expect(addOption()).toBeInTheDocument();
  });
});
