'use client';

import { createContext, useContext, useState, useCallback, useEffect, type PropsWithChildren, type Dispatch, type SetStateAction } from 'react';

// localStorage keys for persistence across tabs
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

// Default system message for the chat
const DEFAULT_SYSTEM_MESSAGE: ChatMessage = {
  type: 'system',
  content: `Your name is Zoe, an AI companion. You are a coordinator managing a multi-agent conversation.
            Route user requests to the appropriate specialized agent if necessary.
            Keep track of the conversation flow between the user and multiple AI agents.`
};

// Default welcome message from Zoe
const DEFAULT_WELCOME_MESSAGE: ChatMessage = {
  type: 'ai',
  agentName: 'Zoe',
  content: `Hey! I'm Zoe 🔮

I'm here to help you move forward — whether that's figuring out what to focus on today, breaking down a project, or just thinking something through. Tag other agents with @ if you need a specialist.

What's up?`
};

interface AgentModalContextValue {
  isOpen: boolean;
  projectId: string | null;
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
  projectId: null,
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
  const [projectId, setProjectId] = useState<string | null>(null);
  const [pageContext, setPageContextState] = useState<PageContext | null>(null);

  const setPageContext = useCallback((context: PageContext | null) => {
    setPageContextState(context);
  }, []);

  // Initialize messages from localStorage (with SSR safety)
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (typeof window === 'undefined') return [DEFAULT_SYSTEM_MESSAGE, DEFAULT_WELCOME_MESSAGE];
    const stored = localStorage.getItem(CHAT_STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored) as ChatMessage[];
      } catch {
        return [DEFAULT_SYSTEM_MESSAGE, DEFAULT_WELCOME_MESSAGE];
      }
    }
    return [DEFAULT_SYSTEM_MESSAGE, DEFAULT_WELCOME_MESSAGE];
  });

  // Initialize conversationId from localStorage (with SSR safety)
  const [conversationId, setConversationId] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem(CONVERSATION_STORAGE_KEY) ?? '';
  });

  // Sync messages to localStorage when they change
  useEffect(() => {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  // Sync conversationId to localStorage when it changes
  useEffect(() => {
    if (conversationId) {
      localStorage.setItem(CONVERSATION_STORAGE_KEY, conversationId);
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
    localStorage.removeItem(CHAT_STORAGE_KEY);
    localStorage.removeItem(CONVERSATION_STORAGE_KEY);
  }, []);

  const loadConversation = useCallback((newConversationId: string, newMessages: ChatMessage[]) => {
    // Prepend system message to loaded messages
    const messagesWithSystem = [DEFAULT_SYSTEM_MESSAGE, ...newMessages];
    setConversationId(newConversationId);
    setMessages(messagesWithSystem);
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messagesWithSystem));
    localStorage.setItem(CONVERSATION_STORAGE_KEY, newConversationId);
  }, []);

  const value: AgentModalContextValue = {
    isOpen,
    projectId,
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
  };

  return (
    <AgentModalContext.Provider value={value}>
      {children}
    </AgentModalContext.Provider>
  );
}
