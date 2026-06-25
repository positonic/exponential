/**
 * Render tests for TranscriptTab. Asserts external behaviour: it consumes the
 * canonical parser (ADR-0032) so a device `Me:`/`Them:` paste renders as
 * speaker-attributed turns, the time gutter hides for timeless transcripts, and
 * the speaker-less fallback renders a plain block.
 */

import { describe, expect, test } from "vitest";
import { render, screen } from "~/test/test-utils";
import { TranscriptTab } from "../TranscriptTab";
import type { MeetingParticipant } from "~/lib/meeting-view-model";

const noParticipants: MeetingParticipant[] = [];

const MELISSA = [
  "Meeting Title: Sync with Melissa",
  "Date: 04 Jun 2026",
  "Transcript:",
  "Me: Hey Melissa.",
  "Them: Hi there!",
  "Me: Let's get started.",
].join("\n");

describe("TranscriptTab", () => {
  test("renders Me:/Them: paste as alternating speaker turns", () => {
    const { container } = render(
      <TranscriptTab
        transcription={MELISSA}
        sentencesJson={null}
        chapters={[]}
        participants={noParticipants}
      />,
    );

    const names = Array.from(container.querySelectorAll(".mp-turn__name")).map(
      (n) => n.textContent,
    );
    expect(names).toEqual(["Me", "Them", "Me"]);
    // me/them identity tone is applied from the parser's flavor.
    expect(container.querySelector(".mp-turn__name--me")).not.toBeNull();
    expect(container.querySelector(".mp-turn__name--them")).not.toBeNull();
  });

  test("hides the time gutter when every turn is timeless", () => {
    const { container } = render(
      <TranscriptTab
        transcription={MELISSA}
        sentencesJson={null}
        chapters={[]}
        participants={noParticipants}
      />,
    );
    expect(container.querySelector(".mp-turn__time")).toBeNull();
  });

  test("never renders a header line as a speaker", () => {
    render(
      <TranscriptTab
        transcription={MELISSA}
        sentencesJson={null}
        chapters={[]}
        participants={noParticipants}
      />,
    );
    expect(screen.queryByText("Meeting Title")).toBeNull();
    expect(screen.queryByText("Date")).toBeNull();
  });

  test("shows times for Fireflies turns", () => {
    const { container } = render(
      <TranscriptTab
        transcription={null}
        sentencesJson={[
          { text: "Welcome.", speaker_name: "Alice", start_time: 0, end_time: 2 },
          { text: "Hello.", speaker_name: "Bob", start_time: 65, end_time: 67 },
        ]}
        chapters={[]}
        participants={noParticipants}
      />,
    );
    const times = Array.from(container.querySelectorAll(".mp-turn__time")).map(
      (n) => n.textContent,
    );
    expect(times).toEqual(["00:00", "01:05"]);
  });

  test("renders an unrecognised transcript as a plain speaker-less block", () => {
    const { container } = render(
      <TranscriptTab
        transcription={"a freeform note with no speaker labels"}
        sentencesJson={null}
        chapters={[]}
        participants={noParticipants}
      />,
    );
    expect(container.querySelector(".mp-turn__name")).toBeNull();
    expect(container.querySelector(".mp-turn__avatar")).toBeNull();
    expect(screen.getByText("a freeform note with no speaker labels")).toBeTruthy();
  });

  test("shows the empty state when there is no transcript", () => {
    render(
      <TranscriptTab
        transcription={null}
        sentencesJson={null}
        chapters={[]}
        participants={noParticipants}
      />,
    );
    expect(screen.getByText("No transcript available yet.")).toBeTruthy();
  });
});
