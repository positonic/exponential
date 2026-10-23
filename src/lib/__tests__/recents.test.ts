import { describe, expect, it } from "vitest";
import { matchRecentRoute, pushRecent, RECENTS_LIMIT, type RecentEntry } from "../recents";

describe("matchRecentRoute", () => {
  it("recognises entity detail pages and canonicalises their href", () => {
    expect(matchRecentRoute("/w/acme/projects/launch-abc", "acme")).toEqual({
      kind: "project",
      href: "/w/acme/projects/launch-abc",
    });
    expect(matchRecentRoute("/w/acme/goals/42", "acme")).toEqual({ kind: "goal", href: "/w/acme/goals/42" });
    // Tabs under the entity dedupe to the entity.
    expect(matchRecentRoute("/w/acme/products/zed/backlog", "acme")).toEqual({
      kind: "product",
      href: "/w/acme/products/zed",
    });
    expect(matchRecentRoute("/w/acme/pages/p1", "acme")?.kind).toBe("page");
    expect(matchRecentRoute("/w/acme/decisions/adr-1", "acme")?.kind).toBe("decision");
  });

  it("ignores list pages, other workspaces and non-entity sub-routes", () => {
    expect(matchRecentRoute("/w/acme/projects", "acme")).toBeNull();
    expect(matchRecentRoute("/w/other/projects/x", "acme")).toBeNull();
    expect(matchRecentRoute("/w/acme/products/new", "acme")).toBeNull();
    expect(matchRecentRoute("/w/acme/decisions/graph", "acme")).toBeNull();
    expect(matchRecentRoute("/w/acme/crm/contacts", "acme")).toBeNull();
    expect(matchRecentRoute("/today", "acme")).toBeNull();
  });

  it("records a meeting only at the occurrence, not the series", () => {
    expect(matchRecentRoute("/w/acme/ceremonies/c1", "acme")).toBeNull();
    expect(matchRecentRoute("/w/acme/ceremonies/c1/o1", "acme")).toEqual({
      kind: "meeting",
      href: "/w/acme/ceremonies/c1/o1",
    });
  });
});

describe("pushRecent", () => {
  const entry = (href: string, at = 0): RecentEntry => ({ href, title: href, kind: "project", at });

  it("puts the newest first and dedupes a revisit", () => {
    const list = pushRecent([entry("/a", 1), entry("/b", 2)], entry("/a", 3));
    expect(list.map((e) => e.href)).toEqual(["/a", "/b"]);
    expect(list[0]?.at).toBe(3);
  });

  it("keeps only the most recent few", () => {
    let list: RecentEntry[] = [];
    for (let i = 0; i < RECENTS_LIMIT + 3; i++) list = pushRecent(list, entry(`/${i}`, i));
    expect(list).toHaveLength(RECENTS_LIMIT);
    expect(list[0]?.href).toBe(`/${RECENTS_LIMIT + 2}`);
  });
});
