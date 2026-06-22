import { describe, expect, test } from "vitest";
import { buildProductFavoriteTarget } from "../favoriteTarget";

const common = {
  workspaceSlug: "clear",
  productSlug: "acme",
  productName: "Acme",
};

describe("buildProductFavoriteTarget", () => {
  test("overview uses the bare product name and the product icon", () => {
    expect(
      buildProductFavoriteTarget({ ...common, pathname: "/w/clear/products/acme" }),
    ).toEqual({ entityId: "products/acme", label: "Acme", icon: "product" });
  });

  test.each([
    ["problems", "Problems", "problems"],
    ["tickets", "Backlog", "backlog"],
    ["features", "Features", "features"],
    ["graph", "Graph", "graph"],
    ["cycles", "Cycles", "cycles"],
    ["research", "Insights", "research"],
    ["retrospectives", "Retro", "retro"],
    ["settings", "Settings", "settings"],
  ])("sub-page /%s gets a tab label + icon", (segment, label, icon) => {
    expect(
      buildProductFavoriteTarget({
        ...common,
        pathname: `/w/clear/products/acme/${segment}`,
      }),
    ).toEqual({
      entityId: `products/acme/${segment}`,
      label: `Acme · ${label}`,
      icon,
    });
  });

  test("nested detail route resolves to its parent tab label, keeping the full path", () => {
    expect(
      buildProductFavoriteTarget({
        ...common,
        pathname: "/w/clear/products/acme/tickets/abc123",
      }),
    ).toEqual({
      entityId: "products/acme/tickets/abc123",
      label: "Acme · Backlog",
      icon: "backlog",
    });
  });

  test("strips the workspace prefix to a workspace-relative entityId", () => {
    const { entityId } = buildProductFavoriteTarget({
      ...common,
      pathname: "/w/clear/products/acme/features",
    });
    expect(entityId).toBe("products/acme/features");
  });
});
