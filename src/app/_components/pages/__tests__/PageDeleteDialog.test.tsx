/**
 * The delete gate only trusts this opening's impact check. React Query keeps
 * an earlier opening's facts cached while it refetches, and the page may have
 * been published or linked since, so those facts must neither show nor
 * unlock the button; a failed re-check blocks deletion outright.
 */

import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "~/test/test-utils";

interface ImpactState {
  data?: { linkedFromCount: number; linkedFromCapped: boolean; subpageCount: number; isPublic: boolean };
  isSuccess: boolean;
  isError: boolean;
  isFetching: boolean;
  dataUpdatedAt: number;
  error?: { message: string } | null;
}

const impact: { current: ImpactState } = {
  current: { isSuccess: false, isError: false, isFetching: true, dataUpdatedAt: 0 },
};

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({}),
    page: {
      deleteImpact: { useQuery: () => impact.current },
      delete: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
    },
  },
}));

import { PageDeleteDialog } from "../PageDeleteDialog";

const FACTS = { linkedFromCount: 0, linkedFromCapped: false, subpageCount: 0, isPublic: false };
const TITLE = "Roadmap";

function openDialog() {
  render(
    <PageDeleteDialog pageId="p1" pageTitle={TITLE} opened onClose={vi.fn()} onDeleted={vi.fn()} />,
  );
  fireEvent.change(screen.getByLabelText("Type the page title to confirm"), {
    target: { value: TITLE },
  });
  return screen.getByRole("button", { name: "Delete page" }) as HTMLButtonElement;
}

describe("PageDeleteDialog", () => {
  beforeEach(() => {
    impact.current = { isSuccess: false, isError: false, isFetching: true, dataUpdatedAt: 0 };
  });

  test("an earlier opening's cached facts, still refetching, neither show nor unlock delete", () => {
    impact.current = {
      data: FACTS,
      isSuccess: true,
      isError: false,
      isFetching: true,
      dataUpdatedAt: Date.now() - 60_000,
    };
    const button = openDialog();
    expect(screen.queryByTestId("page-delete-impact")).toBeNull();
    expect(button.disabled).toBe(true);
  });

  test("a failed re-check blocks delete, even with facts cached from before", () => {
    impact.current = {
      data: FACTS,
      isSuccess: false,
      isError: true,
      isFetching: false,
      dataUpdatedAt: Date.now() - 60_000,
      error: { message: "boom" },
    };
    const button = openDialog();
    expect(screen.queryByText("Could not work out what this breaks")).not.toBeNull();
    expect(screen.queryByTestId("page-delete-impact")).toBeNull();
    expect(button.disabled).toBe(true);
  });

  test("this opening's successful check shows the facts and, with the title typed, unlocks delete", () => {
    impact.current = {
      data: { ...FACTS, isPublic: true },
      isSuccess: true,
      isError: false,
      isFetching: false,
      dataUpdatedAt: Date.now() + 60_000,
    };
    const button = openDialog();
    expect(screen.getByTestId("page-delete-impact").textContent).toContain("Its public URL stops resolving");
    expect(button.disabled).toBe(false);
  });
});
