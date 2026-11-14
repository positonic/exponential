import { describe, expect, it } from "vitest";

import { isPublicPath } from "~/lib/publicRoutes";
import { trailingSlashRedirectPath } from "../trailingSlash";

describe("trailingSlashRedirectPath", () => {
  it("leaves the root and slash-less paths alone", () => {
    expect(trailingSlashRedirectPath("/")).toBeNull();
    expect(trailingSlashRedirectPath("/features")).toBeNull();
    expect(trailingSlashRedirectPath("/w/acme/projects")).toBeNull();
  });

  it("strips one or more trailing slashes", () => {
    expect(trailingSlashRedirectPath("/features/")).toBe("/features");
    expect(trailingSlashRedirectPath("/w/acme/projects//")).toBe("/w/acme/projects");
    expect(trailingSlashRedirectPath("//")).toBe("/");
  });

  it("closes the /features/ allowlist gap: the redirect target is gated", () => {
    // `/features/` is on the public allowlist as a marketing prefix, but the
    // page it would render is the app's gated `/features`.
    expect(isPublicPath("/features/")).toBe(true);
    const target = trailingSlashRedirectPath("/features/");
    expect(target).toBe("/features");
    expect(isPublicPath(target!)).toBe(false);
  });
});
