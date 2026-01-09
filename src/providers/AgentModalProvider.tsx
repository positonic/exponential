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

// Default system message for the chat
const DEFAULT_SYSTEM_MESSAGE: ChatMessage = {
  type: 'system',
  content: `Your name is Paddy the project manager. You are a coordinator managing a multi-agent conversation.
            Route user requests to the appropriate specialized agent if necessary.
            Keep track of the conversation flow between the user and multiple AI agents.`
};

// Default welcome message from Paddy
const DEFAULT_WELCOME_MESSAGE: ChatMessage = {
  type: 'ai',
  agentName: 'Paddy',
  content: `Hello! I'm Paddy, your project manager. I'll be your default assistant here.

I can help with project management, task coordination, and can connect you with other specialized agents when needed. Just mention them with @ to speak with them directly.

How can I help you today?`
};

interface AgentModalContextValue {
  isOpen: boolean;
  projectId: string | null;
  messages: ChatMessage[];
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  conversationId: string;
  setConversationId: Dispatch<SetStateAction<string>>;
  openModal: (projectId?: string) => void;
  closeModal: () => void;
  clearChat: () => void;
}

const AgentModalContext = createContext<AgentModalContextValue>({
  isOpen: false,
  projectId: null,
  messages: [DEFAULT_SYSTEM_MESSAGE, DEFAULT_WELCOME_MESSAGE],
  setMessages: () => undefined,
  conversationId: '',
  setConversationId: () => undefined,
  openModal: () => undefined,
  closeModal: () => undefined,
  clearChat: () => undefined,
});

export function useAgentModal() {
  return useContext(AgentModalContext);
}

export function AgentModalProvider({ children }: PropsWithChildren) {
  const [isOpen, setIsOpen] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);

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

  const value: AgentModalContextValue = {
    isOpen,
    projectId,
    messages,
    setMessages,
    conversationId,
    setConversationId,
    openModal,
    closeModal,
    clearChat,
  };

  return (
    <AgentModalContext.Provider value={value}>
      {children}
    </AgentModalContext.Provider>
  );
}
