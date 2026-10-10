import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "~/test/test-utils";
import type { RailBlock } from "~/lib/actions/railBlocks";
import { AgendaRail } from "../AgendaRail";

const blocks: RailBlock[] = ["a", "b", "c", "d"].map((id) => ({
  id,
  title: id,
  start: 10,
  end: 11,
  kind: "task",
}));

describe("AgendaRail overflow", () => {
  it("anchors the panel to the button instead of the hidden time span", () => {
    render(
      <AgendaRail dayLabel="Today" eventsCount={0} blocks={blocks} now={9} />,
    );

    const button = screen.getByRole("button", { name: "+2 more" });
    expect(button.parentElement?.style.height).toBe("");

    fireEvent.click(button);
    expect(screen.getByRole("list")).toBeTruthy();
  });
});
