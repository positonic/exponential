import { describe, it, expect, vi } from "vitest";

vi.hoisted(() => {
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.SKIP_ENV_VALIDATION ??= "true";
});

import {
  mintVoiceSessionToken,
  verifyVoiceSessionToken,
} from "~/server/utils/voice-token";

describe("voice-token conversationId claim (ADR-0006)", () => {
  it("round-trips a conversationId baked into the token", () => {
    const token = mintVoiceSessionToken(
      { id: "u1" },
      "ws_123",
      "conv_abc",
    );
    const verified = verifyVoiceSessionToken(token);
    expect(verified.userId).toBe("u1");
    expect(verified.workspaceId).toBe("ws_123");
    expect(verified.conversationId).toBe("conv_abc");
  });

  it("omits conversationId when none is provided (iOS / legacy path)", () => {
    const token = mintVoiceSessionToken({ id: "u1" });
    const verified = verifyVoiceSessionToken(token);
    expect(verified.userId).toBe("u1");
    expect(verified.conversationId).toBeUndefined();
    expect(verified.workspaceId).toBeUndefined();
  });

  it("carries conversationId without a workspaceId", () => {
    const token = mintVoiceSessionToken({ id: "u1" }, undefined, "conv_only");
    const verified = verifyVoiceSessionToken(token);
    expect(verified.conversationId).toBe("conv_only");
    expect(verified.workspaceId).toBeUndefined();
  });
});
