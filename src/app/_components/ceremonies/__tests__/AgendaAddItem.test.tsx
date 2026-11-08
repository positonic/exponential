/**
 * A section's add box: Note, Action (owner and due date) or Decision (picked
 * from the workspace's decisions), each handed back as its own kind.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "~/test/test-utils";
import "@testing-library/jest-dom/vitest";

vi.mock("~/trpc/react", () => ({
  api: {
    decision: {
      list: {
        useQuery: (_input: unknown, opts: { enabled: boolean }) => ({
          data: opts.enabled ? [{ id: "d-150", label: "D-0150", statement: "Ship CSV export?" }] : undefined,
        }),
      },
    },
  },
}));
vi.mock("~/app/_components/shared/PersonPicker", () => ({
  PersonPicker: (props: { onChange: (id: string | null) => void }) => (
    <button type="button" onClick={() => props.onChange("u-zineb")}>
      pick owner
    </button>
  ),
}));

import { AgendaAddItem, parseDecisionSearchNumber } from "../AgendaAddItem";

describe("AgendaAddItem", () => {
  it("adds a note by default", () => {
    const onAdd = vi.fn();
    render(<AgendaAddItem sectionKey="s" workspaceId="ws-1" onAdd={onAdd} />);
    fireEvent.change(screen.getByTestId("agenda-add-title-s"), { target: { value: "Vendor risk" } });
    fireEvent.keyDown(screen.getByTestId("agenda-add-title-s"), { key: "Enter" });
    expect(onAdd).toHaveBeenCalledWith("s", { kind: "note", title: "Vendor risk" });
  });

  it("adds an action with its owner", () => {
    const onAdd = vi.fn();
    render(<AgendaAddItem sectionKey="s" workspaceId="ws-1" onAdd={onAdd} />);
    fireEvent.click(screen.getByText("+ Action"));
    fireEvent.change(screen.getByTestId("agenda-add-title-s"), { target: { value: "Respond to stakeholders" } });
    fireEvent.click(screen.getByText("pick owner"));
    fireEvent.click(screen.getByTestId("agenda-add-submit-s"));
    expect(onAdd).toHaveBeenCalledWith("s", { kind: "action", title: "Respond to stakeholders", assigneeId: "u-zineb", dueDate: null });
  });

  it("offers the workspace's decisions in Decision mode and adds nothing until one is picked", () => {
    const onAdd = vi.fn();
    render(<AgendaAddItem sectionKey="s" workspaceId="ws-1" onAdd={onAdd} />);
    fireEvent.click(screen.getByText("+ Decision"));
    expect(screen.getByTestId("agenda-add-decision-s")).toBeInTheDocument();
    expect(screen.getByTestId("agenda-add-submit-s")).toBeDisabled();
  });
});

describe("parseDecisionSearchNumber", () => {
  it("reads a D-number or bare number, and leaves a statement search alone", () => {
    expect(parseDecisionSearchNumber("D-0150")).toBe(150);
    expect(parseDecisionSearchNumber("d150")).toBe(150);
    expect(parseDecisionSearchNumber("150")).toBe(150);
    expect(parseDecisionSearchNumber("ship csv")).toBeNull();
    expect(parseDecisionSearchNumber("")).toBeNull();
  });
});
