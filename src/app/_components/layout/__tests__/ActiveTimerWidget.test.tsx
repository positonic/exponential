/**
 * Action names may still hold the legacy Tiptap HTML tolerated on read. The
 * widget's body is itself a Link, so it cannot render that markup as a link —
 * nested anchors are invalid and split the row link — and until it reduced the
 * name to text it printed the raw `<a target="_blank" …>` source at the reader.
 */

import { describe, expect, test, vi } from "vitest";
import { render, screen } from "~/test/test-utils";

import { ActiveTimerWidget } from "~/app/_components/layout/ActiveTimerWidget";
import type { ActiveTimerContextValue } from "~/hooks/useActiveTimer";

const { mockCtx } = vi.hoisted(() => ({
  mockCtx: { value: null as ActiveTimerContextValue | null },
}));

vi.mock("~/hooks/useActiveTimer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/hooks/useActiveTimer")>()),
  useActiveTimerContext: () => mockCtx.value,
}));

vi.mock("~/providers/WorkspaceProvider", () => ({
  useWorkspace: () => ({ workspaceSlug: "syntrofi" }),
}));

function renderWithName(name: string) {
  mockCtx.value = {
    entry: { id: "e1", action: { id: "a1", name } },
    elapsedMs: 65_000,
    isRunning: true,
    isStopping: false,
    stop: vi.fn(),
  } as unknown as ActiveTimerContextValue;
  return render(<ActiveTimerWidget />);
}

describe("ActiveTimerWidget", () => {
  test("shows the link text of a legacy HTML action name, not its markup", () => {
    renderWithName(
      'Read <a target="_blank" rel="noopener noreferrer" class="text-blue-500 underline cursor-pointer" href="https://app.notion.com/p/PRD">Situation Analysis doc</a>',
    );

    expect(screen.getByText("Read Situation Analysis doc")).toBeTruthy();
    expect(screen.queryByText(/target="_blank"/)).toBeNull();
    // The row is the only anchor: the name must not have added its own.
    expect(document.querySelectorAll("a")).toHaveLength(1);
  });

  test("leaves a plain action name alone", () => {
    renderWithName("Syntrofi contracts");
    expect(screen.getByText("Syntrofi contracts")).toBeTruthy();
  });

  test("falls back to Untitled when the name reduces to nothing", () => {
    renderWithName("<p></p>");
    expect(screen.getByText("Untitled")).toBeTruthy();
  });
});
