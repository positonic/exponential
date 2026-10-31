import { describe, expect, it } from "vitest";

import { computedValue, displayDate, displayValue } from "../display";
import type { PropertyDef } from "../schema";

const status: PropertyDef = {
  id: "p1",
  name: "Status",
  type: "select",
  options: [
    { id: "o_a", name: "Tracked", color: "green" },
    { id: "o_b", name: "Dropped", color: "red" },
  ],
};

describe("displayValue", () => {
  it("renders each type the way the table shows it", () => {
    expect(displayValue({ id: "t", name: "Notes", type: "text" }, "p95 latency")).toBe("p95 latency");
    expect(displayValue({ id: "n", name: "Score", type: "number" }, 7.5)).toBe("7.5");
    expect(displayValue(status, "o_a")).toBe("Tracked");
    expect(displayValue(status, "o_gone")).toBe("o_gone");
    expect(displayValue({ ...status, type: "multiSelect" }, ["o_b", "o_a"])).toBe("Dropped, Tracked");
    expect(displayValue({ id: "c", name: "Done", type: "checkbox" }, true)).toBe("Yes");
    expect(displayValue({ id: "c", name: "Done", type: "checkbox" }, false)).toBe("No");
    expect(displayValue({ id: "d", name: "Due", type: "date" }, "2026-10-31T08:00:00.000Z")).toBe("2026-10-31");
    expect(
      displayValue({ id: "o", name: "Owner", type: "person" }, ["u1", "u2"], {
        personName: (id) => (id === "u1" ? "Ana" : undefined),
      }),
    ).toBe("Ana, u2");
  });

  it("an empty cell is an empty string", () => {
    expect(displayValue(status, null)).toBe("");
    expect(displayValue(status, undefined)).toBe("");
    expect(displayValue({ id: "t", name: "Notes", type: "text" }, "")).toBe("");
  });

  it("displayDate keeps a bare day and trims an instant to its day", () => {
    expect(displayDate("2026-10-31")).toBe("2026-10-31");
    expect(displayDate("2026-10-31T10:00:00Z")).toBe("2026-10-31");
    expect(displayDate("soon")).toBe("soon");
  });

  it("computedValue reads the read-only properties off the row page", () => {
    const row = { createdAt: "2026-10-03T00:00:00Z", updatedAt: new Date("2026-10-04T00:00:00Z"), createdById: "u1" };
    expect(computedValue({ id: "c", name: "Created", type: "createdTime" }, row)).toBe("2026-10-03T00:00:00.000Z");
    expect(computedValue({ id: "e", name: "Edited", type: "lastEditedTime" }, row)).toBe("2026-10-04T00:00:00.000Z");
    expect(computedValue({ id: "b", name: "By", type: "createdBy" }, row)).toEqual(["u1"]);
    expect(computedValue(status, row)).toBeNull();
  });
});
