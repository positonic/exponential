/**
 * The primitives own radius, border and surface. These tests pin the
 * contract callers rely on: which classes each variant paints, that a
 * caller's className is appended (never replaces the surface), that `as`
 * swaps the element, and that the structural parts (count pill, action slot,
 * toolbar roles) render where documented.
 */
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { Panel, Pill, SectionHeader, Toolbar, cx } from "../index";

describe("cx", () => {
  test("joins truthy parts only", () => {
    expect(cx("a", false, undefined, "b", null, "")).toBe("a b");
  });
});

describe("Panel", () => {
  test("default is a surface-secondary card with the lg radius and md padding", () => {
    render(<Panel data-testid="p">x</Panel>);
    const el = screen.getByTestId("p");
    expect(el.tagName).toBe("DIV");
    expect(el.className).toBe(
      "border bg-surface-secondary border-border-primary rounded-lg p-4",
    );
  });

  test("variants, radius and padding map to tokens; className is appended last", () => {
    render(
      <Panel data-testid="p" variant="muted" radius="md" padding="none" className="mb-3">
        x
      </Panel>,
    );
    expect(screen.getByTestId("p").className).toBe(
      "border bg-background-secondary border-border-subtle rounded-md mb-3",
    );
    render(
      <Panel data-testid="e" variant="elevated" padding="lg">
        x
      </Panel>,
    );
    expect(screen.getByTestId("e").className).toContain("shadow-md");
    expect(screen.getByTestId("e").className).toContain("p-6");
  });

  test("interactive adds the shared hover affordance and `as` swaps the element", () => {
    render(
      <Panel as="button" type="button" interactive data-testid="p">
        x
      </Panel>,
    );
    const el = screen.getByTestId("p");
    expect(el.tagName).toBe("BUTTON");
    expect(el.className).toContain("hover:border-border-focus");
    expect(el.className).toContain("cursor-pointer");
  });
});

describe("Pill", () => {
  test("is rounded-full with a tone and a size", () => {
    render(<Pill tone="danger" size="xs" data-testid="p">3</Pill>);
    const el = screen.getByTestId("p");
    expect(el.tagName).toBe("SPAN");
    expect(el.className).toContain("rounded-full");
    expect(el.className).toContain("bg-error-bg");
    expect(el.className).toContain("h-[18px]");
  });

  test("renders a leading icon slot", () => {
    render(<Pill icon={<i data-testid="i" />}>x</Pill>);
    expect(screen.getByTestId("i")).toBeTruthy();
  });
});

describe("SectionHeader", () => {
  test("renders an uppercase heading with count pill and an action slot", () => {
    render(
      <SectionHeader
        title="Needs your attention"
        count={4}
        action={<a href="/all">All</a>}
        icon={<i data-testid="icon" />}
      />,
    );
    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading.className).toContain("uppercase");
    expect(heading.textContent).toContain("Needs your attention");
    expect(heading.textContent).toContain("4");
    expect(screen.getByTestId("icon")).toBeTruthy();
    expect(screen.getByRole("link", { name: "All" })).toBeTruthy();
  });

  test("`as` picks the heading level and omits the pill without a count", () => {
    render(<SectionHeader title="Linked" as="h2" />);
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.querySelector("span.rounded-full")).toBeNull();
  });
});

describe("Toolbar", () => {
  test("exposes toolbar and group roles, a spacer, and the optional hairline", () => {
    render(
      <Toolbar aria-label="Projects" bordered>
        <Toolbar.Group>a</Toolbar.Group>
        <Toolbar.Spacer data-testid="s" />
        <Toolbar.Group>b</Toolbar.Group>
      </Toolbar>,
    );
    const bar = screen.getByRole("toolbar", { name: "Projects" });
    expect(bar.className).toContain("border-b");
    expect(screen.getAllByRole("group")).toHaveLength(2);
    expect(screen.getByTestId("s").className).toContain("flex-1");
  });
});
