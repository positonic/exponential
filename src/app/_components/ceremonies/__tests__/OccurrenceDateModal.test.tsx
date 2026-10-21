/**
 * OccurrenceDateModal seeds its field from `initial` when it opens, and only
 * then. Callers build `initial` per render (`new Date(row.scheduledStart)`),
 * so a re-render while the modal is open — a tRPC refetch, say — must not
 * reset a time the user has already picked.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "~/test/test-utils";
import "@testing-library/jest-dom/vitest";

import { OccurrenceDateModal } from "../OccurrenceDateModal";

const FIRST = new Date("2026-09-09T07:00:00.000Z");
const LATER = new Date("2026-09-16T07:00:00.000Z");

function renderModal(opened: boolean, initial: Date | null, onSubmit = vi.fn()) {
  return render(
    <OccurrenceDateModal
      opened={opened}
      onClose={vi.fn()}
      title="Move this occurrence"
      submitLabel="Move"
      initial={initial}
      onSubmit={onSubmit}
    />,
  );
}

describe("OccurrenceDateModal", () => {
  it("submits the value it was opened with", () => {
    const onSubmit = vi.fn();
    renderModal(true, FIRST, onSubmit);
    fireEvent.click(screen.getByTestId("occurrence-date-submit"));
    expect(onSubmit).toHaveBeenCalledWith(FIRST);
  });

  it("keeps its value when `initial` changes while open", () => {
    const onSubmit = vi.fn();
    const view = renderModal(true, FIRST, onSubmit);
    view.rerender(
      <OccurrenceDateModal
        opened
        onClose={vi.fn()}
        title="Move this occurrence"
        submitLabel="Move"
        initial={LATER}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.click(screen.getByTestId("occurrence-date-submit"));
    expect(onSubmit).toHaveBeenCalledWith(FIRST);
  });

  it("re-seeds from the current `initial` on the next open", () => {
    const onSubmit = vi.fn();
    const view = renderModal(true, FIRST, onSubmit);
    const props = { onClose: vi.fn(), title: "Move this occurrence", submitLabel: "Move", onSubmit };
    view.rerender(<OccurrenceDateModal {...props} opened={false} initial={LATER} />);
    view.rerender(<OccurrenceDateModal {...props} opened initial={LATER} />);
    fireEvent.click(screen.getByTestId("occurrence-date-submit"));
    expect(onSubmit).toHaveBeenCalledWith(LATER);
  });
});
