import { describe, it, expect } from "vitest";

import {
  buildContactTemplateData,
  renderInline,
  renderTextBodyToHtml,
} from "../contentRendering";

const DATA = {
  firstName: "Ada",
  fullName: "Ada Lovelace",
  customerType: "Advisor",
  companyName: "Analytical Engines",
};

describe("renderInline", () => {
  it("substitutes tokens with no HTML escaping", () => {
    expect(
      renderInline("Welcome {{firstName}} — {{customerType}}", DATA),
    ).toBe("Welcome Ada — Advisor");
  });

  it("replaces a missing token with empty string", () => {
    expect(renderInline("Hi {{nickname}}!", DATA)).toBe("Hi !");
  });
});

describe("renderTextBodyToHtml", () => {
  it("wraps blank-line-separated paragraphs and single newlines", () => {
    const html = renderTextBodyToHtml("Line one\nLine two\n\nNext para", DATA);
    expect(html).toBe("<p>Line one<br/>Line two</p>\n<p>Next para</p>");
  });

  it("substitutes variables", () => {
    expect(renderTextBodyToHtml("Dear {{fullName}},", DATA)).toBe(
      "<p>Dear Ada Lovelace,</p>",
    );
  });

  it("escapes HTML in the template and in substituted values (injection-safe)", () => {
    const html = renderTextBodyToHtml("Hi {{firstName}} <script>x</script>", {
      firstName: "<b>Eve</b>",
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>Eve</b>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;Eve&lt;/b&gt;");
  });

  it("never leaks a raw token", () => {
    expect(renderTextBodyToHtml("Value: {{missing}}", DATA)).not.toContain(
      "{{",
    );
  });
});

describe("buildContactTemplateData", () => {
  it("derives fullName and pulls the organization name", () => {
    const data = buildContactTemplateData(
      { firstName: "Ada", lastName: "Lovelace", organization: { name: "AE" } },
      "Advisor",
      new Date("2026-06-19T00:00:00Z"),
    );
    expect(data.fullName).toBe("Ada Lovelace");
    expect(data.companyName).toBe("AE");
    expect(data.customerType).toBe("Advisor");
    expect(data.date).toBe("2026-06-19");
  });

  it("falls back to 'there' when the contact has no name", () => {
    const data = buildContactTemplateData(
      { firstName: null, lastName: null },
      "Developer",
      new Date("2026-06-19T00:00:00Z"),
    );
    expect(data.fullName).toBe("there");
    expect(data.companyName).toBe("");
  });
});
