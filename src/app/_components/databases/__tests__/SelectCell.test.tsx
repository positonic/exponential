/**
 * Select and multi-select cells (ADR-0078): closed they show tinted pills,
 * opened they are a Mantine picker already open, and a name no option has
 * can be created from the picker.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "~/test/test-utils";

import { SelectCell } from "../cells/SelectCell";
import type { PropertyDef } from "~/lib/databases/schema";

const status: PropertyDef = {
  id: "pstatus",
  name: "Status",
  type: "select",
  options: [
    { id: "o_nm", name: "Not measured", color: "gray" },
    { id: "o_tr", name: "Tracked", color: "green" },
  ],
};

describe("SelectCell", () => {
  it("shows the selected option as a pill, or a dash when empty, without mounting a Select", () => {
    const { unmount } = render(<SelectCell def={status} value="o_tr" editable onCommit={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Status" }).textContent).toBe("Tracked");
    expect(document.querySelector('input[aria-label="Status"]')).toBeNull();
    unmount();
    render(<SelectCell def={status} value={null} editable onCommit={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Status" }).textContent).toBe("—");
  });

  it("opens on click and commits the picked option id", async () => {
    const onCommit = vi.fn();
    render(<SelectCell def={status} value="o_tr" editable onCommit={onCommit} />);
    fireEvent.click(screen.getByRole("button", { name: "Status" }));
    fireEvent.click(await screen.findByRole("option", { name: "Not measured" }));
    await waitFor(() => expect(onCommit).toHaveBeenCalledWith("o_nm"));
  });

  it("offers to create an option for a name none has, then selects the new id", async () => {
    const onCommit = vi.fn();
    const onCreateOption = vi.fn().mockResolvedValue("o_new");
    render(<SelectCell def={status} value={null} editable onCommit={onCommit} onCreateOption={onCreateOption} />);
    fireEvent.click(screen.getByRole("button", { name: "Status" }));
    const input = await waitFor(() => document.querySelector<HTMLInputElement>('input[aria-label="Status"]')!);
    fireEvent.change(input, { target: { value: "Dropped" } });
    fireEvent.click(await screen.findByRole("option", { name: 'Create "Dropped"' }));
    await waitFor(() => expect(onCreateOption).toHaveBeenCalledWith("Dropped"));
    await waitFor(() => expect(onCommit).toHaveBeenCalledWith("o_new"));
  });

  it("a multi-select commits the list of ids", async () => {
    const onCommit = vi.fn();
    render(<SelectCell def={{ ...status, type: "multiSelect" }} value={["o_tr"]} editable onCommit={onCommit} />);
    fireEvent.click(screen.getByRole("button", { name: "Status" }));
    fireEvent.click(await screen.findByRole("option", { name: "Not measured" }));
    await waitFor(() => expect(onCommit).toHaveBeenCalledWith(["o_tr", "o_nm"]));
  });

  it("a viewer's cell does not open", () => {
    render(<SelectCell def={status} value="o_tr" editable={false} onCommit={vi.fn()} />);
    const pill = screen.getByRole("button", { name: "Status" });
    expect((pill as HTMLButtonElement).disabled).toBe(true);
  });
});
