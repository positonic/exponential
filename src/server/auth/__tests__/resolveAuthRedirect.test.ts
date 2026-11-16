import { describe, expect, it } from "vitest";

import { resolveAuthRedirect } from "~/server/auth/resolveAuthRedirect";

const BASE = "https://exponential.im";

describe("resolveAuthRedirect", () => {
  it("absolutises a relative path against baseUrl", () => {
    expect(resolveAuthRedirect("/projects", BASE)).toBe(`${BASE}/projects`);
  });

  it("keeps a same-origin absolute URL", () => {
    expect(resolveAuthRedirect(`${BASE}/today?x=1`, BASE)).toBe(
      `${BASE}/today?x=1`,
    );
  });

  it("sends a foreign origin to an absolute /home (never a bare path)", () => {
    const result = resolveAuthRedirect("tauri://localhost/desktop-auth", BASE);
    expect(result).toBe(`${BASE}/home`);
    // next-auth/react runs `new URL(data.url)` with no base on this value.
    expect(() => new URL(result)).not.toThrow();
  });

  it("does not throw on an unparseable callbackUrl", () => {
    expect(resolveAuthRedirect("not a url", BASE)).toBe(`${BASE}/home`);
  });
});
