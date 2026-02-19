# PRD: Agent Conversation Thread Isolation

## Problem Statement

Agent conversations are leaking context between separate browser tabs. When a user has two chat sessions open simultaneously, the agent in one tab responds with context from the other tab's conversation. This creates a confusing and broken user experience where the agent appears to hallucinate or mix up topics.

### Observed Behavior

- **Tab 1**: User asks agent to "fetch the backlog from the NRC Notion." Agent responds about Gmail integration debugging, empty email results, and GitHub access — topics from Tab 2.
- **Tab 2**: User asks agent to find an email ("Your application at w3.hub"). Agent searches for emails, finds nothing, and discusses fixing the email integration code.

The agent in Tab 1 is clearly injecting context from Tab 2's conversation.

### Impact

- **User trust**: Users cannot rely on the agent when it mixes unrelated topics
- **Data leakage**: Conversation content from one context surfaces in another
- **Usability**: Multi-tab workflows are broken — users who work across multiple topics simultaneously hit this consistently

## Root Cause Analysis

### Primary: Shared Thread ID via `localStorage`

The `AgentModalProvider` (`src/providers/AgentModalProvider.tsx`) persists the current `conversationId` in `localStorage` under key `'agent-chat-conversation-id'`. `localStorage` is shared across all tabs of the same origin.

**The sequence:**

1. User opens Tab 1, starts a conversation. A `conversationId` (e.g., `conv_abc123`) is generated and stored in `localStorage`.
2. User opens Tab 2. On mount, `AgentModalProvider` hydrates state from `localStorage` → reads `conv_abc123`.
3. `ManyChat` component checks `if (!conversationId)` before creating a new conversation — since it inherited `conv_abc123`, it skips creation.
4. Both tabs now send messages to `/api/chat/stream` with the **same `conversationId`**.
5. The stream route passes this to Mastra as `memory.thread: conversationId` — Mastra stores and retrieves conversation memory for both tabs in the **same thread**.

**Relevant code path:**

```
AgentModalProvider (localStorage read)
  → ManyChat (skips new conversation if ID exists)
    → /api/chat/stream (passes conversationId)
      → Mastra agent.stream({ memory: { resource: userId, thread: conversationId } })
        → Mastra Memory (retrieves thread history + observational memory)
```

### Secondary: Resource-Scoped Observational Memory

Mastra's memory is configured with `observationalMemory.scope: 'resource'` (`../mastra/src/mastra/memory/index.ts`). Per the [Mastra documentation](https://mastra.ai/docs/memory/observational-memory), resource scope is **experimental** and deliberately shares AI observations across all threads for a user.

This means the Observer compresses conversation messages into observations (e.g., "user is debugging Gmail integration, getting empty email results"), and these observations are injected into **every** conversation for that user, regardless of which thread they originated from.

**Decision**: Keep resource scope for now. The thread ID fix (primary cause) resolves the most severe symptom — full message history mixing. Observation-level bleed is softer and may actually be desirable for a "personal assistant that knows you" experience. This will be revisited as a separate product decision.

## Solution: Per-Tab Conversation Isolation

### Approach

Switch `conversationId` persistence from `localStorage` (shared across tabs) to `sessionStorage` (isolated per tab). Each tab gets its own conversation thread automatically.

### Changes Required

#### 1. `src/providers/AgentModalProvider.tsx`

**Switch conversationId storage to sessionStorage:**

- Change all `localStorage.getItem(CONVERSATION_STORAGE_KEY)` → `sessionStorage.getItem(CONVERSATION_STORAGE_KEY)`
- Change all `localStorage.setItem(CONVERSATION_STORAGE_KEY, ...)` → `sessionStorage.setItem(CONVERSATION_STORAGE_KEY, ...)`
- Change `localStorage.removeItem(CONVERSATION_STORAGE_KEY)` → `sessionStorage.removeItem(CONVERSATION_STORAGE_KEY)`

**Handle fresh-tab hydration:**

When a new tab opens, `sessionStorage` will be empty for `conversationId`. However, `localStorage` may still have stale messages from another tab's conversation. The hydration logic must detect this mismatch and start fresh:

```typescript
// In the hydration useEffect:
const storedConvId = sessionStorage.getItem(CONVERSATION_STORAGE_KEY);
if (storedConvId) {
  // Same tab, resuming — load both conversationId and messages
  setConversationId(storedConvId);
  const storedMessages = localStorage.getItem(CHAT_STORAGE_KEY);
  if (storedMessages) {
    try {
      setMessages(JSON.parse(storedMessages) as ChatMessage[]);
    } catch { /* keep defaults */ }
  }
} else {
  // New tab — start fresh, don't load stale messages from another tab
  // Defaults are already in place from useState initializer
}
```

**Message persistence stays in localStorage:**

Messages remain in `localStorage` so the chat modal persists across page navigation within the same tab. The key insight is that `sessionStorage` persists for the lifetime of a tab (including navigation within that tab), so conversationId stays valid throughout a user's session.

#### 2. No changes to `src/app/_components/ManyChat.tsx`

The existing logic at lines 486-490 already handles the empty-conversationId case correctly:

```typescript
if (!conversationId) {
  void initConversation(); // Creates a new conversation via tRPC
}
```

With `sessionStorage`, a new tab will have an empty `conversationId` → this triggers new conversation creation automatically.

#### 3. No changes to `src/app/api/chat/stream/route.ts`

The server-side code correctly uses whatever `conversationId` the client sends. The fix is entirely client-side.

#### 4. No changes to `../mastra/src/mastra/memory/index.ts`

Per the decision to keep `resource` scope for observational memory.

## Edge Cases & Considerations

### Modal chat vs full page chat

Both use the same `AgentModalProvider` context. The fix applies to both — the modal and the full chat page within a single tab share the same `sessionStorage` conversationId, which is correct behavior (they're the same conversation in the same tab).

### Page refresh within a tab

`sessionStorage` persists across page refreshes within the same tab. The conversation continues correctly.

### "New Chat" button

The `clearChat()` function already clears the conversationId. With the fix, it clears from `sessionStorage`. The next message triggers a new `startConversation` call.

### Loading previous conversations from sidebar

`loadConversation()` sets a new conversationId. With the fix, this writes to `sessionStorage`. This correctly scopes the loaded conversation to the current tab.

### Browser tab duplication (Cmd+D / Ctrl+D)

When duplicating a tab, browsers copy `sessionStorage` to the new tab. This means a duplicated tab would share the same conversationId initially. This is acceptable — the user explicitly duplicated the tab, so they'd expect to see the same conversation. They can click "New Chat" to start fresh.

## Verification Plan

1. **Multi-tab isolation**: Open two chat tabs → have different conversations → verify no context bleeding
2. **Within-tab persistence**: Navigate between pages → reopen chat modal → conversation should persist
3. **New Chat**: Click "New Chat" → verify new conversationId generated → old context gone
4. **Conversation loading**: Load a previous conversation from sidebar → verify it works correctly
5. **Page refresh**: Refresh a tab mid-conversation → verify conversation resumes
6. **Server logs**: Check `console.log` at `route.ts:193` → verify different conversationIds for different tabs

## Future Considerations

- **Observational memory scope**: Consider switching from `resource` to `thread` scope if users report softer forms of context bleed (observation-level rather than full message history). This is a product decision about whether the agent should "know you" across conversations.
- **Cross-tab conversation list**: Consider showing active conversations across all tabs in the sidebar, so users can see what's happening in other tabs.
- **Tab-aware conversation management**: Consider a more sophisticated approach where the conversation list knows about per-tab sessions.
