/**
 * The card's title renders an Action name through HTMLContent, so a legacy
 * Tiptap HTML name shows as a real link there. Its aria-label cannot — it is a
 * string — so until it reduced the name to text a screen reader announced the
 * whole `<a target="_blank" …>` source before reaching the priority and due
 * date. Nothing on screen gave that away, which is why it gets a test.
 */

import React from "react";
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "~/test/test-utils";

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({
      action: { getAll: { invalidate: vi.fn() } },
      view: { getViewActions: { invalidate: vi.fn() } },
      list: { list: { invalidate: vi.fn() } },
    }),
    list: {
      list: { useQuery: () => ({ data: undefined }) },
      addAction: { useMutation: () => ({ mutate: vi.fn() }) },
      removeAction: { useMutation: () => ({ mutate: vi.fn() }) },
    },
  },
}));

vi.mock("~/providers/WorkspaceProvider", () => ({
  useWorkspace: () => ({ workspaceId: "w1" }),
}));

// The card mounts these modals closed. They run their own queries, which this
// test has no reason to describe.
vi.mock("~/app/_components/AssignActionModal", () => ({
  AssignActionModal: () => null,
}));
vi.mock("~/app/_components/EditActionModal", () => ({
  EditActionModal: () => null,
}));

// The card is a sortable item; outside a DndContext the hook has no store to
// read, and its transform/listeners are not what these tests are about.
vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}));

import { TaskCard } from "~/app/_components/TaskCard";

const HTML_NAME =
  'Read <a target="_blank" rel="noopener noreferrer" class="text-blue-500 underline cursor-pointer" href="https://app.notion.com/p/PRD">Situation Analysis doc</a>';

function renderCard(name: string) {
  const task = {
    id: "a1",
    name,
    description: null,
    priority: "Quick",
    dueDate: null,
    assignees: [],
    status: "ACTIVE",
  };

  return render(<TaskCard task={task as never} />);
}

describe("TaskCard accessible name", () => {
  test("reads the text of a legacy HTML name, not its markup", () => {
    renderCard(HTML_NAME);

    const card = screen.getByRole("button", { name: /^Task: Read Situation Analysis doc\./ });
    expect(card).toBeTruthy();
    expect(card.getAttribute("aria-label")).not.toContain("target=");
    expect(card.getAttribute("aria-label")).not.toContain("</a>");
  });

  test("the title still renders the name as a link", () => {
    const { container } = renderCard(HTML_NAME);

    const link = container.querySelector("a");
    expect(link?.textContent).toBe("Situation Analysis doc");
  });

  test("falls back to Untitled when the name reduces to nothing", () => {
    renderCard("<p></p>");

    expect(screen.getByRole("button", { name: /^Task: Untitled\./ })).toBeTruthy();
  });

  test("leaves a plain action name alone", () => {
    renderCard("Syntrofi contracts");

    expect(
      screen.getByRole("button", { name: /^Task: Syntrofi contracts\./ }),
    ).toBeTruthy();
  });
});
