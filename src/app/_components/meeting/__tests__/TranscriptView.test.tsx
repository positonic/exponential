/**
 * Render tests for TranscriptView — the single consolidated transcript renderer
 * (ADR-0032). Asserts external behaviour for both variants: `full` (detail page)
 * renders parser-attributed turns with the toolbar; `preview` (meetings list)
 * renders the first N turns + "+N more" with no toolbar.
 */

import { describe, expect, test } from "vitest";
import { render, screen } from "~/test/test-utils";
import { TranscriptView } from "../TranscriptView";
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

const FIREFLIES = [
  { text: "Welcome.", speaker_name: "Alice", start_time: 0, end_time: 2 },
  { text: "Hello.", speaker_name: "Bob", start_time: 65, end_time: 67 },
];

describe("TranscriptView — full variant", () => {
  test("renders Me:/Them: paste as alternating speaker turns with identity tone", () => {
    const { container } = render(
      <TranscriptView variant="full" transcription={MELISSA} participants={noParticipants} />,
    );
    const names = Array.from(container.querySelectorAll(".mp-turn__name")).map(
      (n) => n.textContent,
    );
    expect(names).toEqual(["Me", "Them", "Me"]);
    expect(container.querySelector(".mp-turn__name--me")).not.toBeNull();
    expect(container.querySelector(".mp-turn__name--them")).not.toBeNull();
  });

  test("hides the time gutter when every turn is timeless", () => {
    const { container } = render(
      <TranscriptView variant="full" transcription={MELISSA} participants={noParticipants} />,
    );
    expect(container.querySelector(".mp-turn__time")).toBeNull();
  });

  test("shows times for Fireflies turns and offers Copy all", () => {
    const { container } = render(
      <TranscriptView variant="full" transcription={null} sentencesJson={FIREFLIES} />,
    );
    const times = Array.from(container.querySelectorAll(".mp-turn__time")).map(
      (n) => n.textContent,
    );
    expect(times).toEqual(["00:00", "01:05"]);
    expect(screen.getByText("Copy all")).toBeTruthy();
  });

  test("renders an unrecognised transcript as a plain speaker-less block", () => {
    const { container } = render(
      <TranscriptView variant="full" transcription={"a freeform note"} />,
    );
    expect(container.querySelector(".mp-turn__name")).toBeNull();
    expect(container.querySelector(".mp-turn__avatar")).toBeNull();
    expect(screen.getByText("a freeform note")).toBeTruthy();
  });

  test("never renders a header line as a speaker", () => {
    render(<TranscriptView variant="full" transcription={MELISSA} />);
    expect(screen.queryByText("Meeting Title")).toBeNull();
    expect(screen.queryByText("Date")).toBeNull();
  });

  test("shows the empty state when there is no transcript", () => {
    render(<TranscriptView variant="full" transcription={null} />);
    expect(screen.getByText("No transcript available yet.")).toBeTruthy();
  });
});

describe("TranscriptView — preview variant", () => {
  test("shows the first N turns + '+N more' with no toolbar", () => {
    const { container } = render(
      <TranscriptView variant="preview" transcription={MELISSA} previewCount={2} />,
    );
    // First two turns shown as speaker badges.
    expect(screen.getByText("Hey Melissa.")).toBeTruthy();
    expect(screen.getByText("Hi there!")).toBeTruthy();
    // Third turn collapsed into the "+N more" affordance.
    expect(screen.getByText("+1 more messages...")).toBeTruthy();
    // No search toolbar in preview.
    expect(container.querySelector(".mp-tr__toolbar")).toBeNull();
    expect(container.querySelector("input")).toBeNull();
  });

  test("renders a Fireflies preview with speaker badges", () => {
    render(<TranscriptView variant="preview" transcription={null} sentencesJson={FIREFLIES} previewCount={2} />);
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText("Bob")).toBeTruthy();
    expect(screen.getByText("Welcome.")).toBeTruthy();
  });

  test("renders an empty-state message when there is no transcript", () => {
    render(<TranscriptView variant="preview" transcription={null} />);
    expect(screen.getByText("No transcription available")).toBeTruthy();
  });

  test("renders an unstructured transcript as a plain clamped block", () => {
    const { container } = render(
      <TranscriptView variant="preview" transcription={"freeform note with no labels"} previewCount={2} />,
    );
    expect(screen.getByText("freeform note with no labels")).toBeTruthy();
    expect(container.querySelector(".mantine-Badge-root")).toBeNull();
  });
});
