'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Modal, Drawer, Menu, ActionIcon, Tooltip, Avatar } from '@mantine/core';
import { IconPlus, IconFolder, IconChevronDown, IconBuilding, IconHistory, IconArrowsMaximize, IconArrowsMinimize } from '@tabler/icons-react';
import { useAgentModal, type ChatMessage, type ChatDisplayMode } from '~/providers/AgentModalProvider';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { api } from '~/trpc/react';

// Dynamic import to prevent Vercel build timeout - ManyChat has 1000+ lines with complex tRPC types
const ManyChat = dynamic(() => import('../ManyChat'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <div className="animate-pulse text-text-muted">Loading chat...</div>
    </div>
  )
});

function AgentChatModalHeader({
  activeAgentName,
  onSelectAgent,
  onSelectDefault,
  onSelectConversation,
  displayMode,
  onToggleDisplayMode,
}: {
  activeAgentName: string;
  onSelectAgent: (name: string) => void;
  onSelectDefault: () => void;
  onSelectConversation: (convId: string) => void;
  displayMode: ChatDisplayMode;
  onToggleDisplayMode: () => void;
}) {
  const { isOpen, workspaceId: overrideWorkspaceId, setWorkspaceId, projectId, setProjectId, conversationId, clearChat } = useAgentModal();
  const { workspaceId: urlWorkspaceId } = useWorkspace();
  const effectiveWorkspaceId = overrideWorkspaceId ?? urlWorkspaceId;

  const { data: workspaces } = api.workspace.list.useQuery(undefined, {
    enabled: isOpen,
  });

  const { data: projects } = api.project.getAll.useQuery(
    { workspaceId: effectiveWorkspaceId ?? undefined },
    { enabled: !!effectiveWorkspaceId && isOpen }
  );

  const { data: customAssistant } = api.assistant.getDefault.useQuery(
    { workspaceId: effectiveWorkspaceId ?? '' },
    { enabled: !!effectiveWorkspaceId && isOpen }
  );

  const { data: agents } = api.mastra.getMastraAgents.useQuery(undefined, {
    enabled: isOpen,
    staleTime: 10 * 60 * 1000,
  });

  const { data: conversations } = api.aiInteraction.getConversationList.useQuery(
    { limit: 15 },
    { enabled: isOpen }
  );

  const selectedWorkspaceName = workspaces?.find(w => w.id === effectiveWorkspaceId)?.name ?? 'Workspace';
  const selectedProjectName = projectId
    ? projects?.find(p => p.id === projectId)?.name ?? 'Project'
    : 'No project';

  const handleWorkspaceChange = useCallback((wsId: string) => {
    setWorkspaceId(wsId);
    setProjectId(null); // Projects are workspace-scoped
  }, [setWorkspaceId, setProjectId]);

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase();

  const formatRelativeTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - new Date(date).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  return (
    <div className="flex flex-shrink-0 items-center justify-between gap-1 border-b border-border-primary px-2 py-1.5">
      {/* Left: Workspace / Project selectors */}
      <div className="flex min-w-0 items-center gap-0.5">
        {/* Workspace selector */}
        <Menu shadow="md" width={220}>
          <Menu.Target>
            <button className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary">
              <IconBuilding size={13} className="flex-shrink-0 text-text-muted" />
              <span className="max-w-[100px] truncate">{selectedWorkspaceName}</span>
              <IconChevronDown size={10} className="flex-shrink-0 text-text-muted" />
            </button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>Workspace</Menu.Label>
            {workspaces?.map(ws => (
              <Menu.Item
                key={ws.id}
                onClick={() => handleWorkspaceChange(ws.id)}
                className={effectiveWorkspaceId === ws.id ? 'bg-surface-secondary' : ''}
              >
                {ws.name}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>

        <span className="text-text-muted text-xs">/</span>

        {/* Project selector */}
        <Menu shadow="md" width={220}>
          <Menu.Target>
            <button className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary">
              <IconFolder size={13} className="flex-shrink-0 text-text-muted" />
              <span className="max-w-[120px] truncate">{selectedProjectName}</span>
              <IconChevronDown size={10} className="flex-shrink-0 text-text-muted" />
            </button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>Project Context</Menu.Label>
            <Menu.Item
              onClick={() => setProjectId(null)}
              className={!projectId ? 'bg-surface-secondary' : ''}
            >
              General (no project)
            </Menu.Item>
            <Menu.Divider />
            {projects?.map(project => (
              <Menu.Item
                key={project.id}
                onClick={() => setProjectId(project.id)}
                className={projectId === project.id ? 'bg-surface-secondary' : ''}
              >
                {project.name}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      </div>

      {/* Right: Agent selector + Conversation history + New Chat + Expand/Collapse */}
      <div className="flex items-center gap-1">
        {/* Agent selector */}
        <Menu shadow="md" width={200}>
          <Menu.Target>
            <button className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary">
              <Avatar size={16} radius="xl" className="flex-shrink-0">
                {activeAgentName === customAssistant?.name && customAssistant.emoji
                  ? customAssistant.emoji
                  : getInitials(activeAgentName)}
              </Avatar>
              <span className="max-w-[80px] truncate">{activeAgentName}</span>
              <IconChevronDown size={10} className="flex-shrink-0 text-text-muted" />
            </button>
          </Menu.Target>
          <Menu.Dropdown>
            {customAssistant && (
              <>
                <Menu.Label>Your Assistant</Menu.Label>
                <Menu.Item
                  onClick={onSelectDefault}
                  leftSection={
                    <Avatar size="xs" radius="xl">
                      {customAssistant.emoji ?? getInitials(customAssistant.name)}
                    </Avatar>
                  }
                  className={activeAgentName === customAssistant.name ? 'bg-surface-secondary' : ''}
                >
                  {customAssistant.name}
                </Menu.Item>
                <Menu.Divider />
              </>
            )}
            <Menu.Label>Specialist Agents</Menu.Label>
            {agents?.map(agent => (
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

        {/* Conversation history selector */}
        <Menu shadow="md" width={280}>
          <Menu.Target>
            <Tooltip label="Conversation history" position="bottom">
              <ActionIcon
                variant="subtle"
                size="sm"
                className="text-text-secondary hover:text-text-primary"
              >
                <IconHistory size={16} />
              </ActionIcon>
            </Tooltip>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>Recent Conversations</Menu.Label>
            {(!conversations || conversations.length === 0) && (
              <Menu.Item disabled>No conversations yet</Menu.Item>
            )}
            {conversations?.map(conv => (
              <Menu.Item
                key={conv.conversationId}
                onClick={() => onSelectConversation(conv.conversationId)}
                className={conversationId === conv.conversationId ? 'bg-surface-secondary' : ''}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="truncate text-sm">{conv.title}</span>
                  <span className="text-xs text-text-muted">
                    {conv.agentName ? `${conv.agentName} · ` : ''}{formatRelativeTime(conv.lastActivity)}
                  </span>
                </div>
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>

        {/* New Chat button */}
        <Tooltip label="New chat" position="bottom">
          <ActionIcon
            variant="subtle"
            size="sm"
            onClick={clearChat}
            className="text-text-secondary hover:text-text-primary"
          >
            <IconPlus size={16} />
          </ActionIcon>
        </Tooltip>

        {/* Expand/Collapse toggle */}
        <Tooltip label={displayMode === 'panel' ? 'Expand to full view' : 'Collapse to side panel'} position="bottom">
          <ActionIcon
            variant="subtle"
            size="sm"
            onClick={onToggleDisplayMode}
            className="text-text-secondary hover:text-text-primary"
          >
            {displayMode === 'panel' ? <IconArrowsMaximize size={16} /> : <IconArrowsMinimize size={16} />}
          </ActionIcon>
        </Tooltip>
      </div>
    </div>
  );
}

export function AgentChatModal() {
  const { isOpen, displayMode, toggleDisplayMode, workspaceId: overrideWorkspaceId, projectId, messages, conversationId, loadConversation, closeModal } = useAgentModal();
  const { workspaceId: urlWorkspaceId } = useWorkspace();
  const effectiveWorkspaceId = overrideWorkspaceId ?? urlWorkspaceId;

  // Persistent agent selection — dropdown switches the default agent for all messages
  const [defaultAgent, setDefaultAgent] = useState<{ id: string; name: string } | null>(null);

  // Conversation loading state (same pattern as AgentChatPage)
  const [loadingConversationId, setLoadingConversationId] = useState<string | null>(null);

  // Fetch custom assistant to determine default agent name
  const { data: customAssistant } = api.assistant.getDefault.useQuery(
    { workspaceId: effectiveWorkspaceId ?? '' },
    { enabled: !!effectiveWorkspaceId && isOpen }
  );

  // Fetch agents list to resolve name→id for dropdown selection
  const { data: agents } = api.mastra.getMastraAgents.useQuery(undefined, {
    enabled: isOpen,
    staleTime: 10 * 60 * 1000,
  });

  // Determine active agent: dropdown selection takes priority, then last AI message, then defaults
  const activeAgentName = useMemo(() => {
    if (defaultAgent) return defaultAgent.name;
    const lastAiMessage = [...messages].reverse().find(
      m => m.type === 'ai' && m.agentName && m.agentName !== 'System Error'
    );
    return lastAiMessage?.agentName ?? customAssistant?.name ?? 'Zoe';
  }, [defaultAgent, messages, customAssistant?.name]);

  // Fetch conversation history when loading a previous conversation
  const { data: conversationHistory } = api.aiInteraction.getConversationHistory.useQuery(
    { conversationId: loadingConversationId! },
    {
      enabled: !!loadingConversationId,
      refetchOnWindowFocus: false,
    }
  );

  // Load conversation when history is fetched
  useEffect(() => {
    if (conversationHistory && loadingConversationId) {
      const msgs: ChatMessage[] = conversationHistory.flatMap(h => [
        { type: 'human' as const, content: h.userMessage },
        { type: 'ai' as const, content: h.aiResponse, agentName: h.agentName ?? undefined },
      ]);
      loadConversation(loadingConversationId, msgs);
      setLoadingConversationId(null);
    }
  }, [conversationHistory, loadingConversationId, loadConversation]);

  const handleSelectConversation = useCallback((convId: string) => {
    if (convId === conversationId) return;
    setLoadingConversationId(convId);
  }, [conversationId]);

  const handleSelectAgent = useCallback((agentName: string) => {
    const agent = agents?.find(a => a.name.toLowerCase() === agentName.toLowerCase());
    if (agent) {
      setDefaultAgent({ id: agent.id, name: agent.name });
    }
  }, [agents]);

  const handleSelectDefault = useCallback(() => {
    setDefaultAgent(null);
  }, []);

  const chatContent = (
    <div className="flex h-full flex-col overflow-hidden">
      {isOpen && (
        <AgentChatModalHeader
          activeAgentName={activeAgentName}
          onSelectAgent={handleSelectAgent}
          onSelectDefault={handleSelectDefault}
          onSelectConversation={handleSelectConversation}
          displayMode={displayMode}
          onToggleDisplayMode={toggleDisplayMode}
        />
      )}
      {loadingConversationId && (
        <div className="flex items-center justify-center py-2 text-xs text-text-muted">
          Loading conversation...
        </div>
      )}
      <div className="min-h-0 flex-1">
        <ManyChat
          projectId={projectId ?? undefined}
          workspaceId={effectiveWorkspaceId ?? undefined}
          defaultAgentId={defaultAgent?.id}
        />
      </div>
    </div>
  );

  return (
    <>
      {/* Side Panel (Drawer) */}
      <Drawer
        opened={isOpen && displayMode === 'panel'}
        onClose={closeModal}
        position="right"
        size={420}
        trapFocus={false}
        lockScroll={false}
        withOverlay={false}
        withCloseButton={false}
        padding={0}
        styles={{
          content: {
            backgroundColor: 'var(--color-bg-modal)',
            borderLeft: '1px solid var(--color-border-primary)',
            display: 'flex',
            flexDirection: 'column',
          },
          body: {
            padding: 0,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
          },
        }}
      >
        {chatContent}
      </Drawer>

      {/* Full Modal */}
      <Modal
        opened={isOpen && displayMode === 'modal'}
        onClose={closeModal}
        centered
        size="700px"
        radius="lg"
        padding={0}
        withCloseButton={false}
        overlayProps={{
          backgroundOpacity: 0.7,
          blur: 4,
        }}
        styles={{
          content: {
            backgroundColor: 'var(--color-bg-modal)',
            border: '1px solid var(--color-border-primary)',
            height: '80vh',
            maxHeight: '800px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          },
          body: {
            padding: 0,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
          },
        }}
      >
        {chatContent}
      </Modal>
    </>
  );
}
