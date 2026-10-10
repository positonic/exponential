import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "~/test/test-utils";
import type { RailBlock } from "~/lib/actions/railBlocks";
import { TimelineRail } from "../TimelineRail";

const blocks: RailBlock[] = ["a", "b", "c", "d"].map((id) => ({
  id,
  title: id,
  start: 10,
  end: 11,
  kind: "task",
}));

describe("TimelineRail", () => {
  it("lays collisions into lanes and exposes blocks beyond the cap", () => {
    render(
      <TimelineRail
        dayLabel="Today"
        eventsCount={0}
        focusCount={0}
        blocks={blocks}
        range={[7, 20]}
        now={9}
      />,
    );

    const overflow = screen.getByRole("button", { name: "+2 more" });
    expect(screen.getByText("a").parentElement?.style.width).toBe("33%");

    fireEvent.click(overflow);
    expect(screen.getByRole("list").textContent).toContain("c");
    expect(screen.getByRole("list").textContent).toContain("d");
  });
});
