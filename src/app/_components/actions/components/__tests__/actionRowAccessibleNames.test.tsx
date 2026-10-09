/**
 * The row's title renders an Action name through HTMLContent, so a legacy
 * Tiptap HTML name shows as a real link there. Its accessible names cannot do
 * that — an aria-label is a string — so until they reduced the name to text a
 * screen reader read out the whole `<a target="_blank" …>` source.
 */

import { describe, expect, test, vi } from "vitest";
import { render, screen } from "~/test/test-utils";

import { ActionRow } from "~/app/_components/actions/components/ActionRow";
import type { Action } from "~/lib/actions/types";

const HTML_NAME =
  'Read <a target="_blank" rel="noopener noreferrer" class="text-blue-500 underline cursor-pointer" href="https://app.notion.com/p/PRD">Situation Analysis doc</a>';

function renderRow(name: string) {
  const action = {
    id: "a1",
    name,
    description: null,
    status: "ACTIVE",
    priority: "Quick",
    dueDate: null,
    projectId: null,
    project: null,
    assignees: [],
  } as unknown as Action;

  return render(
    <ActionRow
      action={action}
      bulkMode
      onComplete={vi.fn()}
      onReschedule={vi.fn()}
      onOpen={vi.fn()}
    />,
  );
}

describe("ActionRow accessible names", () => {
  test("read the text of a legacy HTML name, not its markup", () => {
    renderRow(HTML_NAME);

    expect(
      screen.getByLabelText("Select Read Situation Analysis doc"),
    ).toBeTruthy();
    expect(
      screen.getByLabelText("Mark Read Situation Analysis doc as complete"),
    ).toBeTruthy();
  });

  test("the title still renders the name as a link", () => {
    const { container } = renderRow(HTML_NAME);

    const link = container.querySelector("a");
    expect(link?.textContent).toBe("Situation Analysis doc");
  });

  test("fall back to Untitled when the name reduces to nothing", () => {
    renderRow("<p></p>");

    expect(screen.getByLabelText("Select Untitled")).toBeTruthy();
  });

  test("leave a plain action name alone", () => {
    renderRow("Syntrofi contracts");

    expect(screen.getByLabelText("Select Syntrofi contracts")).toBeTruthy();
  });
});
