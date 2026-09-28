import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { buildDocsNavigation, buildDocsSearchIndex, listDocPages } from "../content";
import { getBreadcrumbs, getPrevNextPages } from "../navigation";

let dir: string;

function write(rel: string, body: string) {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
}

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "docs-"));
  write(
    "_meta.json",
    JSON.stringify({ sections: [{ id: "get-started", title: "Get started" }, { id: "features", title: "Features" }] }),
  );
  write("index.md", "---\ntitle: Introduction\ndescription: Hello\norder: 1\n---\n\nWelcome to the docs.\n\n## First heading\n");
  write("getting-started/index.md", "---\ntitle: Quickstart\nsection: get-started\norder: 2\nicon: IconBolt\n---\n\nGo.\n");
  write("features/zeta.md", "---\ntitle: Zeta\n---\n\nUnordered, sorts last alphabetically.\n");
  write("features/alpha.md", "---\ntitle: Alpha\n---\n\nUnordered too.\n");
  write("features/crm.md", "---\ntitle: CRM (Contacts)\nsidebarTitle: CRM\norder: 1\n---\n\n## Contacts\n\nBody.\n");
  write("features/crm-lists.md", "---\ntitle: Lists\nparent: /docs/features/crm\n---\n\nChild page.\n");
  write("features/secret.md", "---\ntitle: Hidden\nhidden: true\n---\n\nNot in the sidebar.\n");
  write("_drafts/wip.md", "---\ntitle: Draft\n---\n\nIgnored folder.\n");
  write("archive/old.md", "---\ntitle: Old page\n---\n\nSection not declared in _meta.json.\n");
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("listDocPages", () => {
  it("maps files to hrefs and skips underscore-prefixed entries", () => {
    const pages = listDocPages(dir);
    const hrefs = pages.map((p) => p.href).sort();
    expect(hrefs).toEqual([
      "/docs",
      "/docs/archive/old",
      "/docs/features/alpha",
      "/docs/features/crm",
      "/docs/features/crm-lists",
      "/docs/features/secret",
      "/docs/features/zeta",
      "/docs/getting-started",
    ]);
  });
});

describe("buildDocsNavigation", () => {
  it("derives sections, order, nesting and hidden pages from frontmatter", () => {
    const nav = buildDocsNavigation(listDocPages(dir), dir);
    expect(nav.map((s) => s.title)).toEqual(["Get started", "Features", "Archive"]);

    const [getStarted, features, archive] = nav;
    expect(getStarted!.items.map((i) => i.title)).toEqual(["Introduction", "Quickstart"]);
    expect(getStarted!.items[1]!.icon).toBe("IconBolt");

    expect(features!.items.map((i) => i.title)).toEqual(["CRM", "Alpha", "Zeta"]);
    expect(features!.items[0]!.children?.map((c) => c.href)).toEqual(["/docs/features/crm-lists"]);
    expect(features!.items.some((i) => i.title === "Hidden")).toBe(false);

    expect(archive!.items.map((i) => i.href)).toEqual(["/docs/archive/old"]);
  });

  it("feeds breadcrumbs and prev/next", () => {
    const nav = buildDocsNavigation(listDocPages(dir), dir);
    expect(getBreadcrumbs(nav, "/docs/features/crm-lists").map((c) => c.title)).toEqual(["Docs", "Features", "CRM"]);
    const { prev, next } = getPrevNextPages(nav, "/docs/features/crm");
    expect(prev?.href).toBe("/docs/getting-started");
    expect(next?.href).toBe("/docs/features/crm-lists");
  });
});

describe("buildDocsSearchIndex", () => {
  it("indexes title, section, headings and first paragraph, skipping hidden pages", () => {
    const pages = listDocPages(dir);
    const index = buildDocsSearchIndex(pages, buildDocsNavigation(pages, dir));
    const intro = index.find((e) => e.href === "/docs");
    expect(intro).toMatchObject({
      title: "Introduction",
      description: "Hello",
      section: "Get started",
      headings: ["First heading"],
      excerpt: "Welcome to the docs.",
    });
    expect(index.some((e) => e.href === "/docs/features/secret")).toBe(false);
  });
});
