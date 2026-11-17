import { describe, it, expect } from "vitest";
import { isForeignTicket, linkedTicketHref } from "../linkedTicketHref";

const basePath = "/w/exponential/products/exponential/tickets";
const plugin = { id: "prod-plugin", name: "Exponential Plugin", slug: "exponential-plugin" };

describe("linkedTicketHref", () => {
  it("links a same-product ticket under the current product", () => {
    expect(
      linkedTicketHref(basePath, "prod-app", {
        id: "t1",
        product: { id: "prod-app", name: "Exponential", slug: "exponential" },
      }),
    ).toBe(`${basePath}/t1`);
  });

  it("links a ticket without product metadata under the current product", () => {
    expect(linkedTicketHref(basePath, "prod-app", { id: "t1" })).toBe(`${basePath}/t1`);
  });

  it("links a sibling-product ticket through its own product", () => {
    expect(linkedTicketHref(basePath, "prod-app", { id: "t2", product: plugin })).toBe(
      "/w/exponential/products/exponential-plugin/tickets/t2",
    );
  });
});

describe("isForeignTicket", () => {
  it("is true only for a ticket whose product differs from the current one", () => {
    expect(isForeignTicket("prod-app", { product: plugin })).toBe(true);
    expect(isForeignTicket("prod-plugin", { product: plugin })).toBe(false);
    expect(isForeignTicket("prod-app", {})).toBe(false);
  });
});
