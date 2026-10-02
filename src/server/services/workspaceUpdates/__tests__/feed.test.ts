import { describe, expect, it } from "vitest";

import { buildUpdatesFeed, xmlEscape } from "../feed";

const workspace = { id: "ws-1", name: "Acme & Co", slug: "acme", timezone: "UTC", acceptsSignups: false };

describe("buildUpdatesFeed", () => {
  it("lists each update with escaped text, a permalink and the full HTML", () => {
    const xml = buildUpdatesFeed({
      workspace,
      updates: [
        {
          id: "u1",
          kind: "weekly",
          title: 'Bulk edit "lands" ]]> <script>',
          body: "_Edit many tickets_ at [once](https://app/x).",
          windowStart: new Date("2026-09-25T00:00:00Z"),
          windowEnd: new Date("2026-10-02T00:00:00Z"),
          publishedAt: new Date("2026-10-02T10:00:00Z"),
        },
      ],
      baseUrl: "https://app.test",
      renderHtml: (md) => `<p>${md}</p>`,
      now: new Date("2026-10-02T12:00:00Z"),
    });

    expect(xml).toContain("<title>Acme &amp; Co updates</title>");
    expect(xml).toContain("<title>Bulk edit &quot;lands&quot; ]]&gt; &lt;script&gt;</title>");
    expect(xml).not.toContain("<script>");
    expect(xml).toContain('<guid isPermaLink="true">https://app.test/updates/acme/u1</guid>');
    expect(xml).toContain("<pubDate>Fri, 02 Oct 2026 10:00:00 GMT</pubDate>");
    expect(xml).toContain("<description>Edit many tickets at once.</description>");
    expect(xml).toContain("<content:encoded>&lt;p&gt;");
    expect(xml).toContain('href="https://app.test/updates/acme/feed.xml"');
  });

  it("escapes all five XML specials", () => {
    expect(xmlEscape(`<a href="x">&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;");
  });
});
