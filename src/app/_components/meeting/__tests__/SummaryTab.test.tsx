/**
 * The Edit flow's contract: a structured (Fireflies-JSON) summary is edited as
 * its two prose fields — never as raw JSON — and saving merges them back into
 * the stored object without dropping the fields that weren't on screen.
 */

import { describe, expect, test, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "~/test/test-utils";

import { SummaryTab } from "~/app/_components/meeting/SummaryTab";
import type { MeetingViewModel } from "~/lib/meeting-view-model";

// Children with their own data dependencies; irrelevant to the edit flow.
vi.mock("~/app/_components/actions/ActionsList", () => ({
  ActionsList: () => null,
}));
vi.mock("~/app/_components/SmartContentRenderer", () => ({
  SmartContentRenderer: () => null,
}));
vi.mock("~/app/_components/FirefliesSummaryRenderer", () => ({
  FirefliesSummaryDisplay: () => null,
}));

const STORED = {
  overview: "What happened.",
  detailed_breakdown: "## Theme\n- **Decision:** ship it",
  shorthand_bullet: ["one", "two"],
  keywords: ["kept"],
};

function vmWith(summary: MeetingViewModel["firefliesSummary"]): MeetingViewModel {
  return {
    meetingType: null,
    firefliesSummary: summary,
    plainSummary: summary ? null : "Plain notes.",
    durationLabel: null,
    participants: [],
    chapters: [],
    keyMoments: [],
    decisions: [],
    questions: [],
    hasVideo: false,
    captureCount: 0,
    transcriptCount: 0,
  };
}

function renderTab(rawSummary: string, onSaveSummary = vi.fn()) {
  render(
    <SummaryTab
      vm={vmWith(rawSummary.startsWith("{") ? STORED : null)}
      rawSummary={rawSummary}
      generatedStamp={null}
      actions={[]}
      isActionsLoading={false}
      hasTranscript={true}
      isCreatingActions={false}
      isIdeatingFeatures={false}
      isGeneratingSummary={false}
      onSaveSummary={onSaveSummary}
      onCreateActions={vi.fn()}
      onIdeateFeatures={vi.fn()}
      onRegenerate={vi.fn()}
    />,
  );
  return onSaveSummary;
}

describe("SummaryTab edit flow", () => {
  test("edits a structured summary as prose fields, not raw JSON", () => {
    renderTab(JSON.stringify(STORED));

    fireEvent.click(screen.getByText("Edit"));

    const overview = screen.getByPlaceholderText<HTMLTextAreaElement>(
      "What was the meeting about?",
    );
    const breakdown = screen.getByPlaceholderText<HTMLTextAreaElement>(
      "Themed sections, decisions, action items…",
    );
    expect(overview.value).toBe("What happened.");
    expect(breakdown.value).toBe("## Theme\n- **Decision:** ship it");
    // The raw JSON must never be the editing surface.
    expect(screen.queryByDisplayValue(JSON.stringify(STORED))).toBeNull();
  });

  test("saving merges edited prose back and keeps untouched fields", async () => {
    const onSave = renderTab(JSON.stringify(STORED));

    fireEvent.click(screen.getByText("Edit"));
    fireEvent.change(screen.getByPlaceholderText("What was the meeting about?"), {
      target: { value: "New overview." },
    });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = JSON.parse(onSave.mock.calls[0]![0] as string) as Record<
      string,
      unknown
    >;
    expect(saved.overview).toBe("New overview.");
    expect(saved.detailed_breakdown).toBe(STORED.detailed_breakdown);
    expect(saved.shorthand_bullet).toEqual(["one", "two"]);
    expect(saved.keywords).toEqual(["kept"]);
  });

  test("clearing the breakdown removes the field so the flat fallback renders", async () => {
    const onSave = renderTab(JSON.stringify(STORED));

    fireEvent.click(screen.getByText("Edit"));
    fireEvent.change(
      screen.getByPlaceholderText("Themed sections, decisions, action items…"),
      { target: { value: "  " } },
    );
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = JSON.parse(onSave.mock.calls[0]![0] as string) as Record<
      string,
      unknown
    >;
    expect("detailed_breakdown" in saved).toBe(false);
  });

  test("edits a plain summary as-is", async () => {
    const onSave = renderTab("Just some notes.");

    fireEvent.click(screen.getByText("Edit"));
    const input = screen.getByPlaceholderText<HTMLTextAreaElement>(
      "Enter a summary…",
    );
    expect(input.value).toBe("Just some notes.");
    fireEvent.change(input, { target: { value: "Edited notes." } });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith("Edited notes."));
  });
});
