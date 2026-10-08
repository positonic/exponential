/**
 * NotionTicketSyncAdapter.getPageLinks — the URLs inbound adoption matches on
 * (EXPONENTIAL-671), read from real Notion API payload shapes.
 */

import { describe, expect, it, vi } from "vitest";
import type { NotionService } from "../../NotionService";
import { NotionTicketSyncAdapter } from "../notionAdapter";

function linkedText(text: string, href: string | null) {
  return { type: "text", plain_text: text, href, text: { content: text, link: href ? { url: href } : null } };
}

function adapterFor(result: { page: unknown; blocks: unknown[] } | Error) {
  const notion = {
    getPageWithBlocks: vi.fn(() =>
      result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
    ),
  } as unknown as NotionService;
  return new NotionTicketSyncAdapter(notion, {} as never, null);
}

describe("NotionTicketSyncAdapter.getPageLinks", () => {
  it("collects url properties, linked property text, and body links", async () => {
    const adapter = adapterFor({
      page: {
        properties: {
          Name: { type: "title", title: [linkedText("Website: visual design", null)] },
          "Exponential URL": { type: "url", url: "https://app/w/ws/products/clear/tickets/1" },
          Source: {
            type: "rich_text",
            rich_text: [linkedText("Exponential ", null), linkedText("CLEAR-2", "https://app/t/2")],
          },
          Priority: { type: "select", select: { name: "2 - Medium" } },
        },
      },
      blocks: [
        { type: "heading_2", heading_2: { rich_text: [linkedText("Parent", null)] } },
        {
          type: "paragraph",
          paragraph: {
            rich_text: [linkedText("Open in Exponential", "https://app/t/3"), linkedText(" — CLEAR-612", null)],
          },
        },
        { type: "bookmark", bookmark: { url: "https://app/t/4", caption: [] } },
        { type: "link_preview", link_preview: { url: "https://app/t/5" } },
        { type: "divider", divider: {} },
      ],
    });

    await expect(adapter.getPageLinks("page-1")).resolves.toEqual([
      "https://app/w/ws/products/clear/tickets/1",
      "https://app/t/2",
      "https://app/t/3",
      "https://app/t/4",
      "https://app/t/5",
    ]);
  });

  it("reading links then the body of the same page fetches it once", async () => {
    const notion = {
      getPageWithBlocks: vi.fn(() => Promise.resolve({ page: { properties: {} }, blocks: [] })),
    };
    const adapter = new NotionTicketSyncAdapter(notion as unknown as NotionService, {} as never, null);

    await adapter.getPageLinks("page-1");
    await adapter.getPageBody("page-1");
    await adapter.getPageLinks("page-2");

    expect(notion.getPageWithBlocks.mock.calls).toEqual([["page-1"], ["page-2"]]);
  });

  it("finds links nested in toggles and columns, but not in sub-pages", async () => {
    const children: Record<string, unknown[]> = {
      toggle: [
        { id: "inner", type: "paragraph", has_children: false,
          paragraph: { rich_text: [linkedText("Open in Exponential", "https://app/t/nested")] } },
      ],
      cols: [{ id: "col", type: "column", has_children: true, column: {} }],
      col: [{ id: "bm", type: "bookmark", has_children: false, bookmark: { url: "https://app/t/in-column" } }],
    };
    const notion = {
      getPageWithBlocks: vi.fn(() =>
        Promise.resolve({
          page: { properties: {} },
          blocks: [
            { id: "toggle", type: "toggle", has_children: true, toggle: { rich_text: [linkedText("Details", null)] } },
            { id: "cols", type: "column_list", has_children: true, column_list: {} },
            { id: "sub", type: "child_page", has_children: true, child_page: { title: "Notes" } },
          ],
        }),
      ),
      listBlockChildren: vi.fn((id: string) => Promise.resolve(children[id] ?? [])),
    };
    const adapter = new NotionTicketSyncAdapter(notion as unknown as NotionService, {} as never, null);

    await expect(adapter.getPageLinks("page-1")).resolves.toEqual([
      "https://app/t/nested",
      "https://app/t/in-column",
    ]);
    expect(notion.listBlockChildren).not.toHaveBeenCalledWith("sub");
  });

  it("returns no links when the body is too nested to scan completely", async () => {
    // A ticket link at the top, then a chain of toggles deeper than the scan
    // follows: a second link could be hiding, so adoption must not happen.
    const toggle = (id: string) => ({ id, type: "toggle", has_children: true, toggle: { rich_text: [] } });
    const notion = {
      getPageWithBlocks: vi.fn(() =>
        Promise.resolve({
          page: { properties: {} },
          blocks: [
            { id: "p", type: "paragraph", has_children: false,
              paragraph: { rich_text: [linkedText("ticket", "https://app/t/1")] } },
            toggle("d0"),
          ],
        }),
      ),
      listBlockChildren: vi.fn((id: string) => Promise.resolve([toggle(`${id}+`)])),
    };
    const adapter = new NotionTicketSyncAdapter(notion as unknown as NotionService, {} as never, null);

    await expect(adapter.getPageLinks("page-1")).resolves.toEqual([]);
  });

  it("returns no links when the page can't be read, so the row imports as before", async () => {
    const adapter = adapterFor(new Error("403"));
    await expect(adapter.getPageLinks("page-1")).resolves.toEqual([]);
  });
});
