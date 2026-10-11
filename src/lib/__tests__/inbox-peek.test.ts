import { describe, expect, it } from "vitest";
import { parseInboxPeekHref } from "../inbox-peek";

describe("parseInboxPeekHref", () => {
  it("reads an action href", () => {
    expect(parseInboxPeekHref("/w/acme/actions/a1")).toEqual({
      kind: "action",
      workspaceSlug: "acme",
      id: "a1",
    });
  });

  it("reads a ticket href by its url ref", () => {
    expect(parseInboxPeekHref("/w/acme/products/app/tickets/APP-12")).toEqual({
      kind: "ticket",
      workspaceSlug: "acme",
      productSlug: "app",
      ref: "APP-12",
    });
  });

  it("reads a decision href", () => {
    expect(parseInboxPeekHref("/w/acme/decisions/d/d1")).toEqual({
      kind: "decision",
      workspaceSlug: "acme",
      id: "d1",
    });
  });

  it("reads a meeting href, ignoring a query or hash", () => {
    expect(parseInboxPeekHref("/recording/m1?tab=outputs")).toEqual({ kind: "meeting", id: "m1" });
    expect(parseInboxPeekHref("/recording/m1#summary")).toEqual({ kind: "meeting", id: "m1" });
  });

  it("leaves every other route to open as a page", () => {
    for (const href of [
      null,
      "",
      "/today",
      "/inbox?tab=delegated",
      "/w/acme/settings",
      "/w/acme/pages/page-1",
      "/w/acme/decisions/adr-1",
      "/w/acme/actions/a1/edit",
      "/w/acme/ceremonies/cer-1/occ-1",
      "https://evil.example/w/acme/actions/a1",
      "//evil.example/recording/m1",
    ]) {
      expect(parseInboxPeekHref(href)).toBeNull();
    }
  });
});
