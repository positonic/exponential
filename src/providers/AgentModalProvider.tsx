'use client';

import { createContext, useContext, useState, useCallback, useEffect, useMemo, type PropsWithChildren, type Dispatch, type SetStateAction } from 'react';

// sessionStorage keys for per-tab isolation (prevents context bleeding between tabs)
const CHAT_STORAGE_KEY = 'agent-chat-messages';
const CONVERSATION_STORAGE_KEY = 'agent-chat-conversation-id';

// Message type shared between provider and ManyChat
export interface ChatMessage {
  type: 'system' | 'human' | 'ai' | 'tool';
  content: string;
  tool_call_id?: string;
  name?: string;
  agentName?: string;
  interactionId?: string;
}

// Page context for giving the agent awareness of the current page
export interface PageContext {
  pageType: string;
  pageTitle: string;
  pagePath: string;
  data: Record<string, unknown>;
}

// Default system message for the chat (generic — ManyChat overrides with custom assistant name)
const DEFAULT_SYSTEM_MESSAGE: ChatMessage = {
  type: 'system',
  content: `You are an AI companion. You are a coordinator managing a multi-agent conversation.
            Route user requests to the appropriate specialized agent if necessary.
            Keep track of the conversation flow between the user and multiple AI agents.`
};

// Default welcome message (will be replaced when custom assistant loads)
const DEFAULT_WELCOME_MESSAGE: ChatMessage = {
  type: 'ai',
  agentName: 'Assistant',
  content: `Hey! I'm here to help you move forward — whether that's figuring out what to focus on today, breaking down a project, or just thinking something through. Tag other agents with @ if you need a specialist.

What's up?`
};

interface AgentModalContextValue {
  isOpen: boolean;
  workspaceId: string | null;
  setWorkspaceId: Dispatch<SetStateAction<string | null>>;
  projectId: string | null;
  setProjectId: Dispatch<SetStateAction<string | null>>;
  pageContext: PageContext | null;
  setPageContext: (context: PageContext | null) => void;
  messages: ChatMessage[];
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  conversationId: string;
  setConversationId: Dispatch<SetStateAction<string>>;
  openModal: (projectId?: string) => void;
  closeModal: () => void;
  clearChat: () => void;
  loadConversation: (conversationId: string, messages: ChatMessage[]) => void;
}

const AgentModalContext = createContext<AgentModalContextValue>({
  isOpen: false,
  workspaceId: null,
  setWorkspaceId: () => undefined,
  projectId: null,
  setProjectId: () => undefined,
  pageContext: null,
  setPageContext: () => undefined,
  messages: [DEFAULT_SYSTEM_MESSAGE, DEFAULT_WELCOME_MESSAGE],
  setMessages: () => undefined,
  conversationId: '',
  setConversationId: () => undefined,
  openModal: () => undefined,
  closeModal: () => undefined,
  clearChat: () => undefined,
  loadConversation: () => undefined,
});

export function useAgentModal() {
  return useContext(AgentModalContext);
}

export function AgentModalProvider({ children }: PropsWithChildren) {
  const [isOpen, setIsOpen] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [pageContext, setPageContextState] = useState<PageContext | null>(null);

  const setPageContext = useCallback((context: PageContext | null) => {
    setPageContextState(context);
  }, []);

  // Always initialize with defaults for SSR/hydration consistency.
  // sessionStorage values are loaded in a useEffect after hydration.
  const [messages, setMessages] = useState<ChatMessage[]>(
    [DEFAULT_SYSTEM_MESSAGE, DEFAULT_WELCOME_MESSAGE]
  );

  const [conversationId, setConversationId] = useState<string>('');

  // Hydrate state from sessionStorage after mount (per-tab, avoids SSR mismatch)
  useEffect(() => {
    const storedMessages = sessionStorage.getItem(CHAT_STORAGE_KEY);
    if (storedMessages) {
      try {
        setMessages(JSON.parse(storedMessages) as ChatMessage[]);
      } catch {
        // Invalid stored data; keep defaults
      }
    }

    const storedConvId = sessionStorage.getItem(CONVERSATION_STORAGE_KEY);
    if (storedConvId) {
      setConversationId(storedConvId);
    }
  }, []);

  // Sync messages to sessionStorage when they change (debounced to avoid thrashing during streaming)
  useEffect(() => {
    const timer = setTimeout(() => {
      sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
    }, 500);
    return () => clearTimeout(timer);
  }, [messages]);

  // Sync conversationId to sessionStorage when it changes
  useEffect(() => {
    if (conversationId) {
      sessionStorage.setItem(CONVERSATION_STORAGE_KEY, conversationId);
    }
  }, [conversationId]);

  const openModal = useCallback((projectId?: string) => {
    setProjectId(projectId ?? null);
    setIsOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    // Keep projectId until next open so animations can complete
  }, []);

  const clearChat = useCallback(() => {
    setMessages([DEFAULT_SYSTEM_MESSAGE, DEFAULT_WELCOME_MESSAGE]);
    setConversationId('');
    sessionStorage.removeItem(CHAT_STORAGE_KEY);
    sessionStorage.removeItem(CONVERSATION_STORAGE_KEY);
  }, []);

  const loadConversation = useCallback((newConversationId: string, newMessages: ChatMessage[]) => {
    // Prepend system message to loaded messages
    const messagesWithSystem = [DEFAULT_SYSTEM_MESSAGE, ...newMessages];
    setConversationId(newConversationId);
    setMessages(messagesWithSystem);
    sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messagesWithSystem));
    sessionStorage.setItem(CONVERSATION_STORAGE_KEY, newConversationId);
  }, []);

  const value: AgentModalContextValue = useMemo(() => ({
    isOpen,
    workspaceId,
    setWorkspaceId,
    projectId,
    setProjectId,
    pageContext,
    setPageContext,
    messages,
    setMessages,
    conversationId,
    setConversationId,
    openModal,
    closeModal,
    clearChat,
    loadConversation,
  }), [
    isOpen,
    workspaceId,
    setWorkspaceId,
    projectId,
    setProjectId,
    pageContext,
    setPageContext,
    messages,
    conversationId,
    openModal,
    closeModal,
    clearChat,
    loadConversation,
  ]);

  return (
    <AgentModalContext.Provider value={value}>
      {children}
    </AgentModalContext.Provider>
  );
}
