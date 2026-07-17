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

  it("keeps the historical 'whatsapp' default for unknown or absent token types", () => {
    expect(deriveActionSource("agent-context")).toBe("whatsapp");
    expect(deriveActionSource(undefined)).toBe("whatsapp");
  });
});
