/**
 * The Notes tab's contract: notes render as Markdown, editors can add or edit
 * them in place and saving hands the new Markdown back, readers only read.
 */

import { describe, expect, test, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "~/test/test-utils";

import { NotesTab } from "~/app/_components/meeting/NotesTab";

function renderTab(
  props: Partial<React.ComponentProps<typeof NotesTab>> = {},
) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(
    <NotesTab
      notes={null}
      isLoading={false}
      isError={false}
      canEdit={true}
      onSave={onSave}
      {...props}
    />,
  );
  return onSave;
}

describe("NotesTab", () => {
  test("renders stored notes as Markdown", () => {
    renderTab({ notes: "## Agenda\n\n- **Budget** review" });

    expect(screen.getByText("Agenda")).toBeTruthy();
    expect(screen.getByText("Budget").tagName).toBe("STRONG");
    expect(screen.queryByText(/\*\*Budget\*\*/)).toBeNull();
    expect(screen.getByText("Edit")).toBeTruthy();
  });

  test("offers to add notes when there are none, and saves what was typed", async () => {
    const onSave = renderTab({ notes: null });

    expect(screen.getByText("No notes yet for this meeting.")).toBeTruthy();
    fireEvent.click(screen.getByText("Add notes"));

    const input = screen.getByPlaceholderText<HTMLTextAreaElement>("Add meeting notes…");
    expect(input.value).toBe("");
    fireEvent.change(input, { target: { value: "Follow up with Ana" } });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith("Follow up with Ana"));
    // Back to reading once the save resolves.
    await waitFor(() =>
      expect(screen.queryByPlaceholderText("Add meeting notes…")).toBeNull(),
    );
  });

  test("edits existing notes and cancel discards the draft", () => {
    const onSave = renderTab({ notes: "Original" });

    fireEvent.click(screen.getByText("Edit"));
    const input = screen.getByPlaceholderText<HTMLTextAreaElement>("Add meeting notes…");
    expect(input.value).toBe("Original");
    fireEvent.change(input, { target: { value: "Changed" } });
    fireEvent.click(screen.getByText("Cancel"));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Original")).toBeTruthy();
  });

  test("stays in edit mode when the save fails", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("nope"));
    renderTab({ notes: "Original", onSave });

    fireEvent.click(screen.getByText("Edit"));
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(screen.getByPlaceholderText("Add meeting notes…")).toBeTruthy();
  });

  test("hides editing from readers", () => {
    renderTab({ notes: "Read only", canEdit: false });

    expect(screen.getByText("Read only")).toBeTruthy();
    expect(screen.queryByText("Edit")).toBeNull();
    expect(screen.queryByText("Add notes")).toBeNull();
  });
});
