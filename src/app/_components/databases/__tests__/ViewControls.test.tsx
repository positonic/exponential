/**
 * The saved view controls (ADR-0078 §6): sort, filters and hidden columns
 * edit one view, which is handed back whole.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "~/test/test-utils";

import { FILTER_OPS_BY_TYPE, ViewControls } from "../ViewControls";
import { DatabaseTable } from "../DatabaseTable";
import { emptyView, type PropertyDef } from "~/lib/databases/schema";

const TITLE = "ptitle000001";
const STATUS = "pstatus00001";
const SCORE = "pscore000001";
const properties: PropertyDef[] = [
  { id: TITLE, name: "Name", type: "title" },
  { id: STATUS, name: "Status", type: "select", options: [{ id: "o_tr", name: "Tracked", color: "green" }] },
  { id: SCORE, name: "Score", type: "number" },
];

describe("ViewControls", () => {
  it("sort: picking a property sets an ascending sort; direction flips it; clearing removes it", async () => {
    const onChangeView = vi.fn();
    render(<ViewControls properties={properties} view={emptyView([TITLE, STATUS, SCORE])} onChangeView={onChangeView} />);
    fireEvent.click(screen.getByRole("button", { name: "Sort" }));
    fireEvent.click((await screen.findAllByLabelText("Property"))[0]!);
    fireEvent.click(await screen.findByRole("option", { name: "Score" }));
    await waitFor(() =>
      expect(onChangeView).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort: { propertyId: SCORE, direction: "asc" }, propertyOrder: [TITLE, STATUS, SCORE] }),
      ),
    );
  });

  it("filter: Add filter drafts one locally and saves it only once it has a value", async () => {
    const onChangeView = vi.fn();
    render(<ViewControls properties={properties} view={emptyView()} onChangeView={onChangeView} />);
    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    fireEvent.click(await screen.findByRole("button", { name: "Add filter" }));
    // A `contains` with no text would be refused by the query: not saved yet.
    expect(onChangeView).not.toHaveBeenCalled();
    expect(FILTER_OPS_BY_TYPE.title[0]).toBe("contains");
    const value = await screen.findAllByLabelText("Value");
    fireEvent.change(value[0]!, { target: { value: "latency" } });
    expect(onChangeView).toHaveBeenCalledWith(
      expect.objectContaining({ filters: [{ propertyId: TITLE, op: "contains", value: "latency" }] }),
    );
  });

  it("hide: unticking a column adds it to hiddenPropertyIds; the title cannot be hidden", async () => {
    const onChangeView = vi.fn();
    render(<ViewControls properties={properties} view={emptyView()} onChangeView={onChangeView} />);
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(screen.queryByRole("checkbox", { name: "Name" })).toBeNull();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Score" }));
    expect(onChangeView).toHaveBeenCalledWith(expect.objectContaining({ hiddenPropertyIds: [SCORE] }));
  });

  it("shows the active state in the button labels", () => {
    render(
      <ViewControls
        properties={properties}
        view={{ sort: { propertyId: SCORE, direction: "desc" }, filters: [{ propertyId: STATUS, op: "isEmpty" }], hiddenPropertyIds: [SCORE], propertyOrder: [] }}
        onChangeView={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Sort: Score" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Filter (1)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hidden (1)" })).toBeTruthy();
  });
});

describe("DatabaseTable — widths and load more", () => {
  const database = { titlePropertyId: TITLE, properties };
  const row = { id: "r1", title: "A", values: {}, createdById: "u1", createdAt: "2026-10-03", updatedAt: "2026-10-03" };

  it("applies saved column widths and offers Load more while more rows exist", () => {
    const onLoadMore = vi.fn();
    const { container } = render(
      <DatabaseTable
        database={database}
        rows={[row]}
        columns={[TITLE, SCORE]}
        view={{ ...emptyView(), columnWidths: { [SCORE]: 120 } }}
        hasMore
        onLoadMore={onLoadMore}
      />,
    );
    expect(container.querySelector(`th[data-property-id="${SCORE}"]`)?.getAttribute("style")).toContain("width: 120px");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("offers resize handles only when editable with a resize handler", () => {
    const { container, unmount } = render(
      <DatabaseTable database={database} rows={[row]} columns={[TITLE, SCORE]} editable onWriteCell={vi.fn()} onResizeColumn={vi.fn()} />,
    );
    expect(container.querySelectorAll('[role="separator"]')).toHaveLength(2);
    unmount();
    render(<DatabaseTable database={database} rows={[row]} columns={[TITLE, SCORE]} />);
    expect(document.querySelectorAll('[role="separator"]')).toHaveLength(0);
  });
});
