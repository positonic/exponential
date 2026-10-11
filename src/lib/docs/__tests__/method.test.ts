/**
 * The method's immutability rules (D-0015) that `npm run docs:check` enforces,
 * and the content hash they rest on.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { listDocPages } from "../content";
import {
  checkMethodDocuments,
  checkMethodRelease,
  checkMethodReleaseAgainstBase,
  collectMethodDocuments,
  compareSemver,
  computeMethodHash,
  type MethodRelease,
} from "../method";

const HASH_A = `sha256:${"a".repeat(64)}`;
const HASH_B = `sha256:${"b".repeat(64)}`;
const HASH_C = `sha256:${"c".repeat(64)}`;

function release(overrides: Partial<MethodRelease> = {}): MethodRelease {
  return { version: "0.1.0", status: "draft", publishedAt: null, contentHash: null, history: [], ...overrides };
}

function published(overrides: Partial<MethodRelease> = {}): MethodRelease {
  return release({ status: "published", publishedAt: "2026-11-01T00:00:00.000Z", contentHash: HASH_A, ...overrides });
}

describe("checkMethodRelease", () => {
  it("accepts a draft, whatever its text", () => {
    expect(checkMethodRelease(release(), HASH_B)).toEqual([]);
  });

  it("accepts a published release whose files still hash to contentHash", () => {
    expect(checkMethodRelease(published(), HASH_A)).toEqual([]);
  });

  it("fails a published release whose text changed without a version bump", () => {
    const problems = checkMethodRelease(published(), HASH_B);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("published version 0.1.0 changed");
    expect(problems[0]).toContain(HASH_B);
  });

  it("fails a published release with no contentHash or publishedAt", () => {
    expect(checkMethodRelease(published({ contentHash: null, publishedAt: null }), HASH_A)).toEqual([
      "a published release needs publishedAt",
      `a published release needs contentHash (the files hash to ${HASH_A})`,
    ]);
  });

  it("accepts a newer version with the old one in history", () => {
    const r = published({
      version: "0.2.0",
      contentHash: HASH_B,
      history: [{ version: "0.1.0", contentHash: HASH_A, publishedAt: "2026-11-01T00:00:00.000Z" }],
    });
    expect(checkMethodRelease(r, HASH_B)).toEqual([]);
  });

  it("fails a history version reused with a different hash", () => {
    const r = published({
      version: "0.3.0",
      contentHash: HASH_C,
      history: [
        { version: "0.1.0", contentHash: HASH_A, publishedAt: "2026-11-01T00:00:00.000Z" },
        { version: "0.1.0", contentHash: HASH_B, publishedAt: "2026-11-02T00:00:00.000Z" },
      ],
    });
    expect(checkMethodRelease(r, HASH_C)).toContain("history version 0.1.0 reappears with a different hash");
  });

  it("fails a current version that was already published with other text", () => {
    const r = published({
      version: "0.1.0",
      contentHash: HASH_B,
      history: [{ version: "0.1.0", contentHash: HASH_A, publishedAt: "2026-11-01T00:00:00.000Z" }],
    });
    expect(checkMethodRelease(r, HASH_B)).toContain(
      `version 0.1.0 was already published with hash ${HASH_A}; bump the version`,
    );
  });

  it("fails history versions that do not strictly increase", () => {
    const r = published({
      version: "1.0.0",
      contentHash: HASH_C,
      history: [
        { version: "0.2.0", contentHash: HASH_A, publishedAt: "2026-11-01T00:00:00.000Z" },
        { version: "0.1.0", contentHash: HASH_B, publishedAt: "2026-11-02T00:00:00.000Z" },
      ],
    });
    expect(checkMethodRelease(r, HASH_C)).toContain("history versions must strictly increase: 0.2.0 then 0.1.0");
  });

  it("fails a current version that is not newer than the last published one", () => {
    const r = release({
      version: "0.1.0",
      history: [{ version: "0.2.0", contentHash: HASH_A, publishedAt: "2026-11-01T00:00:00.000Z" }],
    });
    expect(checkMethodRelease(r, HASH_B)).toContain(
      "version 0.1.0 must be newer than the last published version 0.2.0",
    );
  });

  it("fails a version that is not MAJOR.MINOR.PATCH", () => {
    expect(checkMethodRelease(release({ version: "v1" }), HASH_A)).toEqual(['version "v1" is not MAJOR.MINOR.PATCH']);
  });
});

describe("checkMethodReleaseAgainstBase", () => {
  const V1 = { version: "0.1.0", contentHash: HASH_A, publishedAt: "2026-11-01T00:00:00.000Z" };

  it("accepts any change while the base is a draft", () => {
    expect(checkMethodReleaseAgainstBase(release(), release({ version: "0.2.0" }))).toEqual([]);
    expect(checkMethodReleaseAgainstBase(release(), published())).toEqual([]);
  });

  it("accepts an unchanged published release", () => {
    expect(checkMethodReleaseAgainstBase(published(), published())).toEqual([]);
  });

  it("fails published text re-hashed under the same version", () => {
    const problems = checkMethodReleaseAgainstBase(published(), published({ contentHash: HASH_B }));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("published version 0.1.0 was released with");
  });

  it("fails a changed publishedAt under the same version", () => {
    expect(
      checkMethodReleaseAgainstBase(published(), published({ publishedAt: "2027-01-01T00:00:00.000Z" })),
    ).toEqual(["published version 0.1.0 keeps its publishedAt (2026-11-01T00:00:00.000Z)"]);
  });

  it("fails a published method going back to draft", () => {
    const problems = checkMethodReleaseAgainstBase(published(), release({ version: "0.2.0", history: [V1] }));
    expect(problems.some((p) => p.includes("can't go back to draft"))).toBe(true);
  });

  it("accepts a new version that appends the base release to history", () => {
    const next = published({ version: "0.2.0", contentHash: HASH_B, publishedAt: "2026-12-01T00:00:00.000Z", history: [V1] });
    expect(checkMethodReleaseAgainstBase(published(), next)).toEqual([]);
  });

  it("fails a new version that drops the base release from history", () => {
    const next = published({ version: "0.2.0", contentHash: HASH_B, publishedAt: "2026-12-01T00:00:00.000Z" });
    expect(checkMethodReleaseAgainstBase(published(), next)).toEqual([
      "the previous release 0.1.0 must be appended to history",
    ]);
  });

  it("fails history that was rewritten or truncated", () => {
    const base = published({ version: "0.2.0", contentHash: HASH_B, history: [V1] });
    const rewritten = published({ version: "0.2.0", contentHash: HASH_B, history: [{ ...V1, contentHash: HASH_C }] });
    expect(checkMethodReleaseAgainstBase(base, rewritten)).toContain(
      "history is append-only: the base branch's entries must stay, unchanged and in order",
    );
    expect(checkMethodReleaseAgainstBase(base, published({ version: "0.2.0", contentHash: HASH_B }))).toContain(
      "history is append-only: the base branch's entries must stay, unchanged and in order",
    );
  });
});

describe("checkMethodDocuments", () => {
  const ALL = [["method"], ["method", "glossary"], ["method", "agent-principles"]];

  it("accepts exactly the three documents", () => {
    expect(checkMethodDocuments(ALL)).toEqual([]);
  });

  it("fails a page the hash does not cover", () => {
    expect(checkMethodDocuments([...ALL, ["method", "faq"]])).toEqual([
      "content/docs/method/faq is not one of the method's documents (METHOD_DOCUMENTS in src/lib/docs/method.ts)",
    ]);
  });

  it("fails a missing document, including when all are gone", () => {
    expect(checkMethodDocuments(ALL.slice(0, 2))).toEqual([
      "the method's agent-principles document (content/docs/method/agent-principles) is missing",
    ]);
    expect(checkMethodDocuments([])).toHaveLength(3);
  });
});

describe("compareSemver", () => {
  it("orders numerically, not lexically", () => {
    expect(compareSemver("0.10.0", "0.9.0")).toBeGreaterThan(0);
    expect(compareSemver("1.0.0", "1.0.0")).toBe(0);
    expect(compareSemver("1.0", "1.0.0")).toBeNull();
  });
});

describe("computeMethodHash over the docs loader", () => {
  let dir: string;

  function write(rel: string, body: string) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }

  function hashOfFixture(): string {
    return computeMethodHash(collectMethodDocuments(listDocPages(dir, { includeUnpublishedMethod: true })));
  }

  function writeMethod(updated: string, body: string) {
    write("method/index.md", `---\ntitle: The Exponential Method\ndescription: d\nupdated: ${updated}\n---\n\n${body}\n`);
  }

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "method-hash-"));
    write("method/glossary.md", "---\ntitle: Glossary\ndescription: d\nupdated: 2026-10-11\n---\n\n- **Drift:** a gap.\n");
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("ignores the updated: stamp", () => {
    writeMethod("2026-10-11", "Keep the state.");
    const before = hashOfFixture();
    writeMethod("2027-01-01", "Keep the state.");
    expect(hashOfFixture()).toBe(before);
  });

  it("changes when one body character changes", () => {
    writeMethod("2026-10-11", "Keep the state.");
    const before = hashOfFixture();
    writeMethod("2026-10-11", "Keep the state!");
    expect(hashOfFixture()).not.toBe(before);
  });

  it("ignores line-ending style", () => {
    writeMethod("2026-10-11", "Keep the state.\nClose the loop.");
    const before = hashOfFixture();
    writeMethod("2026-10-11", "Keep the state.\r\nClose the loop.");
    expect(hashOfFixture()).toBe(before);
  });

  it("changes when a title changes", () => {
    const a = computeMethodHash([{ title: "A", markdown: "x" }]);
    const b = computeMethodHash([{ title: "B", markdown: "x" }]);
    expect(a).not.toBe(b);
  });
});
