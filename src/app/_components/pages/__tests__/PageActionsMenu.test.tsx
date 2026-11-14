/**
 * The Page actions menu's contents by access level.
 *
 * The menu is where a hard delete, a re-placement and a search-index toggle
 * are reachable, so which of them a viewer is offered is a rule worth pinning:
 * a viewer gets the read-only items and nothing else. Asserted on the visible
 * labels, in order, the same thing the requirement row states.
 */

import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "~/test/test-utils";

const childrenData: { current: { id: string }[] } = { current: [] };

// The menu reads sub-page existence and fires mutations; none of that is
// under test here, so the tRPC surface is a stub.
vi.mock("~/trpc/react", () => {
  const noopMutation = () => ({ mutate: vi.fn(), isPending: false });
  return {
    api: {
      useUtils: () => ({
        page: {
          list: { invalidate: vi.fn() },
          tree: { invalidate: vi.fn() },
          get: { setData: vi.fn() },
        },
      }),
      page: {
        children: { useQuery: () => ({ data: childrenData.current }) },
        duplicate: { useMutation: noopMutation },
        update: { useMutation: noopMutation },
      },
    },
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
// The dialogs have their own data needs; the menu only opens them.
vi.mock("~/app/_components/pages/PageDeleteDialog", () => ({ PageDeleteDialog: () => null }));
vi.mock("~/app/_components/pages/PageMoveDialog", () => ({ PageMoveDialog: () => null }));

import { PageActionsMenu, type PageActionsMenuProps } from "../PageActionsMenu";

const READ_ONLY = [
  "Full width",
  "Copy link",
  "Open in new tab",
  "Copy markdown",
  "Markdown",
  "Print / Save as PDF",
  "History",
];
const EDITOR_ONLY = [
  "Move to project…",
  "Include in search",
  "Duplicate",
  "Duplicate with sub-pages",
  "Delete",
];

async function openMenu(props: Partial<PageActionsMenuProps> = {}) {
  render(
    <PageActionsMenu
      pageId="page-1"
      pageTitle="A page"
      workspaceId="ws-1"
      workspaceSlug="acme"
      projectId={null}
      includeInSearch
      canEdit
      getMarkdown={() => "Body text"}
      fullWidth={false}
      onToggleFullWidth={vi.fn()}
      onOpenHistory={vi.fn()}
      {...props}
    />,
  );
  fireEvent.click(screen.getByLabelText("Page actions"));
  await screen.findByText("Copy link");
  return screen.getAllByRole("menuitem").map((item) => item.textContent?.trim());
}

describe("PageActionsMenu", () => {
  beforeEach(() => {
    childrenData.current = [{ id: "child-1" }];
  });

  test("an editor gets every action, in the documented order", async () => {
    expect(await openMenu({ canEdit: true })).toEqual([...READ_ONLY, ...EDITOR_ONLY]);
  });

  test("a viewer gets the read-only items and nothing else", async () => {
    expect(await openMenu({ canEdit: false })).toEqual(READ_ONLY);
  });

  test("a database row keeps only the read-only items, even for an editor", async () => {
    // Placement, search inclusion, duplicate and delete follow the database.
    expect(await openMenu({ canEdit: true, isRow: true })).toEqual(READ_ONLY);
  });

  test("Duplicate with sub-pages appears only when the page has sub-pages", async () => {
    childrenData.current = [];
    const labels = await openMenu({ canEdit: true });
    expect(labels).toContain("Duplicate");
    expect(labels).not.toContain("Duplicate with sub-pages");
  });

  test("Copy link copies the internal editor URL, not a public one", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.spyOn(navigator.clipboard, "writeText").mockImplementation(writeText);
    await openMenu({ canEdit: false });
    fireEvent.click(screen.getByText("Copy link"));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/w/acme/pages/page-1`),
    );
  });

  test("Copy markdown copies the live editor's Markdown under the title", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.spyOn(navigator.clipboard, "writeText").mockImplementation(writeText);
    await openMenu({ canEdit: false, getMarkdown: () => "Unsaved edit" });
    fireEvent.click(screen.getByText("Copy markdown"));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("# A page\n\nUnsaved edit\n"));
  });
});
