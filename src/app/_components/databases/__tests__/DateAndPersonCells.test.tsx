/**
 * Date and person cells, and the read-only created / edited / created-by
 * columns (ADR-0078 §5).
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "~/test/test-utils";

import { DateCell } from "../cells/DateCell";
import { PersonCell } from "../cells/PersonCell";
import { DatabaseTable } from "../DatabaseTable";
import type { PickerUser } from "~/app/_components/shared/PersonPicker";
import type { PropertyDef } from "~/lib/databases/schema";

const due: PropertyDef = { id: "pdue", name: "Due", type: "date" };
const owner: PropertyDef = { id: "powner", name: "Owner", type: "person" };
const people = new Map<string, PickerUser>([
  ["u-ana", { id: "u-ana", name: "Ana", email: "ana@x.y", image: null }],
]);

describe("DateCell", () => {
  it("shows the day, or a dash, and opens the calendar from its trigger", async () => {
    const { unmount } = render(<DateCell def={due} value="2026-10-31T08:00:00.000Z" editable onCommit={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Due" }).textContent).toBe("2026-10-31");
    unmount();
    render(<DateCell def={due} value={null} editable onCommit={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "Due" });
    expect(trigger.textContent).toBe("—");
    fireEvent.click(trigger);
    // The shared calendar popover opened (Mantine marks the target expanded).
    await waitFor(() => expect(trigger.getAttribute("aria-expanded")).toBe("true"));
  });

  it("a viewer sees the text only", () => {
    render(<DateCell def={due} value="2026-10-31" editable={false} onCommit={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Due" })).toBeNull();
    expect(screen.getByText("2026-10-31")).toBeTruthy();
  });
});

describe("PersonCell", () => {
  it("read-only it shows the member's name, or the raw id for someone unknown", () => {
    render(<PersonCell def={owner} value={["u-ana", "u-gone"]} workspaceId="ws1" people={people} editable={false} onCommit={vi.fn()} />);
    expect(screen.getByText("Ana")).toBeTruthy();
    expect(screen.getByText("u-gone")).toBeTruthy();
  });
});

describe("read-only computed columns", () => {
  it("created time, last edited time and created by come from the row page and are not editable", () => {
    const database = {
      titlePropertyId: "pt",
      properties: [
        { id: "pt", name: "Name", type: "title" as const },
        { id: "pc", name: "Created", type: "createdTime" as const },
        { id: "pe", name: "Edited", type: "lastEditedTime" as const },
        { id: "pb", name: "By", type: "createdBy" as const },
      ],
    };
    const rows = [
      { id: "r1", title: "Alert latency", values: {}, createdById: "u-ana", createdAt: "2026-10-03T09:00:00Z", updatedAt: "2026-10-04T09:00:00Z" },
    ];
    const { container } = render(
      <DatabaseTable database={database} rows={rows} columns={["pt", "pc", "pe", "pb"]} people={people} editable onWriteCell={vi.fn()} />,
    );
    expect(screen.getByText("2026-10-03")).toBeTruthy();
    expect(screen.getByText("2026-10-04")).toBeTruthy();
    expect(screen.getByText("Ana")).toBeTruthy();
    const computedCells = container.querySelectorAll('td[data-editable="false"]');
    expect(computedCells).toHaveLength(3);
  });
});
