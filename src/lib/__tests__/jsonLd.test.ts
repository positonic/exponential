import { describe, expect, it } from "vitest";
import { serializeJsonLd } from "../jsonLd";

describe("serializeJsonLd", () => {
  it("escapes < so a string cannot close the script element", () => {
    const out = serializeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("<");
    expect(out).toContain("\\u003c/script>");
  });

  it("round-trips to the same data", () => {
    const data = { "@type": "FAQPage", text: "a < b && c > d", n: [1, 2] };
    expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
  });
});
