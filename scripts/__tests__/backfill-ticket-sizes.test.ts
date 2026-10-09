import { describe, expect, it } from "vitest";
import { buildClassificationInput, chunk, withSizeSource } from "../backfill-ticket-sizes";
import {
  buildBatchSizePrompt,
  parseBatchSizeResponse,
} from "../../src/plugins/product/server/sizeSuggestion";

describe("buildClassificationInput", () => {
  const base = { id: "t1", title: "Do the thing", prUrl: null, links: null };

  it("needs a body or a PR, and carries the outcome when known", () => {
    expect(buildClassificationInput({ ...base, body: "  " }, null, 12)).toBeNull();
    expect(
      buildClassificationInput({ ...base, body: "" }, { additions: 10, deletions: 2, changedFiles: 1 }, null),
    ).toMatchObject({ id: "t1", body: "", pr: { additions: 10 }, cycleTimeHours: null });
    expect(buildClassificationInput({ ...base, body: "Steps…" }, null, 3.5)).toMatchObject({
      body: "Steps…",
      pr: null,
      cycleTimeHours: 3.5,
    });
  });

  it("truncates a very long body", () => {
    const item = buildClassificationInput({ ...base, body: "x".repeat(5000) }, null, null);
    expect(item?.body.length).toBeLessThan(2100);
    expect(item?.body.endsWith("…")).toBe(true);
  });
});

describe("chunk / withSizeSource", () => {
  it("splits into batches and merges the provenance marker", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(withSizeSource(null, "ai-backfill")).toEqual({ sizeSource: "ai-backfill" });
    expect(withSizeSource({ spec: "https://x" }, "ai-backfill")).toEqual({
      spec: "https://x",
      sizeSource: "ai-backfill",
    });
    expect(withSizeSource(["weird"], "ai-backfill")).toEqual({ sizeSource: "ai-backfill" });
  });
});

describe("batch prompt and response", () => {
  it("lists each ticket with its outcome inside the fence and parses one entry per id", () => {
    const { user } = buildBatchSizePrompt({
      nonce: "n1",
      anchors: [{ title: "Known M", size: "M", cycleTimeHours: 5 }],
      items: [
        { id: "a", title: "Small fix", body: "One line.", pr: { additions: 3, deletions: 1, changedFiles: 1 }, cycleTimeHours: 0.5 },
        { id: "b", title: "No body", body: "", pr: { additions: 400, deletions: 20, changedFiles: 12 }, cycleTimeHours: null },
      ],
    });
    expect(user).toContain('<user_data nonce="n1">');
    expect(user).toContain("### id: a");
    expect(user).toContain("Outcome: PR: +3 -1, 1 files; took 30min");
    expect(user).toContain("### id: b");
    expect(user).toContain("(empty)");
    expect(user).toContain("- M (took 5h): Known M");

    expect(
      parseBatchSizeResponse(
        '{"sizes":[{"id":"a","size":"XS","confidence":0.9,"rationale":"One line."},{"id":"b","size":"L","confidence":0.55,"rationale":"Big PR, no spec."}]}',
      ),
    ).toHaveLength(2);
    expect(() => parseBatchSizeResponse('{"sizes":[{"id":"a","size":"XS","confidence":1.5,"rationale":"x"}]}')).toThrow();
  });
});
