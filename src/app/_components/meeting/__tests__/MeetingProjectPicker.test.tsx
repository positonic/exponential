/**
 * Component tests for MeetingProjectPicker. Asserts external behaviour: it
 * groups options by workspace, filters on search, always offers the clear
 * ("Personal / no project") option, and emits the selected project id (or null)
 * to onChange.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "~/test/test-utils";
import "@testing-library/jest-dom/vitest";

import {
  MeetingProjectPicker,
  type MeetingProjectOption,
} from "../MeetingProjectPicker";

const PROJECTS: MeetingProjectOption[] = [
  { id: "p1", name: "Alpha", workspaceId: "ws1", workspaceName: "Acme" },
  { id: "p2", name: "Bravo", workspaceId: "ws1", workspaceName: "Acme" },
  { id: "p3", name: "Charlie", workspaceId: "ws2", workspaceName: "Beta Co" },
];

function setup(value: string | null = null) {
  const onChange = vi.fn();
  render(
    <MeetingProjectPicker projects={PROJECTS} value={value} onChange={onChange}>
      {() => <button type="button">trigger</button>}
    </MeetingProjectPicker>,
  );
  fireEvent.click(screen.getByText("trigger"));
  return { onChange };
}

describe("MeetingProjectPicker", () => {
  beforeEach(() => vi.clearAllMocks());

  it("groups options by workspace and always offers the clear option", () => {
    setup();
    expect(screen.getByText("Personal / no project")).toBeInTheDocument();
    // Group labels rendered for each workspace.
    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("Beta Co")).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Charlie")).toBeInTheDocument();
  });

  it("filters options as the user types", () => {
    setup();
    fireEvent.change(screen.getByPlaceholderText("Search projects…"), {
      target: { value: "char" },
    });
    expect(screen.getByText("Charlie")).toBeInTheDocument();
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    // The Beta Co group survives (it holds the match); Acme is gone.
    expect(screen.queryByText("Acme")).not.toBeInTheDocument();
  });

  it("emits the chosen project id", () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByText("Bravo"));
    expect(onChange).toHaveBeenCalledWith("p2");
  });

  it("emits null when the clear option is chosen", () => {
    const { onChange } = setup("p1");
    fireEvent.click(screen.getByText("Personal / no project"));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("shows an empty state when search matches nothing", () => {
    setup();
    fireEvent.change(screen.getByPlaceholderText("Search projects…"), {
      target: { value: "zzz" },
    });
    expect(screen.getByText("No matching projects")).toBeInTheDocument();
  });
});
