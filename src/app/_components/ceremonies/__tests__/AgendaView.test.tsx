/**
 * AgendaView picks each line's chrome from what the line is: a checkbox only
 * where resolving means something, reorder controls revealed on hover, and
 * no section-type badges or "no goal linked" filler.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "~/test/test-utils";
import "@testing-library/jest-dom/vitest";

// The real menu talks to tRPC; here it is a button that reports a decision.
vi.mock("~/app/_components/decisions/DecisionStatusMenu", () => ({
  DecisionStatusMenu: (props: { targetLabel?: string; onChanged?: (status: string) => void }) => (
    <button type="button" onClick={() => props.onChanged?.("ACCEPTED")}>
      {props.targetLabel}
    </button>
  ),
}));

vi.mock("../AgendaAddItem", () => ({ AgendaAddItem: () => <div data-testid="add-box" /> }));

import { AgendaView, actionLiveState, isResolvableItem } from "../AgendaView";
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
    expect(isResolvableItem({ refType: "decision", live: { kind: "decision", status: "PROPOSED", number: 1 } })).toBe(true);
    expect(isResolvableItem({ refType: "decision", live: { kind: "decision", status: "ACCEPTED", number: 1 } })).toBe(false);
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

  it("renders hand-item detail as Markdown with D-number and ticket links; query detail stays text", () => {
    const withDetail: AgendaSnapshot = {
      ...agenda,
      sections: [
        {
          key: "s",
          type: "free_text",
          title: "Risks",
          items: [
            item("hand", { addedByUserId: "u-1", title: "James: signal-to-event grouping", detail: "**See** #1339 and D-0150" }),
            item("q", { refType: "action", order: 1, detail: "due 8 Nov · *Andi*" }),
          ],
        },
      ],
    };
    render(<AgendaView agenda={withDetail} refLinks={{ workspaceSlug: "clear", productSlug: "clear-app" }} />);
    const detail = screen.getByTestId("agenda-item-detail-hand");
    expect(detail.querySelector("strong")).toHaveTextContent("See");
    expect(screen.getByRole("link", { name: "#1339" })).toHaveAttribute("href", "/w/clear/products/clear-app/tickets/1339");
    expect(screen.getByRole("link", { name: "D-0150" })).toHaveAttribute("href", "/w/clear/decisions/d/D-0150");
    expect(screen.getByTestId("agenda-item-detail-q")).toHaveTextContent("due 8 Nov · *Andi*");
  });

  it("shows an Action-backed item's owner, due date and live status, ticked when the Action is done", () => {
    const live: AgendaSnapshot = {
      ...agenda,
      sections: [
        {
          key: "s",
          type: "free_text",
          title: "Actions",
          items: [
            item("act", {
              refType: "action",
              addedByUserId: "u-1",
              live: { kind: "action", status: "COMPLETED", completedAt: "2026-11-09T10:00:00Z", dueDate: "2026-11-14T00:00:00Z", assignees: [{ id: "u-z", name: "Zineb", image: null }] },
            }),
          ],
        },
      ],
    };
    render(<AgendaView agenda={live} onToggleResolved={vi.fn()} />);
    expect(screen.getByTestId("agenda-item-live-act")).toHaveTextContent("Zineb · due 14 Nov");
    expect(screen.getByTestId("agenda-item-state-act")).toHaveTextContent("done");
    expect(screen.getByTestId("agenda-item-resolve-act")).toBeChecked();
  });
});

describe("AgendaView decision items", () => {
  it("shows a linked Decision's D-number and live status on a hand item", () => {
    const withDecision: AgendaSnapshot = {
      ...agenda,
      sections: [
        {
          key: "s",
          type: "free_text",
          title: "Decisions",
          items: [item("dec", { refType: "decision", addedByUserId: "u-1", live: { kind: "decision", status: "OPEN", number: 150 } })],
        },
      ],
    };
    render(<AgendaView agenda={withDecision} onToggleResolved={vi.fn()} />);
    expect(screen.getByTestId("agenda-item-live-dec")).toHaveTextContent("D-0150");
    expect(screen.getByTestId("agenda-item-state-dec")).toHaveTextContent("open question");
    expect(screen.getByTestId("agenda-item-resolve-dec")).not.toBeChecked();
  });
});

describe("AgendaView inline Decide", () => {
  const withDecisions = (status: string): AgendaSnapshot => ({
    ...agenda,
    sections: [
      {
        key: "dec",
        type: "decisions_pending",
        title: "Decisions pending",
        items: [item("d", { refType: "decision", detail: "D-0150 · open question", live: { kind: "decision", status, number: 150 } })],
      },
    ],
  });

  it("offers Decide on an open decision and reports the new status", () => {
    const onChanged = vi.fn();
    render(<AgendaView agenda={withDecisions("OPEN")} decide={{ workspaceId: "ws-1", onChanged }} />);
    fireEvent.click(screen.getByRole("button", { name: "Decide" }));
    expect(onChanged).toHaveBeenCalledWith("d", "ACCEPTED");
  });

  it("offers no Decide once the decision is accepted", () => {
    render(<AgendaView agenda={withDecisions("ACCEPTED")} decide={{ workspaceId: "ws-1", onChanged: vi.fn() }} />);
    expect(screen.queryByTestId("agenda-item-decide-d")).not.toBeInTheDocument();
  });
});

describe("actionLiveState", () => {
  const base = { kind: "action" as const, completedAt: null, assignees: [] };
  const now = new Date("2026-11-10T12:00:00Z");
  it("is done, overdue or open", () => {
    expect(actionLiveState({ ...base, status: "COMPLETED", dueDate: "2026-11-01T00:00:00Z" }, now)).toBe("done");
    expect(actionLiveState({ ...base, status: "ACTIVE", dueDate: "2026-11-01T00:00:00Z" }, now)).toBe("overdue");
    expect(actionLiveState({ ...base, status: "ACTIVE", dueDate: null }, now)).toBe("open");
  });
});
