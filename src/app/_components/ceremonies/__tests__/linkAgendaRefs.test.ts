import { describe, expect, it } from "vitest";
import { linkAgendaRefs } from "../linkAgendaRefs";

const ctx = { workspaceSlug: "clear", productSlug: "clear-app" };

describe("linkAgendaRefs", () => {
  it("links D-numbers to the decision page and ticket numbers to the product's ticket", () => {
    expect(linkAgendaRefs("James: signal-to-event grouping (#1339), see D-0150", ctx)).toBe(
      "James: signal-to-event grouping ([#1339](/w/clear/products/clear-app/tickets/1339)), see [D-0150](/w/clear/decisions/d/D-0150)",
    );
  });

  it("leaves ticket numbers as text when the ceremony has no product", () => {
    expect(linkAgendaRefs("Fix #1339 per D-0152", { workspaceSlug: "clear" })).toBe(
      "Fix #1339 per [D-0152](/w/clear/decisions/d/D-0152)",
    );
  });

  it("never rewrites existing links, URLs, inline code or entities", () => {
    const md = "[D-0150](/x) and https://example.com/page#12 and `#7` and &#38; and abcD-0150";
    expect(linkAgendaRefs(md, ctx)).toBe(md);
  });

  it("leaves references inside fenced code blocks as written", () => {
    const md = "Before D-0150\n```\nD-0151 and #12\n```\n~~~\n#13\n~~~\nafter #14";
    expect(linkAgendaRefs(md, ctx)).toBe(
      "Before [D-0150](/w/clear/decisions/d/D-0150)\n```\nD-0151 and #12\n```\n~~~\n#13\n~~~\nafter [#14](/w/clear/products/clear-app/tickets/14)",
    );
  });

  it("ignores short D- forms and a heading marker", () => {
    expect(linkAgendaRefs("D-12 stays; # 5 stays", ctx)).toBe("D-12 stays; # 5 stays");
  });
});
