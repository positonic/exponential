/**
 * The database block's table (ADR-0078 §6): visible columns in view order,
 * the title linking to the row page, values shown the way their type reads.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "~/test/test-utils";

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
