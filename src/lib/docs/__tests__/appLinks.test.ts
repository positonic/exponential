import { describe, it, expect } from "vitest";
import { listDocPages } from "../content";
import { ALL_APP_DOC_TARGETS, docsHrefForPath } from "../appLinks";

describe("docsHrefForPath", () => {
  it("maps global routes", () => {
    expect(docsHrefForPath("/today")).toBe("/docs/do/inbox-and-today");
    expect(docsHrefForPath("/time")).toBe("/docs/do/time-tracking");
    expect(docsHrefForPath("/settings/api-keys")).toBe("/docs/developers/api-tokens");
    expect(docsHrefForPath("/settings")).toBe("/docs/reference/your-settings");
  });

  it("maps workspace routes, longest prefix first", () => {
    expect(docsHrefForPath("/w/acme/goals")).toBe("/docs/plan/goals");
    expect(docsHrefForPath("/w/acme/crm/pipeline/settings")).toBe("/docs/crm/pipeline-forms-broadcasts");
    expect(docsHrefForPath("/w/acme/crm/contacts/123")).toBe("/docs/crm/contacts");
    expect(docsHrefForPath("/w/acme/products/fixture/tickets/5")).toBe("/docs/build/products");
  });

  it("uses workspace settings, not account settings, under /w/<slug>", () => {
    expect(docsHrefForPath("/w/acme/settings")).toBe("/docs/reference/workspace-settings");
    expect(docsHrefForPath("/w/acme/settings/plugins")).toBe("/docs/reference/plugins");
  });

  it("treats the bare workspace root as home", () => {
    expect(docsHrefForPath("/w/acme")).toBe("/docs/quickstart");
  });

  it("returns null for screens without a page", () => {
    expect(docsHrefForPath("/w/acme/voice-debug")).toBeNull();
    expect(docsHrefForPath("/docs/concepts")).toBeNull();
  });

  it("only points at docs pages that exist", () => {
    const hrefs = new Set(listDocPages().map((p) => p.href));
    const missing = ALL_APP_DOC_TARGETS.filter((t) => !hrefs.has(t));
    expect(missing).toEqual([]);
  });
});
