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
  const createMemoryThread = vi.fn(async () => ({}));
  const client: VoiceMemoryClient = { saveMessageToMemory, createMemoryThread };
  return { client, saveMessageToMemory, createMemoryThread };
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

  // A conversation can begin with a voice turn: web voice binds to the text
  // chat's conversationId (ADR-0006), but the Mastra thread only exists once
  // the agent has run against it — saveMessages does NOT auto-create. Observed
  // 2026-06-11: every turn of a voice-first session failed "Thread conv_… not
  // found" and the transcript was lost.
  it("creates the missing thread and retries the save once on 'Thread not found'", async () => {
    const { client, saveMessageToMemory, createMemoryThread } = mockClient();
    saveMessageToMemory
      .mockRejectedValueOnce(new Error("Thread conv_123 not found"))
      .mockResolvedValueOnce({});

    const result = await persistVoiceTurn(
      { userId: "u1", role: "user", text: "voice-first turn", threadKey: "conv_123" },
      { client },
    );

    expect(createMemoryThread).toHaveBeenCalledTimes(1);
    expect(createMemoryThread).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "conv_123",
        resourceId: "u1",
        agentId: "zoeAgent",
      }),
    );
    expect(saveMessageToMemory).toHaveBeenCalledTimes(2);
    expect(result.threadKey).toBe("conv_123");
  });

  // Mastra may surface the not-found error without the thread id (e.g. "Thread
  // not found"); the create-and-retry must still trigger on that form.
  it("creates the missing thread when the error omits the thread id", async () => {
    const { client, saveMessageToMemory, createMemoryThread } = mockClient();
    saveMessageToMemory
      .mockRejectedValueOnce(new Error("Thread not found"))
      .mockResolvedValueOnce({});

    await persistVoiceTurn(
      { userId: "u1", role: "user", text: "id-less error", threadKey: "conv_123" },
      { client },
    );

    expect(createMemoryThread).toHaveBeenCalledTimes(1);
    expect(saveMessageToMemory).toHaveBeenCalledTimes(2);
  });

  // The real MastraClient wraps server errors as `HTTP error! status: N -
  // <body>`, and Mastra phrases the failure several ways. The matcher must
  // catch the wrapped form and the "Thread not found: <id>" variant (mastra
  // harness), not just the bare "Thread <id> not found" production emits today.
  it.each([
    "Thread not found: conv_123",
    "Thread with id conv_123 not found",
    'HTTP error! status: 500 - {"message":"Thread not found: conv_123"}',
  ])("recovers from the wrapped/aliased not-found phrasing %j", async (message) => {
    const { client, saveMessageToMemory, createMemoryThread } = mockClient();
    saveMessageToMemory.mockRejectedValueOnce(new Error(message)).mockResolvedValueOnce({});

    await persistVoiceTurn(
      { userId: "u1", role: "user", text: "voice-first turn", threadKey: "conv_123" },
      { client },
    );

    expect(createMemoryThread).toHaveBeenCalledTimes(1);
    expect(saveMessageToMemory).toHaveBeenCalledTimes(2);
  });

  it("propagates non-thread-not-found save errors without creating a thread", async () => {
    const { client, saveMessageToMemory, createMemoryThread } = mockClient();
    saveMessageToMemory.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));

    await expect(
      persistVoiceTurn(
        { userId: "u1", role: "user", text: "hello", threadKey: "conv_123" },
        { client },
      ),
    ).rejects.toThrow(/ECONNREFUSED/);

    expect(createMemoryThread).not.toHaveBeenCalled();
    expect(saveMessageToMemory).toHaveBeenCalledTimes(1);
  });

  it("still retries the save when thread creation loses a concurrent-create race", async () => {
    const { client, saveMessageToMemory, createMemoryThread } = mockClient();
    saveMessageToMemory
      .mockRejectedValueOnce(new Error("Thread conv_123 not found"))
      .mockResolvedValueOnce({});
    createMemoryThread.mockRejectedValueOnce(new Error("Thread already exists"));

    const result = await persistVoiceTurn(
      { userId: "u1", role: "user", text: "raced turn", threadKey: "conv_123" },
      { client },
    );

    expect(saveMessageToMemory).toHaveBeenCalledTimes(2);
    expect(result.id).toBeTruthy();
  });

  it("propagates the failure when the retried save also fails", async () => {
    const { client, saveMessageToMemory } = mockClient();
    saveMessageToMemory.mockRejectedValue(new Error("Thread conv_123 not found"));

    await expect(
      persistVoiceTurn(
        { userId: "u1", role: "user", text: "doomed turn", threadKey: "conv_123" },
        { client },
      ),
    ).rejects.toThrow(/not found/);

    expect(saveMessageToMemory).toHaveBeenCalledTimes(2);
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
