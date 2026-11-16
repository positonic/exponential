import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isStaleChunkError,
  recoverFromStaleChunk,
  reloadOnceForStaleChunk,
} from "../staleChunkReload";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

function callError(stack: string): TypeError {
  const e = new TypeError("Cannot read properties of undefined (reading 'call')");
  e.stack = stack;
  return e;
}

describe("isStaleChunkError", () => {
  it("recognises ChunkLoadError and chunk-load messages", () => {
    const e = new Error("Loading chunk 123 failed.");
    e.name = "ChunkLoadError";
    expect(isStaleChunkError(e)).toBe(true);
    expect(isStaleChunkError(new Error("Loading CSS chunk app/layout failed"))).toBe(true);
  });

  it("accepts the 'call' TypeError when the webpack runtime is the top frame (V8 and Safari/Firefox stacks)", () => {
    expect(
      isStaleChunkError(
        callError(
          "TypeError: Cannot read properties of undefined (reading 'call')\n" +
            "    at __webpack_require__ (https://x/_next/static/chunks/webpack-ab12.js:1:1)\n" +
            "    at https://x/_next/static/chunks/app/page.js:1:1",
        ),
      ),
    ).toBe(true);
    expect(
      isStaleChunkError(
        callError("o@https://x/_next/static/chunks/webpack-ab12.js:1:1\nhttps://x/_next/static/chunks/app/page.js:1:1"),
      ),
    ).toBe(true);
  });

  it("rejects the 'call' TypeError thrown by app code, even during module evaluation", () => {
    expect(
      isStaleChunkError(
        callError(
          "TypeError: Cannot read properties of undefined (reading 'call')\n" +
            "    at Module.init (https://x/_next/static/chunks/app/page.js:1:1)\n" +
            "    at __webpack_require__ (https://x/_next/static/chunks/webpack-ab12.js:1:1)",
        ),
      ),
    ).toBe(false);
    expect(isStaleChunkError(callError(""))).toBe(false);
  });

  it("ignores ordinary errors and non-errors", () => {
    expect(isStaleChunkError(new Error("boom"))).toBe(false);
    expect(isStaleChunkError("Loading chunk 1 failed")).toBe(false);
  });
});

describe("reloadOnceForStaleChunk", () => {
  it("reloads once per build, never again for the same build", () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    expect(reloadOnceForStaleChunk({ buildId: "old", storage, reload })).toBe(true);
    // The error persists (broken deploy, offline): no loop, however much later.
    expect(reloadOnceForStaleChunk({ buildId: "old", storage, reload })).toBe(false);
    expect(reloadOnceForStaleChunk({ buildId: "old", storage, reload })).toBe(false);
    // A later deploy may recover once more.
    expect(reloadOnceForStaleChunk({ buildId: "new", storage, reload })).toBe(true);
    expect(reloadOnceForStaleChunk({ buildId: "new", storage, reload })).toBe(false);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("never reloads without storage (no loop guard)", () => {
    const reload = vi.fn();
    expect(reloadOnceForStaleChunk({ buildId: "b", storage: null, reload })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("does not reload when storage throws", () => {
    const reload = vi.fn();
    const storage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => undefined,
    };
    expect(reloadOnceForStaleChunk({ buildId: "b", storage, reload })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("recoverFromStaleChunk (error-boundary path)", () => {
  afterEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("reloads for a stale-chunk error caught by a boundary, once", () => {
    const reload = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, reload } as Location);
    const e = new Error("Loading chunk 9 failed.");
    e.name = "ChunkLoadError";
    expect(recoverFromStaleChunk(e)).toBe(true);
    expect(recoverFromStaleChunk(e)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("leaves ordinary render errors to the fallback", () => {
    const reload = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, reload } as Location);
    expect(recoverFromStaleChunk(new Error("render failed"))).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
