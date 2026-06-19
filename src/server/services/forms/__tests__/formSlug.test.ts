import { describe, it, expect } from "vitest";

import { nextAvailableSlug } from "../formSlug";

describe("nextAvailableSlug", () => {
  it("returns the base when it is free", () => {
    expect(nextAvailableSlug("job_application", new Set())).toBe(
      "job_application",
    );
  });

  it("appends the first free numeric suffix", () => {
    expect(
      nextAvailableSlug(
        "job_application",
        new Set(["job_application", "job_application_2"]),
      ),
    ).toBe("job_application_3");
  });

  it("skips gaps correctly", () => {
    expect(
      nextAvailableSlug("contact", new Set(["contact"])),
    ).toBe("contact_2");
  });

  it("falls back to 'form' for an empty base", () => {
    expect(nextAvailableSlug("", new Set())).toBe("form");
  });
});