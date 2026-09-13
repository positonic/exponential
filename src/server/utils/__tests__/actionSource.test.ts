import { describe, it, expect } from "vitest";

import { deriveActionSource } from "../actionSource";

describe("deriveActionSource", () => {
  it("maps matrix-gateway tokens to source 'matrix'", () => {
    expect(deriveActionSource("matrix-gateway")).toBe("matrix");
  });

  it("maps telegram-gateway tokens to source 'telegram'", () => {
    expect(deriveActionSource("telegram-gateway")).toBe("telegram");
  });

  it("maps whatsapp-gateway tokens to source 'whatsapp'", () => {
    expect(deriveActionSource("whatsapp-gateway")).toBe("whatsapp");
  });

  it("returns undefined for unknown or absent token types instead of defaulting", () => {
    // No silent "whatsapp" fallback: the caller must name the surface or fail.
    expect(deriveActionSource("agent-context")).toBeUndefined();
    expect(deriveActionSource("agent-key")).toBeUndefined();
    expect(deriveActionSource(undefined)).toBeUndefined();
  });
});
