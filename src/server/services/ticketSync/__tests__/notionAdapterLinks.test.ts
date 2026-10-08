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

  it("returns no links when the page can't be read, so the row imports as before", async () => {
    const adapter = adapterFor(new Error("403"));
    await expect(adapter.getPageLinks("page-1")).resolves.toEqual([]);
  });
});
