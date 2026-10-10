import { describe, expect, it } from "vitest";
import { matrixRoomPermalink } from "../matrixPermalink";

describe("matrixRoomPermalink", () => {
  it("links a room id with its own server as via", () => {
    expect(matrixRoomPermalink("!abc123:example.org")).toBe(
      "https://matrix.to/#/!abc123%3Aexample.org?via=example.org",
    );
  });

  it("links an alias without a via parameter", () => {
    expect(matrixRoomPermalink("#general:example.org")).toBe(
      "https://matrix.to/#/%23general%3Aexample.org",
    );
  });

  it("returns null for the off placeholder and malformed ids", () => {
    expect(matrixRoomPermalink("off:project-1")).toBeNull();
    expect(matrixRoomPermalink("")).toBeNull();
    expect(matrixRoomPermalink("!noserver")).toBeNull();
  });
});
