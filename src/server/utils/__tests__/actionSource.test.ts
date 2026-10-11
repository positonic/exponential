import { describe, it, expect } from "vitest";

import type { Principal, PrincipalSurface } from "~/server/services/access/principal";
import { actionSourceForPrincipal, deriveActionSource, resolveAgentActionSource } from "../actionSource";

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
  const zoe = (surface: PrincipalSurface): Principal => ({ kind: "agent_for_human", userId: "u-1", surface });

  it("passes a mapped gateway token's surface through", () => {
    expect(resolveAgentActionSource(zoe("telegram"), "telegram-gateway")).toBe("telegram");
  });

  it("names the source from the principal, not the token alone", () => {
    expect(resolveAgentActionSource(zoe("agent-context"), "agent-context")).toBe("agent");
    expect(
      resolveAgentActionSource(
        { kind: "agent", userId: "s-1", agentId: "a-1", ownerId: "u-1", surface: "agent-key" },
        "agent-key",
      ),
    ).toBe("agent");
    // A person's own API token is the person, not an agent.
    expect(resolveAgentActionSource({ kind: "human", userId: "u-1", surface: "api-token" }, "api-token")).toBe("cli");
  });

  it("rejects an unmapped gateway token type instead of defaulting", () => {
    expect(() => resolveAgentActionSource(zoe("unknown"), "signal-gateway")).toThrow(/signal-gateway/);
    expect(() => resolveAgentActionSource(zoe("unknown"), "signal-gateway")).toThrowError(
      expect.objectContaining({ code: "BAD_REQUEST" }),
    );
  });
});

/**
 * Attribution from the verified principal (D-0016): an Action's `source`
 * names the surface the credential proves, so an agent can never be recorded
 * as the UI or the CLI.
 */
describe("actionSourceForPrincipal", () => {
  const human = (surface: PrincipalSurface): Principal => ({ kind: "human", userId: "u-1", surface });
  const forHuman = (surface: PrincipalSurface): Principal => ({ kind: "agent_for_human", userId: "u-1", surface });
  const agent = (surface: PrincipalSurface): Principal => ({
    kind: "agent",
    userId: "shadow-1",
    agentId: "agent-1",
    ownerId: "u-1",
    surface,
  });

  it.each([
    ["web", "ui"],
    ["device", "ui"],
    ["extension", "ui"],
    ["api-token", "cli"],
  ] as const)("a person on %s is %s", (surface, source) => {
    expect(actionSourceForPrincipal(human(surface))).toBe(source);
  });

  it.each(["agent-key", "agent-run", "agent-context"] as const)("an agent on %s is the agent", (surface) => {
    expect(actionSourceForPrincipal(agent(surface))).toBe("agent");
  });

  it.each([
    ["whatsapp", "whatsapp"],
    ["telegram", "telegram"],
    ["matrix", "matrix"],
    ["voice", "voice"],
    // Zoe in the web chat is an agent working for the person, not the UI.
    ["agent-context", "agent"],
    ["unknown", "agent"],
  ] as const)("an agent acting for a person on %s is %s", (surface, source) => {
    expect(actionSourceForPrincipal(forHuman(surface))).toBe(source);
  });
});
