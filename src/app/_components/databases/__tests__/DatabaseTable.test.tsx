/**
 * The database block's table (ADR-0078 §6): visible columns in view order,
 * the title linking to the row page, values shown the way their type reads.
 */
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "~/test/test-utils";

import { DatabaseTable } from "../DatabaseTable";

const TITLE = "ptitle000001";
const STATUS = "pstatus00001";
const SCORE = "pscore000001";
const DONE = "pdone0000001";

const database = {
  titlePropertyId: TITLE,
  properties: [
    { id: TITLE, name: "Name", type: "title" as const },
    {
      id: STATUS,
      name: "Status",
      type: "select" as const,
      options: [{ id: "o_tr", name: "Tracked", color: "green" as const }],
    },
    { id: SCORE, name: "Score", type: "number" as const },
    { id: DONE, name: "Done", type: "checkbox" as const },
  ],
};

const rows = [
  {
    id: "row-1",
    title: "Alert latency",
    values: { [STATUS]: "o_tr", [SCORE]: 7, [DONE]: true },
    createdById: "u1",
    createdAt: "2026-10-03T00:00:00Z",
    updatedAt: "2026-10-04T00:00:00Z",
  },
  {
    id: "row-2",
    title: "",
    values: {},
    createdById: "u1",
    createdAt: "2026-10-03T00:00:00Z",
    updatedAt: "2026-10-04T00:00:00Z",
  },
];

describe("DatabaseTable", () => {
  it("shows the visible columns in view order and each value as its type reads", () => {
    render(
      <DatabaseTable
        database={database}
        rows={rows}
        columns={[TITLE, SCORE, STATUS]}
        rowHref={(id) => `/w/acme/pages/${id}`}
      />,
    );
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Name", "Score", "Status"]);

    const link = screen.getByRole("link", { name: "Alert latency" });
    expect(link.getAttribute("href")).toBe("/w/acme/pages/row-1");
    expect(screen.getByText("Tracked")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    // Hidden column (Done) is not rendered.
    expect(screen.queryByText("Yes")).toBeNull();
    // An untitled row still opens.
    expect(screen.getByRole("link", { name: "Untitled" }).getAttribute("href")).toBe("/w/acme/pages/row-2");
  });

  it("says so when there are no rows", () => {
    render(<DatabaseTable database={database} rows={[]} columns={[TITLE, STATUS]} />);
    expect(screen.getByText("No rows yet.")).toBeTruthy();
    expect(screen.getAllByRole("columnheader")).toHaveLength(2);
  });
});

describe("DatabaseTable — editing", () => {
  function renderEditable(overrides: { onWriteCell?: ReturnType<typeof vi.fn>; onCreateRow?: ReturnType<typeof vi.fn> } = {}) {
    const onWriteCell = overrides.onWriteCell ?? vi.fn();
    const onCreateRow = overrides.onCreateRow ?? vi.fn().mockResolvedValue("row-3");
    const utils = render(
      <DatabaseTable
        database={database}
        rows={rows}
        columns={[TITLE, SCORE, STATUS, DONE]}
        editable
        onWriteCell={onWriteCell}
        onCreateRow={onCreateRow}
      />,
    );
    const cell = (rowIndex: number, colIndex: number) =>
      utils.container.querySelector<HTMLTableCellElement>(`td[data-row-index="${rowIndex}"][data-col-index="${colIndex}"]`)!;
    return { ...utils, onWriteCell, onCreateRow, cell };
  }

  it("Enter opens a text cell, Enter commits the draft to onWriteCell, Escape cancels", async () => {
    const { onWriteCell, cell } = renderEditable();
    const score = cell(0, 1);
    act(() => score.focus());
    fireEvent.keyDown(score, { key: "Enter" });
    const input = await screen.findByRole("textbox", { name: "Score" });
    fireEvent.change(input, { target: { value: "9" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onWriteCell).toHaveBeenCalledWith("row-1", SCORE, "9");

    fireEvent.keyDown(cell(0, 1), { key: "Enter" });
    const again = await screen.findByRole("textbox", { name: "Score" });
    fireEvent.change(again, { target: { value: "99" } });
    fireEvent.keyDown(again, { key: "Escape" });
    expect(onWriteCell).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("textbox", { name: "Score" })).toBeNull();
  });

  it("typing into a focused cell starts editing with that character; an empty commit clears", async () => {
    const { onWriteCell, cell } = renderEditable();
    const score = cell(0, 1);
    act(() => score.focus());
    fireEvent.keyDown(score, { key: "4" });
    const input = await screen.findByRole("textbox", { name: "Score" });
    expect((input as HTMLInputElement).value).toBe("4");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(onWriteCell).toHaveBeenCalledWith("row-1", SCORE, null);
  });

  it("the title cell edits the row title through the title property", async () => {
    const { onWriteCell, cell } = renderEditable();
    const title = cell(1, 0);
    act(() => title.focus());
    fireEvent.keyDown(title, { key: "Enter" });
    const input = await screen.findByRole("textbox", { name: "Name" });
    fireEvent.change(input, { target: { value: "Coverage" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onWriteCell).toHaveBeenCalledWith("row-2", TITLE, "Coverage");
  });

  it("a checkbox flips on click and on Space, with no edit mode", () => {
    const { onWriteCell, cell } = renderEditable();
    fireEvent.click(screen.getAllByRole("checkbox", { name: "Done" })[0]!);
    expect(onWriteCell).toHaveBeenCalledWith("row-1", DONE, false);
    const done = cell(1, 3);
    act(() => done.focus());
    fireEvent.keyDown(done, { key: " " });
    expect(onWriteCell).toHaveBeenLastCalledWith("row-2", DONE, true);
  });

  it("arrow keys move focus between cells", () => {
    const { cell } = renderEditable();
    const start = cell(0, 0);
    act(() => start.focus());
    fireEvent.keyDown(start, { key: "ArrowRight" });
    expect(document.activeElement).toBe(cell(0, 1));
    fireEvent.keyDown(cell(0, 1), { key: "ArrowDown" });
    expect(document.activeElement).toBe(cell(1, 1));
    fireEvent.keyDown(cell(1, 1), { key: "ArrowLeft" });
    expect(document.activeElement).toBe(cell(1, 0));
  });

  it("+ New appends a row and opens its title for editing", async () => {
    const onCreateRow = vi.fn().mockResolvedValue("row-2");
    const { onCreateRow: created } = renderEditable({ onCreateRow });
    fireEvent.click(screen.getByRole("button", { name: "+ New" }));
    expect(created).toHaveBeenCalledTimes(1);
    // The new row (mocked as row-2, which is rendered) gets its title cell open.
    expect(await screen.findByRole("textbox", { name: "Name" })).toBeTruthy();
  });

  it("a relation cell shows each target as a pill, linked when it has a href", () => {
    const PROBLEMS = "pproblems001";
    render(
      <DatabaseTable
        database={{
          titlePropertyId: TITLE,
          properties: [
            { id: TITLE, name: "Name", type: "title" },
            { id: PROBLEMS, name: "Problems", type: "relation", relation: { targetKind: "ROW", targetDatabaseId: "db2", many: true } },
          ],
        }}
        rows={[
          {
            ...rows[0]!,
            relations: {
              [PROBLEMS]: [
                { kind: "ROW", id: "q1", title: "Gaps", href: "/w/acme/pages/q1" },
                { kind: "ROW", id: "q2", title: "Noise" },
              ],
            },
          },
        ]}
        columns={[TITLE, PROBLEMS]}
      />,
    );
    expect(screen.getByRole("link", { name: "Gaps" }).getAttribute("href")).toBe("/w/acme/pages/q1");
    expect(screen.getByText("Noise").tagName).toBe("SPAN");
  });

  it("with schema handlers the header offers a property editor per column and an add button", () => {
    render(
      <DatabaseTable
        database={database}
        rows={rows}
        columns={[TITLE, STATUS]}
        editable
        onWriteCell={vi.fn()}
        onAddProperty={vi.fn()}
        onUpdateProperty={vi.fn()}
        onRemoveProperty={vi.fn()}
        onReorderColumns={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Edit property Name" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit property Status" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add a property" })).toBeTruthy();
    // Draggable headers keep their table semantics (dnd-kit's role="button" is not applied).
    expect(screen.getAllByRole("columnheader").length).toBeGreaterThanOrEqual(2);
    // A select cell shows its option as a pill.
    expect(screen.getAllByRole("button", { name: "Status" })[0]!.textContent).toBe("Tracked");
  });

  it("read-only tables have no + New line and no focusable cells", () => {
    const { container } = render(<DatabaseTable database={database} rows={rows} columns={[TITLE, STATUS]} />);
    expect(screen.queryByRole("button", { name: "+ New" })).toBeNull();
    expect(container.querySelector("td[tabindex]")).toBeNull();
  });
});
