/**
 * A notes page nobody has written in renders collapsed under the agenda, and
 * opens on "Add notes"; a page with text renders the editor straight away.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "~/test/test-utils";
import "@testing-library/jest-dom/vitest";

const state = vi.hoisted(() => ({
  page: null as null | Record<string, unknown>,
}));

vi.mock("~/trpc/react", () => ({
  api: {
    page: {
      get: { useQuery: () => ({ data: state.page, isLoading: false, error: null }) },
    },
  },
}));
vi.mock("~/app/_components/pages/PageDocument", () => ({
  PageDocument: () => <div data-testid="page-document" />,
}));

import { OccurrenceNotes } from "../OccurrenceNotes";

const basePage = { id: "page-1", canEdit: true, bodyDoc: null, workspaceId: "ws-1", projectId: null };

describe("OccurrenceNotes", () => {
  beforeEach(() => {
    state.page = null;
  });

  it("collapses a blank, never-saved page and expands it on Add notes", () => {
    state.page = { ...basePage, body: "", docVersion: 0 };
    render(<OccurrenceNotes pageId="page-1" workspaceSlug="ws" />);
    expect(screen.getByTestId("occurrence-notes")).toHaveAttribute("data-collapsed", "true");
    expect(screen.queryByTestId("page-document")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("occurrence-notes-expand"));
    expect(screen.getByTestId("page-document")).toBeInTheDocument();
  });

  it("renders the editor when the page has content", () => {
    state.page = { ...basePage, body: "## Meeting summary\n\nWe agreed.", docVersion: 2 };
    render(<OccurrenceNotes pageId="page-1" workspaceSlug="ws" />);
    expect(screen.getByTestId("page-document")).toBeInTheDocument();
    expect(screen.getByTestId("occurrence-notes")).not.toHaveAttribute("data-collapsed");
  });

  it("offers no Add notes on a read-only blank page", () => {
    state.page = { ...basePage, body: "", docVersion: 0 };
    render(<OccurrenceNotes pageId="page-1" workspaceSlug="ws" readOnly />);
    expect(screen.queryByTestId("occurrence-notes-expand")).not.toBeInTheDocument();
    expect(screen.getByText("No notes yet.")).toBeInTheDocument();
  });
});
