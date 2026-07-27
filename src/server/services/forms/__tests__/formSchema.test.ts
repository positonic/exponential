import { describe, it, expect } from "vitest";

import { validateSubmission, type FormField } from "../formSchema";

const fields: FormField[] = [
  { key: "email", label: "Email", type: "email", required: true },
  { key: "first_name", label: "First name", type: "text", required: false },
  { key: "resume_url", label: "Résumé link", type: "url", required: false },
  {
    key: "role",
    label: "Role",
    type: "select",
    required: true,
    options: ["Engineer", "Designer"],
  },
  { key: "agree", label: "Agree", type: "checkbox", required: true },
];

function base(overrides: Record<string, unknown>) {
  return {
    email: "Ada@Example.com",
    first_name: "Ada",
    role: "Engineer",
    agree: true,
    ...overrides,
  };
}

describe("validateSubmission", () => {
  it("accepts a valid submission and lowercases the email", () => {
    const result = validateSubmission(fields, base({}));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.clean.email).toBe("ada@example.com");
      expect(result.clean.role).toBe("Engineer");
      expect(result.clean.agree).toBe(true);
    }
  });

  it("reports a missing required field", () => {
    const result = validateSubmission(fields, base({ email: "" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.email).toMatch(/required/i);
  });

  it("rejects a malformed email", () => {
    const result = validateSubmission(fields, base({ email: "not-an-email" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.email).toMatch(/valid email/i);
  });

  it("rejects a non-http url", () => {
    const result = validateSubmission(
      fields,
      base({ resume_url: "javascript:alert(1)" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.resume_url).toMatch(/valid URL/i);
  });

  it("accepts a valid https url", () => {
    const result = validateSubmission(
      fields,
      base({ resume_url: "https://example.com/cv.pdf" }),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects a select value not in options", () => {
    const result = validateSubmission(fields, base({ role: "Marketer" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.role).toMatch(/not a valid option/i);
  });

  it("requires a checkbox when required", () => {
    const result = validateSubmission(fields, base({ agree: false }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.agree).toMatch(/required/i);
  });

  it("drops unknown keys not in the field set", () => {
    const result = validateSubmission(fields, base({ injected: "x" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.clean.injected).toBeUndefined();
  });

  it("rejects text longer than the cap", () => {
    const result = validateSubmission(fields, base({ first_name: "a".repeat(5001) }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.first_name).toMatch(/too long/i);
  });
});

describe("validateSubmission — checkbox_group", () => {
  const groupFields: FormField[] = [
    {
      key: "help",
      label: "How would you like to help?",
      type: "checkbox_group",
      required: true,
      options: ["Keep me in the loop", "I'd like to test", "Something else"],
    },
  ];

  it("accepts a subset of options and dedupes/trims selections", () => {
    const result = validateSubmission(groupFields, {
      help: ["Keep me in the loop", " I'd like to test ", "Keep me in the loop"],
    });
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.clean.help).toEqual([
        "Keep me in the loop",
        "I'd like to test",
      ]);
  });

  it("tolerates a lone string as a single selection", () => {
    const result = validateSubmission(groupFields, { help: "Something else" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.clean.help).toEqual(["Something else"]);
  });

  it("rejects a selection not in the options", () => {
    const result = validateSubmission(groupFields, {
      help: ["Keep me in the loop", "injected"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.help).toMatch(/invalid option/i);
  });

  it("requires at least one selection when required", () => {
    const result = validateSubmission(groupFields, { help: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.help).toMatch(/required/i);
  });

  it("accepts an empty selection when optional", () => {
    const optional: FormField[] = [{ ...groupFields[0]!, required: false }];
    const result = validateSubmission(optional, {});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.clean.help).toEqual([]);
  });
});