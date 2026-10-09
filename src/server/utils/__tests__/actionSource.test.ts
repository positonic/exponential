import { describe, it, expect } from "vitest";

import { deriveActionSource, resolveAgentActionSource } from "../actionSource";

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

describe("resolveAgentActionSource", () => {
  it("passes a mapped gateway token's surface through", () => {
    expect(resolveAgentActionSource("telegram-gateway")).toBe("telegram");
  });

  it("names any non-gateway principal the agent", () => {
    expect(resolveAgentActionSource("agent-key")).toBe("agent");
    expect(resolveAgentActionSource("api-token")).toBe("agent");
    expect(resolveAgentActionSource(undefined)).toBe("agent");
  });

  it("rejects an unmapped gateway token type instead of defaulting", () => {
    expect(() => resolveAgentActionSource("signal-gateway")).toThrow(/signal-gateway/);
    expect(() => resolveAgentActionSource("signal-gateway")).toThrowError(
      expect.objectContaining({ code: "BAD_REQUEST" }),
    );
  });
});
