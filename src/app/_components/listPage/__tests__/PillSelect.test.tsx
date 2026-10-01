import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "~/test/test-utils";
import { PillSelect } from "../PillSelect";

const DATA = [
  { value: "BACKLOG", label: "Backlog" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "DONE", label: "Done" },
];

function renderPill(onChange = vi.fn()) {
  render(
    <PillSelect
      value="BACKLOG"
      data={DATA}
      color="gray"
      aria-label="Status"
      onChange={onChange}
    />,
  );
  return onChange;
}

describe("PillSelect", () => {
  it("renders a plain button with the value's label, not a Select", () => {
    renderPill();

    const pill = screen.getByRole("button", { name: "Status" });
    expect(pill.textContent).toBe("Backlog");
    expect(pill.getAttribute("aria-haspopup")).toBe("listbox");
    expect(document.querySelector('input[aria-label="Status"]')).toBeNull();
  });

  it("swaps in the Select, already open, on first click", async () => {
    renderPill();

    fireEvent.click(screen.getByRole("button", { name: "Status" }));

    const input = await waitFor(() => {
      const el = document.querySelector<HTMLInputElement>('input[aria-label="Status"]');
      expect(el).not.toBeNull();
      return el!;
    });
    expect(input.value).toBe("Backlog");
    expect(await screen.findByRole("option", { name: "In progress" })).toBeDefined();
  });

  it("reports the picked value", async () => {
    const onChange = renderPill();

    fireEvent.click(screen.getByRole("button", { name: "Status" }));
    fireEvent.click(await screen.findByRole("option", { name: "Done" }));

    expect(onChange).toHaveBeenCalledWith("DONE");
  });

  it("opens from the keyboard with ArrowDown", async () => {
    renderPill();

    fireEvent.keyDown(screen.getByRole("button", { name: "Status" }), { key: "ArrowDown" });

    expect(await screen.findByRole("option", { name: "Backlog" })).toBeDefined();
  });

  it("stays a button while disabled", () => {
    render(
      <PillSelect value="BACKLOG" data={DATA} color="gray" aria-label="Status" onChange={vi.fn()} disabled />,
    );

    const pill = screen.getByRole("button", { name: "Status" });
    expect((pill as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(pill);
    expect(document.querySelector('input[aria-label="Status"]')).toBeNull();
  });
});
