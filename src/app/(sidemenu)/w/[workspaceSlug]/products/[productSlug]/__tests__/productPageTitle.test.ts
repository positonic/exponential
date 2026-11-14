import { describe, expect, test } from "vitest";
import { buildProductPageTitle } from "../productPageTitle";

const common = {
  workspaceSlug: "clear",
  productSlug: "clear",
  productName: "CLEAR",
};
const at = (rest: string) => `/w/clear/products/clear${rest}`;

describe("buildProductPageTitle", () => {
  test("overview is the bare product name", () => {
    expect(buildProductPageTitle({ ...common, pathname: at("") })).toBe("CLEAR");
    expect(buildProductPageTitle({ ...common, pathname: at("/") })).toBe("CLEAR");
  });

  test.each([
    ["/tickets", "Backlog"],
    ["/features", "Features"],
    ["/graph", "Graph"],
    ["/cycles", "Cycles"],
    ["/insights", "Insights"],
    ["/decisions", "Decisions"],
    ["/retrospectives", "Retros"],
    ["/epics", "Epics"],
    ["/problems", "Problems"],
    ["/research", "Research"],
    ["/settings", "Settings"],
  ])("listing %s leads with its section", (rest, label) => {
    expect(buildProductPageTitle({ ...common, pathname: at(rest) })).toBe(`${label} · CLEAR`);
  });

  test("a detail route leads with the entity's name", () => {
    expect(
      buildProductPageTitle({
        ...common,
        pathname: at("/tickets/42"),
        detailLabel: "Fix the login loop",
      }),
    ).toBe("Fix the login loop · CLEAR");
    expect(
      buildProductPageTitle({
        ...common,
        pathname: at("/features/abc/scopes/xyz"),
        detailLabel: "Pages home V1",
      }),
    ).toBe("Pages home V1 · CLEAR");
  });

  test("a detail route still loading shows its section", () => {
    expect(buildProductPageTitle({ ...common, pathname: at("/tickets/42") })).toBe("Backlog · CLEAR");
    expect(
      buildProductPageTitle({ ...common, pathname: at("/cycles/xyz"), detailLabel: "  " }),
    ).toBe("Cycles · CLEAR");
  });

  test.each([
    ["/tickets/new", "New ticket"],
    ["/cycles/new", "New cycle"],
    ["/retrospectives/new", "New retro"],
    ["/research/new", "New research"],
    ["/decisions/graph", "Decision graph"],
  ])("fixed sub-route %s is never mistaken for an entity", (rest, label) => {
    // A stale label from the detail page the user just left must not win.
    expect(
      buildProductPageTitle({ ...common, pathname: at(rest), detailLabel: "Stale ticket" }),
    ).toBe(`${label} · CLEAR`);
  });

  test("before the product loads, the section stands alone", () => {
    expect(
      buildProductPageTitle({ ...common, productName: undefined, pathname: at("/tickets") }),
    ).toBe("Backlog");
    expect(buildProductPageTitle({ ...common, productName: null, pathname: at("") })).toBeNull();
  });

  test("an unknown segment falls back to the product name", () => {
    expect(buildProductPageTitle({ ...common, pathname: at("/somewhere-new") })).toBe("CLEAR");
  });
});
