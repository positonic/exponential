'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ChatSidebar } from './agent/ChatSidebar';
import ManyChat from './ManyChat';
import { useAgentModal, type ChatMessage } from '~/providers/AgentModalProvider';
import { api } from '~/trpc/react';
import { Avatar, Menu } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';

// Agent header component with dropdown selector
function AgentHeader({
  activeAgentName,
  onSelectAgent
}: {
  activeAgentName: string;
  onSelectAgent: (name: string) => void;
}) {
  const { data: agents } = api.mastra.getMastraAgents.useQuery();

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase();

  return (
    <div className="flex-shrink-0 border-b border-border-primary bg-background-primary px-4 py-3">
      <Menu shadow="md" width={200}>
        <Menu.Target>
          <button className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-hover transition-colors">
            <Avatar size="sm" radius="xl" className="ring-2 ring-blue-500">
              {getInitials(activeAgentName)}
            </Avatar>
            <div className="flex flex-col items-start">
              <span className="text-sm font-medium text-text-primary">
                {activeAgentName}
              </span>
              <span className="text-xs text-text-muted">Active agent</span>
            </div>
            <IconChevronDown size={16} className="text-text-muted ml-2" />
          </button>
        </Menu.Target>

        <Menu.Dropdown>
          <Menu.Label>Switch Agent</Menu.Label>
          {agents?.map((agent) => (
            <Menu.Item
              key={agent.id}
              onClick={() => onSelectAgent(agent.name)}
              leftSection={
                <Avatar size="xs" radius="xl">
                  {getInitials(agent.name)}
                </Avatar>
              }
              className={activeAgentName.toLowerCase() === agent.name.toLowerCase() ? 'bg-surface-secondary' : ''}
            >
              @{agent.name}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    </div>
  );
}

export function AgentChatPage() {
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [loadingConversationId, setLoadingConversationId] = useState<string | null>(null);
  const { conversationId, loadConversation, clearChat, messages } = useAgentModal();

  // Determine active agent from last AI message in conversation
  const activeAgentName = useMemo(() => {
    const lastAiMessage = [...messages].reverse().find(m => m.type === 'ai' && m.agentName);
    return lastAiMessage?.agentName ?? 'Zoe';
  }, [messages]);

  // Query for conversation history when we want to load a specific conversation
  const { data: conversationHistory, isLoading: isLoadingHistory } = api.aiInteraction.getConversationHistory.useQuery(
    { conversationId: loadingConversationId! },
    {
      enabled: !!loadingConversationId,
      refetchOnWindowFocus: false,
    }
  );

  // Effect to load conversation when history is fetched
  useEffect(() => {
    if (conversationHistory && loadingConversationId) {
      // Convert to ChatMessage format
      const messages: ChatMessage[] = conversationHistory.flatMap(h => [
        { type: 'human' as const, content: h.userMessage },
        { type: 'ai' as const, content: h.aiResponse, agentName: h.agentName ?? undefined },
      ]);
      loadConversation(loadingConversationId, messages);
      setLoadingConversationId(null);
    }
  }, [conversationHistory, loadingConversationId, loadConversation]);

  const handleSelectConversation = useCallback((convId: string) => {
    if (convId === conversationId) return;
    setLoadingConversationId(convId);
  }, [conversationId]);

  const handleSelectAgent = useCallback((agentName: string) => {
    setSelectedAgent(`@${agentName} `);
  }, []);

  const handleNewChat = useCallback(() => {
    clearChat();
    setSelectedAgent('');
  }, [clearChat]);

  // Clear selected agent after it's used
  useEffect(() => {
    if (selectedAgent) {
      const timer = setTimeout(() => setSelectedAgent(''), 100);
      return () => clearTimeout(timer);
    }
  }, [selectedAgent]);

  return (
    <div className="-m-4 lg:-m-8 flex h-screen">
      <ChatSidebar
        onSelectConversation={handleSelectConversation}
        onSelectAgent={handleSelectAgent}
        onNewChat={handleNewChat}
        activeConversationId={conversationId}
        activeAgentName={activeAgentName}
      />
      <div className="flex-1 flex flex-col relative">
        {/* Agent Selector Header */}
        <AgentHeader
          activeAgentName={activeAgentName}
          onSelectAgent={handleSelectAgent}
        />

        {isLoadingHistory && (
          <div className="absolute inset-0 bg-background-primary/50 flex items-center justify-center z-10">
            <div className="text-text-muted">Loading conversation...</div>
          </div>
        )}
        <ManyChat initialInput={selectedAgent} />
      </div>
    </div>
  );
}
