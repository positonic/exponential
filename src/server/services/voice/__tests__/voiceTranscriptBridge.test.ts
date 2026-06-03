import { describe, it, expect, vi } from "vitest";

vi.hoisted(() => {
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.SKIP_ENV_VALIDATION ??= "true";
});

import {
  persistVoiceTurn,
  voiceTurnId,
  voiceThreadKey,
  resolveVoiceThreadKey,
  EmptyVoiceTurnError,
  type VoiceMemoryClient,
} from "~/server/services/voice/voiceTranscriptBridge";

function mockClient() {
  const saveMessageToMemory = vi.fn(async () => ({}));
  const client: VoiceMemoryClient = { saveMessageToMemory };
  return { client, saveMessageToMemory };
}

describe("voiceTranscriptBridge.persistVoiceTurn", () => {
  it("persists to the given thread key with the correct role, resource, and marker", async () => {
    const { client, saveMessageToMemory } = mockClient();

    const result = await persistVoiceTurn(
      { userId: "u1", role: "user", text: "what's overdue?", threadKey: voiceThreadKey("u1") },
      { client },
    );

    expect(result.threadKey).toBe("voice-u1");
    expect(result.role).toBe("user");
    expect(result.marker).toBe("voice");

    expect(saveMessageToMemory).toHaveBeenCalledTimes(1);
    const arg = saveMessageToMemory.mock.calls[0]![0];
    const msg = arg.messages[0]!;
    expect(arg.agentId).toBe("zoeAgent");
    expect(msg.threadId).toBe("voice-u1");
    expect(msg.resourceId).toBe("u1");
    expect(msg.role).toBe("user");
    expect(msg.content).toBe("what's overdue?");
  });

  it("rejects an empty / whitespace-only turn without persisting", async () => {
    const { client, saveMessageToMemory } = mockClient();

    await expect(
      persistVoiceTurn({ userId: "u1", role: "user", text: "   ", threadKey: "voice-u1" }, { client }),
    ).rejects.toBeInstanceOf(EmptyVoiceTurnError);

    expect(saveMessageToMemory).not.toHaveBeenCalled();
  });

  it("is idempotent on retry: the same turn yields the same deterministic id", async () => {
    const { client } = mockClient();

    const first = await persistVoiceTurn(
      { userId: "u1", role: "assistant", text: "You have 2 overdue.", threadKey: "voice-u1" },
      { client },
    );
    const retry = await persistVoiceTurn(
      { userId: "u1", role: "assistant", text: "You have 2 overdue.", threadKey: "voice-u1" },
      { client },
    );

    expect(first.id).toBe(retry.id);
    expect(first.id).toBe(voiceTurnId("voice-u1", "assistant", "You have 2 overdue."));
  });

  it("trims surrounding whitespace before persisting", async () => {
    const { client, saveMessageToMemory } = mockClient();
    await persistVoiceTurn(
      { userId: "u1", role: "user", text: "  hello  ", threadKey: "voice-u1" },
      { client },
    );
    expect(saveMessageToMemory.mock.calls[0]![0].messages[0]!.content).toBe("hello");
  });
});

describe("voiceTranscriptBridge.resolveVoiceThreadKey", () => {
  it("binds to the conversationId thread when present (web / ADR-0006)", () => {
    // Web sessions carry the text-chat conversationId so voice + text converge
    // on one thread — the brain reads/writes the SAME thread the text chat uses.
    expect(resolveVoiceThreadKey("u1", "conv_abc123")).toBe("conv_abc123");
  });

  it("falls back to the user-scoped voice thread with no conversationId (iOS)", () => {
    // iOS has no concurrent text chat — the divergence is intentional.
    expect(resolveVoiceThreadKey("u1")).toBe("voice-u1");
    expect(resolveVoiceThreadKey("u1")).toBe(voiceThreadKey("u1"));
  });

  it("treats an empty-string conversationId as absent (falls back)", () => {
    expect(resolveVoiceThreadKey("u1", "")).toBe("voice-u1");
  });
});
