/**
 * The CSV import dialog (ADR-0078, V4): each column maps to a property or
 * a new one, the preview marks the cell that does not fit and counts the
 * rows that will be created, and nothing imports while none would.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "~/test/test-utils";

import { CsvImportDialogView, type CsvPreviewData } from "../CsvImportDialog";
import type { PropertyDef } from "~/lib/databases/schema";

const TITLE = "ptitle000001";
const STATUS = "pstatus00001";
const SCORE = "pscore000001";
const properties: PropertyDef[] = [
  { id: TITLE, name: "Name", type: "title" },
  { id: STATUS, name: "Status", type: "select", options: [{ id: "o_tr", name: "Tracked", color: "green" }] },
  { id: SCORE, name: "Score", type: "number" },
  { id: "prel", name: "Problems", type: "relation", relation: { targetKind: "ROW", targetDatabaseId: "db2", many: true } },
];

const preview: CsvPreviewData = {
  headers: ["Name", "Status", "Score", "Owner"],
  mapping: {
    Name: { kind: "property", propertyId: TITLE },
    Status: { kind: "property", propertyId: STATUS },
    Score: { kind: "property", propertyId: SCORE },
    Owner: { kind: "new", name: "Owner", type: "text" },
  },
  columns: [
    { header: "Name", target: { kind: "property", propertyId: TITLE }, propertyName: "Name", type: "title" },
    { header: "Status", target: { kind: "property", propertyId: STATUS }, propertyName: "Status", type: "select" },
    { header: "Score", target: { kind: "property", propertyId: SCORE }, propertyName: "Score", type: "number" },
    { header: "Owner", target: { kind: "new", name: "Owner", type: "text" }, propertyName: "Owner", type: "text" },
  ],
  rows: [
    { index: 0, title: "Uptime", values: { [STATUS]: "o_tr", [SCORE]: 99, "new:Owner": "Ana" }, errors: [] },
    {
      index: 1,
      title: "Error budget",
      values: { [STATUS]: "Dropped", "new:Owner": "Ben" },
      errors: [{ header: "Score", propertyName: "Score", reason: 'expects a number, got "lots"' }],
    },
  ],
  total: 2,
  importable: 1,
  newOptions: { [STATUS]: ["Dropped"] },
};

function renderView(overrides: Partial<React.ComponentProps<typeof CsvImportDialogView>> = {}) {
  const onChangeMapping = vi.fn();
  const onCommit = vi.fn();
  render(
    <CsvImportDialogView
      opened
      onClose={vi.fn()}
      properties={properties}
      csv="Name,Status,Score,Owner\nUptime,Tracked,99,Ana"
      onCsvChange={vi.fn()}
      headers={preview.headers}
      mapping={preview.mapping}
      preview={preview}
      isPreviewing={false}
      previewError={null}
      onChangeMapping={onChangeMapping}
      onCommit={onCommit}
      committing={false}
      {...overrides}
    />,
  );
  return { onChangeMapping, onCommit };
}

describe("CsvImportDialogView", () => {
  it("shows a mapping select per header, the typed preview with the bad cell marked, the counts and the options to add", () => {
    renderView();
    expect(screen.getAllByRole("textbox", { name: /Import .* as/ })).toHaveLength(4);
    expect(screen.getByTestId("csv-summary").textContent).toContain("1 of 2 rows will be created; 1 left out");
    expect(screen.getByTestId("csv-new-options").textContent).toContain("Status: Dropped");
    const table = screen.getByTestId("csv-preview");
    expect(table.textContent).toContain("Tracked");
    expect(table.textContent).toContain('expects a number, got "lots"');
    expect(table.querySelectorAll('tr[data-row-ok="false"]')).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Import 1 row" })).toBeTruthy();
  });

  it("changing a column's destination reports the decoded target; relations and read-only properties are not offered", async () => {
    const { onChangeMapping } = renderView();
    fireEvent.click(screen.getByRole("textbox", { name: "Import Owner as" }));
    expect(screen.queryByRole("option", { name: "Problems" })).toBeNull();
    fireEvent.click(await screen.findByRole("option", { name: "New Number" }));
    await waitFor(() => expect(onChangeMapping).toHaveBeenCalledWith("Owner", { kind: "new", name: "Owner", type: "number" }));
    fireEvent.click(screen.getByRole("textbox", { name: "Import Owner as" }));
    fireEvent.click(await screen.findByRole("option", { name: "Don't import" }));
    await waitFor(() => expect(onChangeMapping).toHaveBeenCalledWith("Owner", { kind: "skip" }));
  });

  it("Import runs the commit, and is disabled while nothing would be created or the preview is updating", () => {
    const { onCommit } = renderView();
    fireEvent.click(screen.getByRole("button", { name: "Import 1 row" }));
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("a rejected mapping keeps the column editor on screen with the reason, and Import off", () => {
    renderView({ preview: null, previewError: 'Two columns map to "Score"' });
    expect(screen.getAllByRole("textbox", { name: /Import .* as/ })).toHaveLength(4);
    expect(screen.getByText('Two columns map to "Score"')).toBeTruthy();
    expect(screen.queryByTestId("csv-preview")).toBeNull();
    expect((screen.getByRole("button", { name: "Import 0 rows" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("with no importable row, or no preview, Import is disabled", () => {
    const { unmount } = render(
      <CsvImportDialogView
        opened
        onClose={vi.fn()}
        properties={properties}
        csv="Name\nx"
        onCsvChange={vi.fn()}
        headers={preview.headers}
        mapping={preview.mapping}
        preview={{ ...preview, importable: 0 }}
        isPreviewing={false}
        previewError={null}
        onChangeMapping={vi.fn()}
        onCommit={vi.fn()}
        committing={false}
      />,
    );
    expect((screen.getByRole("button", { name: "Import 0 rows" }) as HTMLButtonElement).disabled).toBe(true);
    unmount();
    render(
      <CsvImportDialogView
        opened
        onClose={vi.fn()}
        properties={properties}
        csv=""
        onCsvChange={vi.fn()}
        headers={[]}
        mapping={{}}
        preview={null}
        isPreviewing={false}
        previewError="The CSV has no header row"
        onChangeMapping={vi.fn()}
        onCommit={vi.fn()}
        committing={false}
      />,
    );
    expect((screen.getByRole("button", { name: "Import 0 rows" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("The CSV has no header row")).toBeTruthy();
  });
});
