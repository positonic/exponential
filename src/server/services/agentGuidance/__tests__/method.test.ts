/**
 * The method capability and its publication gate, against a temp-dir
 * `content/docs` fixture (as in src/lib/docs/__tests__/content.test.ts).
 *
 * While `_release.json` says `draft`, the method must be absent from every
 * public docs surface yet still reachable through `getMethod({ includeDraft })`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { buildDocsNavigation, listDocPages } from "~/lib/docs/content";
import { getAllDocSlugs, getDocContent } from "~/lib/docs/getDoc";
import { buildLlmsFull } from "~/lib/docs/llmsText";
import { computeMethodHash, isMethodPath, isMethodPublished } from "~/lib/docs/method";
import { getMethod } from "../method";

// `getDoc.ts` memoises with React's server-only `cache`, absent from the
// client React build tests load; an identity stand-in is enough here.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T,>(fn: T) => fn,
}));

let dir: string;

function write(rel: string, body: string) {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
}

function writeRelease(status: "draft" | "published") {
  write(
    "method/_release.json",
    JSON.stringify({
      version: "0.1.0",
      status,
      publishedAt: status === "published" ? "2026-10-11T00:00:00.000Z" : null,
      contentHash: null,
      history: [],
    }),
  );
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "method-"));
  write("_meta.json", JSON.stringify({ sections: [{ id: "get-started", title: "Get started" }] }));
  write("index.md", "---\ntitle: Introduction\ndescription: Hello\n---\n\nWelcome.\n");
  write(
    "method/index.md",
    "---\ntitle: The Exponential Method\ndescription: Keep the state\nupdated: 2026-10-11\n---\n\nMaintain an explicit operating record.\n",
  );
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const PRODUCT = { productName: "Exponential", baseUrl: "https://example.test" };

describe("isMethodPath", () => {
  it("matches the method folder and nothing else", () => {
    expect(isMethodPath("method")).toBe(true);
    expect(isMethodPath("method/glossary")).toBe(true);
    expect(isMethodPath("/method/agent-principles.md")).toBe(true);
    expect(isMethodPath("method\\glossary.md")).toBe(true);
    expect(isMethodPath("methodology")).toBe(false);
    expect(isMethodPath("developers/method")).toBe(false);
    expect(isMethodPath("")).toBe(false);
  });
});

describe("while the method is a draft", () => {
  beforeEach(() => writeRelease("draft"));

  it("is not published", () => {
    expect(isMethodPublished(dir)).toBe(false);
  });

  it("is absent from the page list, sidebar, llms-full and static slugs", async () => {
    const pages = listDocPages(dir);
    expect(pages.map((p) => p.href)).toEqual(["/docs"]);
    const nav = buildDocsNavigation(pages, dir);
    expect(JSON.stringify(nav)).not.toContain("/docs/method");
    expect(buildLlmsFull({ ...PRODUCT, pages, nav })).not.toContain("operating record");
    expect(await getAllDocSlugs(dir)).toEqual([]);
  });

  it("does not render at /docs/method", async () => {
    expect(await getDocContent(["method"], dir)).toBeNull();
  });

  it("stays visible to the docs tooling", () => {
    const pages = listDocPages(dir, { includeUnpublishedMethod: true });
    expect(pages.map((p) => p.href).sort()).toEqual(["/docs", "/docs/method"]);
  });

  it("is served by getMethod only with includeDraft", () => {
    expect(getMethod({ includeDraft: false, docsDir: dir })).toBeNull();

    const method = getMethod({ includeDraft: true, docsDir: dir });
    expect(method).toMatchObject({
      version: "0.1.0",
      status: "draft",
      publishedAt: null,
      canonicalSource: { repo: "positonic/exponential", path: "content/docs/method", url: null },
    });
    expect(method!.documents).toEqual([
      {
        id: "method",
        title: "The Exponential Method",
        href: "/docs/method",
        markdown: "\nMaintain an explicit operating record.\n",
      },
    ]);
    expect(method!.contentHash).toBe(computeMethodHash(method!.documents));
    expect(method!.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

describe("once the method is published", () => {
  beforeEach(() => writeRelease("published"));

  it("appears on /docs and is served to anyone", async () => {
    expect(listDocPages(dir).map((p) => p.href).sort()).toEqual(["/docs", "/docs/method"]);
    expect(await getDocContent(["method"], dir)).not.toBeNull();
    expect(getMethod({ includeDraft: false, docsDir: dir })).toMatchObject({
      status: "published",
      publishedAt: "2026-10-11T00:00:00.000Z",
      canonicalSource: { url: "/docs/method" },
    });
  });
});

describe("without a release manifest", () => {
  it("serves nothing and keeps the folder dark", async () => {
    expect(getMethod({ includeDraft: true, docsDir: dir })).toBeNull();
    expect(await getDocContent(["method"], dir)).toBeNull();
  });
});
