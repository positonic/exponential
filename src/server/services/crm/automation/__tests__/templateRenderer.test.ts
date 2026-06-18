import { describe, it, expect } from "vitest";

import { renderTemplate } from "../templateRenderer";
import { templateFileForCustomerType } from "../agreementTemplates";

describe("renderTemplate", () => {
  it("substitutes multiple distinct tokens", () => {
    const { html, missingVariables } = renderTemplate(
      "<p>Hi {{firstName}} {{lastName}}, welcome as a {{customerType}}.</p>",
      { firstName: "Ada", lastName: "Lovelace", customerType: "Advisor" },
    );
    expect(html).toBe("<p>Hi Ada Lovelace, welcome as a Advisor.</p>");
    expect(missingVariables).toEqual([]);
  });

  it("tolerates whitespace inside the token braces", () => {
    const { html } = renderTemplate("Dear {{ fullName }},", {
      fullName: "Grace Hopper",
    });
    expect(html).toBe("Dear Grace Hopper,");
  });

  it("replaces a repeated token everywhere it appears", () => {
    const { html } = renderTemplate("{{x}}-{{x}}-{{x}}", { x: "9" });
    expect(html).toBe("9-9-9");
  });

  it("never leaks a raw placeholder for a missing/empty value, and reports it", () => {
    const { html, missingVariables } = renderTemplate(
      "Hi {{firstName}} of {{companyName}}!",
      { firstName: "Ada", companyName: "" },
    );
    expect(html).toBe("Hi Ada of !");
    expect(html).not.toContain("{{");
    expect(missingVariables).toEqual(["companyName"]);
  });

  it("dedupes a missing variable that appears more than once", () => {
    const { missingVariables } = renderTemplate("{{a}} {{a}} {{b}}", {});
    expect(missingVariables).toEqual(["a", "b"]);
  });
});

describe("templateFileForCustomerType", () => {
  it("maps each supported Customer type to its agreement file", () => {
    expect(templateFileForCustomerType("Channel Partner")).toBe(
      "channel-partner-agreement.html",
    );
    expect(templateFileForCustomerType("Advisor")).toBe(
      "advisor-agreement.html",
    );
  });

  it("returns null for a Customer type with no agreement template", () => {
    expect(templateFileForCustomerType("Investor")).toBeNull();
    expect(templateFileForCustomerType("")).toBeNull();
  });
});
