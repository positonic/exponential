/**
 * AgendaView picks each line's chrome from what the line is: a checkbox only
 * where resolving means something, reorder controls revealed on hover, and
 * no section-type badges or "no goal linked" filler.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "~/test/test-utils";
import "@testing-library/jest-dom/vitest";

import { AgendaView, isResolvableItem } from "../AgendaView";
import type { AgendaItem, AgendaSnapshot } from "~/server/services/ceremonies/agenda/types";

const item = (id: string, extra: Partial<AgendaItem>): AgendaItem => ({
  id,
  sectionKey: "s",
  title: id,
  refType: "text",
  refId: id,
  order: 0,
  ...extra,
});

const agenda: AgendaSnapshot = {
  version: 1,
  generatedAt: "2026-11-10T12:00:00Z",
  narrative: "A pre-read that must not render here",
  sections: [
    {
      key: "s",
      type: "decisions_pending",
      title: "Things",
      items: [
        item("act", { refType: "action", order: 0, href: "/w/ws/actions/a" }),
        item("dec", { refType: "decision", order: 1 }),
        item("hand", { refType: "text", addedByUserId: "u-1", order: 2 }),
        item("cycle", { refType: "cycle", order: 3 }),
        item("proj", { refType: "project", order: 4 }),
        item("kr", { refType: "key_result", order: 5 }),
      ],
    },
  ],
};

describe("isResolvableItem", () => {
  it("is true for actions, decisions and hand-added text only", () => {
    expect(isResolvableItem({ refType: "action" })).toBe(true);
    expect(isResolvableItem({ refType: "decision" })).toBe(true);
    expect(isResolvableItem({ refType: "text", addedByUserId: "u-1" })).toBe(true);
    expect(isResolvableItem({ refType: "text" })).toBe(false);
    for (const refType of ["cycle", "project", "key_result", "goal", "meeting", "ticket"] as const) {
      expect(isResolvableItem({ refType })).toBe(false);
    }
  });
});

describe("AgendaView", () => {
  it("renders a resolve checkbox only on resolvable kinds", () => {
    render(<AgendaView agenda={agenda} onToggleResolved={vi.fn()} />);
    for (const id of ["act", "dec", "hand"]) expect(screen.getByTestId(`agenda-item-resolve-${id}`)).toBeInTheDocument();
    for (const id of ["cycle", "proj", "kr"]) expect(screen.queryByTestId(`agenda-item-resolve-${id}`)).not.toBeInTheDocument();
  });

  it("hides reorder controls until the row is hovered or focused", () => {
    render(<AgendaView agenda={agenda} onReorder={vi.fn()} />);
    const controls = screen.getByTestId("agenda-item-reorder-act");
    expect(controls.className).toContain("opacity-0");
    expect(controls.className).toContain("group-hover:opacity-100");
    expect(screen.getByTestId("agenda-item-act").className).toContain("group");
  });

  it("shows no type badge, no 'no goal linked' line and no narrative", () => {
    render(<AgendaView agenda={agenda} />);
    expect(screen.queryByText("decisions pending")).not.toBeInTheDocument();
    expect(screen.queryByText("no goal linked")).not.toBeInTheDocument();
    expect(screen.queryByText(/must not render here/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("agenda-narrative")).not.toBeInTheDocument();
  });
});
