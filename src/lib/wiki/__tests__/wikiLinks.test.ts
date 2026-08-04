import { describe, it, expect } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import type { Root } from "mdast";

import {
  applyWikiLinks,
  collectWikiLinks,
  pageFolder,
  pageTitle,
  pathToTarget,
  segmentsToPath,
  targetToPath,
  wikiHref,
  WIKI_LINK_CLASS,
  WIKI_LINK_MISSING_CLASS,
} from "../wikiLinks";

interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
  data?: { hProperties?: Record<string, unknown> };
}

const parse = (md: string) =>
  unified().use(remarkParse).parse(md) as unknown as MdNode;

/** Every link node in the tree, depth-first. */
function links(tree: MdNode): MdNode[] {
  const out: MdNode[] = [];
  const walk = (node: MdNode) => {
    if (node.type === "link") out.push(node);
    node.children?.forEach(walk);
  };
  walk(tree);
  return out;
}

/** The tree's text content, so we can assert nothing was lost. */
function text(tree: MdNode): string {
  if (typeof tree.value === "string" && !tree.children) return tree.value;
  return (tree.children ?? []).map(text).join("");
}

const KNOWN = new Set(["index.md", "schema.md", "people/ada.md"]);

describe("wiki paths", () => {
  it("maps a target to a path and back", () => {
    expect(targetToPath("people/ada")).toBe("people/ada.md");
    expect(pathToTarget("people/ada.md")).toBe("people/ada");
  });

  it("is idempotent in both directions", () => {
    expect(targetToPath("people/ada.md")).toBe("people/ada.md");
    expect(pathToTarget("people/ada")).toBe("people/ada");
  });

  it("builds a URL under /wiki, encoding each segment", () => {
    expect(wikiHref("people/ada.md")).toBe("/wiki/people/ada");
    expect(wikiHref("notes/a b")).toBe("/wiki/notes/a%20b");
  });

  it("rejoins catch-all route segments into a path", () => {
    expect(segmentsToPath(["people", "ada"])).toBe("people/ada.md");
    expect(segmentsToPath([])).toBeNull();
    expect(segmentsToPath(undefined)).toBeNull();
  });

  it("titles a page by its first heading, else its filename", () => {
    expect(pageTitle("people/ada.md", "# Ada Lovelace\n\nnotes")).toBe("Ada Lovelace");
    expect(pageTitle("people/ada-lovelace.md")).toBe("ada lovelace");
    // A heading further down is not the title.
    expect(pageTitle("notes.md", "intro\n\n# Later heading")).toBe("Later heading");
  });

  it("does not take a title from inside a fenced code block", () => {
    const md = "```bash\n# install the thing\nbrew install thing\n```\n\n# Real Title\n";
    expect(pageTitle("tools/thing.md", md)).toBe("Real Title");
    // With no heading outside the fence, fall back to the filename.
    expect(pageTitle("tools/thing.md", "```bash\n# install\n```\n")).toBe("thing");
  });

  it("reports the folder a page sits in", () => {
    expect(pageFolder("people/ada.md")).toBe("people");
    expect(pageFolder("index.md")).toBeNull();
  });
});

describe("applyWikiLinks", () => {
  it("turns a wikilink into a link to the page", () => {
    const tree = parse("See [[people/ada]] for more.");
    applyWikiLinks(tree, KNOWN);

    const [link] = links(tree);
    expect(link?.url).toBe("/wiki/people/ada");
    expect(text(tree)).toBe("See people/ada for more.");
  });

  it("marks a link whose page does not exist yet", () => {
    const tree = parse("See [[people/hopper]].");
    applyWikiLinks(tree, KNOWN);

    const className = links(tree)[0]?.data?.hProperties?.className;
    expect(className).toEqual([WIKI_LINK_CLASS, WIKI_LINK_MISSING_CLASS]);
  });

  it("does not mark a link whose page exists", () => {
    const tree = parse("See [[schema]].");
    applyWikiLinks(tree, KNOWN);

    expect(links(tree)[0]?.data?.hProperties?.className).toEqual([WIKI_LINK_CLASS]);
  });

  it("handles several links in one paragraph, keeping the text between them", () => {
    const tree = parse("Seeded [[index]] and [[schema]].");
    applyWikiLinks(tree, KNOWN);

    expect(links(tree).map((l) => l.url)).toEqual(["/wiki/index", "/wiki/schema"]);
    expect(text(tree)).toBe("Seeded index and schema.");
  });

  it("leaves code spans alone — schema.md documents the syntax in one", () => {
    const tree = parse("Pages refer to each other with `[[wikilinks]]`.");
    applyWikiLinks(tree, KNOWN);

    expect(links(tree)).toHaveLength(0);
    expect(text(tree)).toContain("[[wikilinks]]");
  });

  it("leaves fenced code blocks alone", () => {
    const tree = parse("```\nsee [[index]]\n```");
    applyWikiLinks(tree, KNOWN);

    expect(links(tree)).toHaveLength(0);
  });

  it("does not nest a link inside an existing link", () => {
    const tree = parse("[a [[index]] b](https://example.com)");
    applyWikiLinks(tree, KNOWN);

    expect(links(tree).map((l) => l.url)).toEqual(["https://example.com"]);
  });

  it("finds links inside list items and headings", () => {
    const tree = parse("## About [[index]]\n\n- see [[schema]]\n");
    applyWikiLinks(tree, KNOWN);

    expect(links(tree).map((l) => l.url)).toEqual(["/wiki/index", "/wiki/schema"]);
  });

  it("ignores an empty link and leaves the text intact", () => {
    const tree = parse("nothing [[]] here");
    applyWikiLinks(tree, KNOWN);

    expect(links(tree)).toHaveLength(0);
    expect(text(tree)).toBe("nothing [[]] here");
  });

  it("does not treat a bracket pair spanning a line break as a link", () => {
    const tree = parse("open [[\nclosed]]");
    applyWikiLinks(tree, KNOWN);

    expect(links(tree)).toHaveLength(0);
  });

  it("tolerates whitespace and a leading ./ in the target", () => {
    const tree = parse("see [[ ./people/ada ]]");
    applyWikiLinks(tree, KNOWN);

    expect(links(tree)[0]?.url).toBe("/wiki/people/ada");
  });

  it("resolves a target written with its .md extension", () => {
    const tree = parse("see [[people/ada.md]]");
    applyWikiLinks(tree, KNOWN);

    const [link] = links(tree);
    expect(link?.url).toBe("/wiki/people/ada");
    expect(link?.data?.hProperties?.className).toEqual([WIKI_LINK_CLASS]);
  });
});

describe("collectWikiLinks", () => {
  it("lists every target once, in first-seen order", () => {
    expect(collectWikiLinks("[[b]] then [[a]] then [[b]]")).toEqual(["b", "a"]);
  });

  it("returns nothing for a document with no links", () => {
    expect(collectWikiLinks("plain prose")).toEqual([]);
  });
});
