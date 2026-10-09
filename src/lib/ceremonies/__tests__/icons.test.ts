import { describe, expect, it } from "vitest";
import { CeremonyKind } from "@prisma/client";
import { CEREMONY_ICON_KEYS, DEFAULT_CEREMONY_ICON, isCeremonyIconKey, resolveCeremonyIcon } from "../icons";

describe("ceremony icons", () => {
  it("gives every kind a default that is a pickable key", () => {
    for (const kind of Object.values(CeremonyKind)) {
      expect(CEREMONY_ICON_KEYS).toContain(DEFAULT_CEREMONY_ICON[kind]);
    }
  });

  it("uses the stored icon when it is a known key", () => {
    expect(resolveCeremonyIcon("rocket", CeremonyKind.STANDUP)).toBe("rocket");
  });

  it("falls back to the kind's default for null or unknown values", () => {
    expect(resolveCeremonyIcon(null, CeremonyKind.STANDUP)).toBe("sunrise");
    expect(resolveCeremonyIcon(undefined, CeremonyKind.RETROSPECTIVE)).toBe("rotate");
    expect(resolveCeremonyIcon("not-an-icon", CeremonyKind.CUSTOM)).toBe("target");
  });

  it("rejects non-string and unknown keys", () => {
    expect(isCeremonyIconKey("target")).toBe(true);
    expect(isCeremonyIconKey("Target")).toBe(false);
    expect(isCeremonyIconKey(42)).toBe(false);
  });
});
