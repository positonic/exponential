import { describe, expect, it } from "vitest";
import { notionPageUrl } from "../notionUrl";

describe("notionPageUrl", () => {
  it("strips dashes from a UUID page id", () => {
    expect(notionPageUrl("26c94ef8-97a9-8134-a83b-000000000000")).toBe(
      "https://www.notion.so/26c94ef897a98134a83b000000000000",
    );
  });

  it("accepts an already-bare 32-hex id", () => {
    expect(notionPageUrl("26c94ef897a98134a83b000000000000")).toBe(
      "https://www.notion.so/26c94ef897a98134a83b000000000000",
    );
  });

  it("returns null for anything that is not a Notion page id", () => {
    expect(notionPageUrl("")).toBeNull();
    expect(notionPageUrl("not-a-page-id")).toBeNull();
    expect(notionPageUrl("26c94ef897a98134a83b0000000000")).toBeNull(); // too short
    expect(notionPageUrl("javascript:alert(1)")).toBeNull();
  });
});
