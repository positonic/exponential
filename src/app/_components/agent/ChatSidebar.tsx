'use client';

import { useState } from 'react';
import { IconPlus, IconSearch, IconChevronDown, IconChevronRight, IconBrandWhatsapp } from '@tabler/icons-react';
import { TextInput, Avatar, Collapse } from '@mantine/core';
import { api } from '~/trpc/react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { WhatsAppGatewayModal } from '../WhatsAppGatewayModal';

interface ChatSidebarProps {
  onSelectConversation: (conversationId: string) => void;
  onSelectAgent: (agentName: string) => void;
  onSelectDefault?: () => void;
  onNewChat: () => void;
  activeConversationId?: string;
  activeAgentName?: string;
}

export function ChatSidebar({
  onSelectConversation,
  onSelectAgent,
  onSelectDefault,
  onNewChat,
  activeConversationId,
  activeAgentName
}: ChatSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [agentsExpanded, setAgentsExpanded] = useState(true); // Default expanded
  const [whatsappModalOpen, setWhatsappModalOpen] = useState(false);

  const { data: conversations } = api.aiInteraction.getConversationList.useQuery({
    search: searchQuery || undefined,
  });

  const { workspaceId } = useWorkspace();
  const { data: agents } = api.mastra.getMastraAgents.useQuery();
  const { data: customAssistant } = api.assistant.getDefault.useQuery(
    { workspaceId: workspaceId ?? '' },
    { enabled: !!workspaceId }
  );

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase();

  return (
    <nav className="w-64 shrink-0 border-r border-border-primary bg-background-primary">
      <div className="sticky top-0 h-screen overflow-y-auto p-4">
        {/* New Chat Button */}
        <button
          onClick={onNewChat}
          className="w-full flex items-center gap-2 px-3 py-2 mb-4 rounded-lg border border-border-primary text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-all"
        >
          <IconPlus size={16} />
          <span className="text-sm">New chat</span>
        </button>

        {/* Search Input */}
        <TextInput
          placeholder="Search chats..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          leftSection={<IconSearch size={14} className="text-text-muted" />}
          size="sm"
          className="mb-4"
          styles={{
            input: {
              backgroundColor: 'transparent',
              border: '1px solid var(--color-border-primary)',
              '&:focus': { borderColor: 'var(--color-border-focus)' },
            }
          }}
        />

        {/* Your Chats Section */}
        <div className="mb-6">
          <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
            Your Chats
          </h3>
          <ul className="space-y-1">
            {conversations?.map((conv) => {
              const isActive = conv.conversationId === activeConversationId;
              return (
                <li key={conv.conversationId}>
                  <button
                    onClick={() => onSelectConversation(conv.conversationId)}
                    className={`group relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200 text-left ${
                      isActive
                        ? "bg-surface-secondary text-text-primary font-medium"
                        : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                    }`}
                  >
                    {isActive && (
                      <div className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-blue-500" />
                    )}
                    <span className="truncate">{conv.title}</span>
                  </button>
                </li>
              );
            })}
            {(!conversations || conversations.length === 0) && (
              <li className="px-3 py-2 text-sm text-text-muted">
                No conversations yet
              </li>
            )}
          </ul>
        </div>

        {/* Custom Assistant */}
        {customAssistant && (
          <div className="mb-6">
            <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
              Your Assistant
            </h3>
            <ul className="space-y-1">
              <li>
                <button
                  onClick={onSelectDefault}
                  className={`group relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200 ${
                    activeAgentName === customAssistant.name
                      ? "bg-surface-secondary text-text-primary font-medium"
                      : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                  }`}
                >
                  {activeAgentName === customAssistant.name && (
                    <div className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-blue-500" />
                  )}
                  <Avatar size="sm" radius="xl" className={`ring-1 ${activeAgentName === customAssistant.name ? 'ring-blue-500' : 'ring-border-primary'}`}>
                    {customAssistant.emoji ?? getInitials(customAssistant.name)}
                  </Avatar>
                  <span className="truncate">{customAssistant.name}</span>
                  {activeAgentName === customAssistant.name && (
                    <span className="ml-auto text-xs text-blue-500">Active</span>
                  )}
                </button>
              </li>
            </ul>
          </div>
        )}

        {/* Available Agents Section (Collapsible) */}
        <div className="mb-6">
          <button
            onClick={() => setAgentsExpanded(!agentsExpanded)}
            className="w-full flex items-center justify-between mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-text-muted hover:text-text-secondary"
          >
            <span>Specialist Agents</span>
            {agentsExpanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
          </button>

          <Collapse in={agentsExpanded}>
            <ul className="space-y-1">
              {agents?.map((agent) => {
                const isActive = activeAgentName?.toLowerCase() === agent.name.toLowerCase();
                return (
                  <li key={agent.id}>
                    <button
                      onClick={() => onSelectAgent(agent.name)}
                      className={`group relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200 ${
                        isActive
                          ? "bg-surface-secondary text-text-primary font-medium"
                          : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                      }`}
                    >
                      {isActive && (
                        <div className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-blue-500" />
                      )}
                      <Avatar size="sm" radius="xl" className={`ring-1 ${isActive ? 'ring-blue-500' : 'ring-border-primary'}`}>
                        {getInitials(agent.name)}
                      </Avatar>
                      <span className="truncate">@{agent.name}</span>
                      {isActive && (
                        <span className="ml-auto text-xs text-blue-500">Active</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Collapse>
        </div>

        {/* WhatsApp Connection */}
        <div className="mb-6">
          <button
            onClick={() => setWhatsappModalOpen(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            <IconBrandWhatsapp size={16} className="text-green-500" />
            <span>Connect WhatsApp</span>
          </button>
        </div>

        <WhatsAppGatewayModal
          opened={whatsappModalOpen}
          onClose={() => setWhatsappModalOpen(false)}
        />
      </div>
    </nav>
  );
}
