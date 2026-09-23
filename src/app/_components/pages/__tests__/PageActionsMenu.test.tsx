/**
 * The Page actions menu's contents by access level.
 *
 * The menu is the one place a hard delete, a re-placement and a search-index
 * toggle are reachable, so which of them a viewer is offered is a rule worth
 * pinning: a viewer gets the four read-only items and nothing else. Asserted
 * on the visible labels, the same thing the requirement row states.
 */

import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "~/test/test-utils";

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
          get: { setData: vi.fn(), invalidate: vi.fn() },
        },
        favorite: { list: { invalidate: vi.fn() } },
      }),
      page: {
        children: { useQuery: () => ({ data: [] }) },
        duplicate: { useMutation: noopMutation },
        update: { useMutation: noopMutation },
        deleteImpact: { useQuery: () => ({ data: undefined, isLoading: false }) },
        delete: { useMutation: () => ({ ...noopMutation(), error: null }) },
      },
      project: {
        getAssignable: { useQuery: () => ({ data: [], isLoading: false }) },
      },
    },
  };
});

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { PageActionsMenu } from "../PageActionsMenu";

const EDITOR_ONLY = [
  "Full width",
  "Move to project…",
  "Include in search",
  "Duplicate",
  "Delete",
];
const READ_ONLY = ["Copy link", "Open in new tab", "Copy markdown", "Markdown"];

function open(canEdit: boolean) {
  render(
    <PageActionsMenu
      pageId="page-1"
      pageTitle="A page"
      workspaceId="ws-1"
      workspaceSlug="acme"
      projectId={null}
      includeInSearch
      canEdit={canEdit}
    />,
  );
  fireEvent.click(screen.getByLabelText("Page actions"));
}

describe("PageActionsMenu", () => {
  beforeEach(() => vi.clearAllMocks());

  test("an editor gets the whole menu", async () => {
    open(true);
    for (const label of [...READ_ONLY, ...EDITOR_ONLY]) {
      expect(await screen.findByText(label)).toBeTruthy();
    }
  });

  test("a viewer gets the read-only items and nothing else", async () => {
    open(false);
    for (const label of READ_ONLY) {
      expect(await screen.findByText(label)).toBeTruthy();
    }
    for (const label of EDITOR_ONLY) {
      expect(screen.queryByText(label)).toBeNull();
    }
  });
});
