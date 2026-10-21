import { describe, it, expect } from "vitest";
import { httpUrlOrNull, httpUrlSchema } from "../safeUrl";

describe("httpUrlOrNull", () => {
  it("keeps absolute http and https URLs", () => {
    expect(httpUrlOrNull("https://github.com/o/r/pull/1")).toBe("https://github.com/o/r/pull/1");
    expect(httpUrlOrNull("http://localhost:3000/x")).toBe("http://localhost:3000/x");
  });

  it("rejects script, data and other schemes", () => {
    expect(httpUrlOrNull("javascript:alert(1)")).toBeNull();
    expect(httpUrlOrNull("JavaScript:alert(1)")).toBeNull();
    expect(httpUrlOrNull("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(httpUrlOrNull("ftp://example.com/file")).toBeNull();
    expect(httpUrlOrNull("vbscript:msgbox(1)")).toBeNull();
  });

  it("rejects relative paths, empties and garbage", () => {
    expect(httpUrlOrNull("/pull/1")).toBeNull();
    expect(httpUrlOrNull("github.com/o/r")).toBeNull();
    expect(httpUrlOrNull("")).toBeNull();
    expect(httpUrlOrNull(null)).toBeNull();
    expect(httpUrlOrNull(undefined)).toBeNull();
  });
});

describe("httpUrlSchema", () => {
  it("accepts an https URL and rejects a javascript: URI", () => {
    expect(httpUrlSchema.safeParse("https://example.com/pr/1").success).toBe(true);
    expect(httpUrlSchema.safeParse("javascript:alert(1)").success).toBe(false);
  });

  it("enforces the length bound", () => {
    expect(httpUrlSchema.safeParse(`https://example.com/${"a".repeat(500)}`).success).toBe(false);
  });
});
