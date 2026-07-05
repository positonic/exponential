import { describe, expect, it } from "vitest";

import {
  buildPublicPagePath,
  parsePublicPageParam,
  slugifyPageTitle,
} from "../public-url";

describe("slugifyPageTitle", () => {
  it("lowercases and hyphenates", () => {
    expect(slugifyPageTitle("Marketing Launch Plan")).toBe(
      "marketing-launch-plan",
    );
  });

  it("folds diacritics and strips symbols", () => {
    expect(slugifyPageTitle("Café résumé — v2!")).toBe("cafe-resume-v2");
  });

  it("collapses runs of separators without leading/trailing hyphens", () => {
    expect(slugifyPageTitle("  a  /  b  ")).toBe("a-b");
  });

  it("falls back to 'untitled' when nothing survives", () => {
    expect(slugifyPageTitle("🎉🎉")).toBe("untitled");
    expect(slugifyPageTitle("")).toBe("untitled");
  });

  it("caps length without ending on a hyphen", () => {
    const slug = slugifyPageTitle(`${"a".repeat(79)} bcd`);
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("parsePublicPageParam", () => {
  it("splits slug and id at the last hyphen", () => {
    expect(parsePublicPageParam("marketing-launch-plan-x7kq2mfa")).toEqual({
      slug: "marketing-launch-plan",
      publicId: "x7kq2mfa",
    });
  });

  it("accepts a bare id with no slug", () => {
    expect(parsePublicPageParam("x7kq2mfa")).toEqual({
      slug: "",
      publicId: "x7kq2mfa",
    });
  });

  it("keeps hyphens inside the slug", () => {
    expect(parsePublicPageParam("a-b-c-abcd1234")?.slug).toBe("a-b-c");
  });

  it("rejects params that cannot end in a well-formed id", () => {
    expect(parsePublicPageParam("")).toBeNull();
    expect(parsePublicPageParam("short-abc")).toBeNull();
    expect(parsePublicPageParam("slug-ABCD1234")).toBeNull();
    expect(parsePublicPageParam("slug-abcd123!")).toBeNull();
  });

  it("round-trips what buildPublicPagePath produces", () => {
    const path = buildPublicPagePath("my-page", "abcd1234");
    expect(path).toBe("/p/my-page-abcd1234");
    expect(parsePublicPageParam(path.replace("/p/", ""))).toEqual({
      slug: "my-page",
      publicId: "abcd1234",
    });
  });
});
