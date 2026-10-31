/**
 * The header's property editor (ADR-0078 §6): add a property with a type and
 * options, rename one keeping option ids, remove one — never the title.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "~/test/test-utils";

import { PropertyEditorPopover } from "../PropertyEditorPopover";
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

describe("PropertyEditorPopover", () => {
  it("adds a property: name, type and options go to onSubmit", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<PropertyEditorPopover target={<span>+ Property</span>} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: "Add a property" }));
    fireEvent.change((await screen.findAllByLabelText("Name"))[0]!, { target: { value: "Dimension" } });
    // Pick the type through the Select.
    const typeInput = screen.getAllByLabelText("Type")[0]!;
    fireEvent.click(typeInput);
    fireEvent.click(await screen.findByRole("option", { name: "Select" }));
    const newOption = (await screen.findAllByLabelText("New option"))[0]!;
    fireEvent.change(newOption, { target: { value: "Coverage" } });
    fireEvent.keyDown(newOption, { key: "Enter" });
    fireEvent.change(screen.getAllByLabelText("New option")[0]!, { target: { value: "Latency" } });
    fireEvent.click(screen.getByRole("button", { name: "Add option" }));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        name: "Dimension",
        type: "select",
        options: [{ name: "Coverage" }, { name: "Latency" }],
      }),
    );
  });

  it("edits a property: a renamed option keeps its id and a removed one is left out", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onRemove = vi.fn();
    render(<PropertyEditorPopover property={status} target={<span>Status</span>} onSubmit={onSubmit} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit property Status" }));
    fireEvent.change((await screen.findAllByLabelText("Name"))[0]!, { target: { value: "Stage" } });
    fireEvent.change(screen.getAllByLabelText("Option 2")[0]!, { target: { value: "Being tracked" } });
    fireEvent.click(screen.getByRole("button", { name: "Remove option Not measured" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        name: "Stage",
        type: "select",
        options: [{ id: "o_tr", name: "Being tracked", color: "green" }],
      }),
    );
  });

  it("removes a property through onRemove; the title property offers no Remove and no retype", async () => {
    const onRemove = vi.fn().mockResolvedValue(undefined);
    const { unmount } = render(
      <PropertyEditorPopover property={status} target={<span>Status</span>} onSubmit={vi.fn()} onRemove={onRemove} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit property Status" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    await waitFor(() => expect(onRemove).toHaveBeenCalledTimes(1));
    unmount();

    const title: PropertyDef = { id: "ptitle", name: "Name", type: "title" };
    render(<PropertyEditorPopover property={title} target={<span>Name</span>} onSubmit={vi.fn()} onRemove={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit property Name" }));
    (await screen.findAllByLabelText("Name"))[0]!;
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    expect((screen.getAllByLabelText("Type")[0]! as HTMLInputElement).disabled).toBe(true);
  });
});
