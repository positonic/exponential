/**
 * The row page's pieces (ADR-0078 §3): the property header above the prose,
 * and the "Removed databases" row with Restore and Delete.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "~/test/test-utils";

import { RowPropertiesHeaderView } from "../RowPropertiesHeader";
import { DetachedDatabasesView } from "../DetachedDatabases";
import type { PickerUser } from "~/app/_components/shared/PersonPicker";
import type { PropertyDef } from "~/lib/databases/schema";

const properties: PropertyDef[] = [
  { id: "pt", name: "Name", type: "title" },
  { id: "ps", name: "Status", type: "select", options: [{ id: "o_tr", name: "Tracked", color: "green" }] },
  { id: "pn", name: "Notes", type: "text" },
  { id: "pd", name: "Done", type: "checkbox" },
  { id: "pc", name: "Created", type: "createdTime" },
];
const row = {
  id: "r1",
  title: "Alert latency",
  values: { ps: "o_tr", pn: "p95", pd: true },
  createdById: "u1",
  createdAt: "2026-10-03T09:00:00Z",
  updatedAt: "2026-10-04T09:00:00Z",
};
const people = new Map<string, PickerUser>();

describe("RowPropertiesHeaderView", () => {
  it("lists every non-title property with its value, read-only values plain", () => {
    render(<RowPropertiesHeaderView properties={properties} row={row} workspaceId="ws1" people={people} editable={false} onWrite={vi.fn()} />);
    const header = screen.getByTestId("row-properties");
    expect(header.textContent).toContain("Status");
    expect(header.textContent).toContain("Tracked");
    expect(header.textContent).toContain("Notes");
    expect(header.textContent).toContain("p95");
    expect(header.textContent).toContain("Created");
    expect(header.textContent).toContain("2026-10-03");
    expect(header.textContent).not.toContain("Name");
    expect(screen.queryByRole("button", { name: "Edit Notes" })).toBeNull();
  });

  it("editable: a text field opens in place and writes through onWrite; a checkbox flips", async () => {
    const onWrite = vi.fn();
    render(<RowPropertiesHeaderView properties={properties} row={row} workspaceId="ws1" people={people} editable onWrite={onWrite} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Notes" }));
    const input = await screen.findByRole("textbox", { name: "Notes" });
    fireEvent.change(input, { target: { value: "p95 and p99" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(onWrite).toHaveBeenCalledWith("pn", "p95 and p99"));
    fireEvent.click(screen.getByRole("checkbox", { name: "Done" }));
    expect(onWrite).toHaveBeenCalledWith("pd", false);
  });

  it("renders nothing when the database has only a title", () => {
    const { container } = render(
      <RowPropertiesHeaderView properties={[properties[0]!]} row={row} workspaceId="ws1" people={people} editable onWrite={vi.fn()} />,
    );
    expect(container.querySelector('[data-testid="row-properties"]')).toBeNull();
  });
});

describe("DetachedDatabasesView", () => {
  const detached = [
    { id: "db1", name: "Metrics", rowCount: 12, detachedAt: "2026-10-20T00:00:00Z" },
    { id: "db2", name: "Problems", rowCount: 1, detachedAt: "2026-10-21T00:00:00Z" },
  ];

  it("lists detached databases with counts and offers Restore and Delete to editors", async () => {
    const onRestore = vi.fn().mockResolvedValue(undefined);
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<DetachedDatabasesView databases={detached} editable onRestore={onRestore} onDelete={onDelete} />);
    expect(screen.getByText("Removed databases (2)")).toBeTruthy();
    expect(screen.getByText("12 rows")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Restore Metrics" }));
    await waitFor(() => expect(onRestore).toHaveBeenCalledWith(detached[0]));
    fireEvent.click(screen.getByRole("button", { name: "Delete Problems" }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(detached[1]));
  });

  it("viewers see the list without controls; nothing renders when nothing is detached", () => {
    const { unmount } = render(<DetachedDatabasesView databases={detached} editable={false} />);
    expect(screen.queryByRole("button", { name: "Restore Metrics" })).toBeNull();
    unmount();
    const { container } = render(<DetachedDatabasesView databases={[]} editable />);
    expect(container.querySelector('[data-testid="detached-databases"]')).toBeNull();
  });
});
