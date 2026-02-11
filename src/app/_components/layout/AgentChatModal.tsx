'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Modal, Menu, ActionIcon, Tooltip, Avatar } from '@mantine/core';
import { IconPlus, IconFolder, IconChevronDown, IconBuilding } from '@tabler/icons-react';
import { useAgentModal } from '~/providers/AgentModalProvider';
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
}: {
  activeAgentName: string;
  onSelectAgent: (name: string) => void;
  onSelectDefault: () => void;
}) {
  const { isOpen, workspaceId: overrideWorkspaceId, setWorkspaceId, projectId, setProjectId, clearChat } = useAgentModal();
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

  const selectedWorkspaceName = workspaces?.find(w => w.id === effectiveWorkspaceId)?.name ?? 'Workspace';
  const selectedProjectName = projectId
    ? projects?.find(p => p.id === projectId)?.name ?? 'Project'
    : 'No project';

  const handleWorkspaceChange = useCallback((wsId: string) => {
    setWorkspaceId(wsId);
    setProjectId(null); // Projects are workspace-scoped
  }, [setWorkspaceId, setProjectId]);

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase();

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

      {/* Right: Agent selector + New Chat */}
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
      </div>
    </div>
  );
}

export function AgentChatModal() {
  const { isOpen, workspaceId: overrideWorkspaceId, projectId, messages, closeModal } = useAgentModal();
  const { workspaceId: urlWorkspaceId } = useWorkspace();
  const effectiveWorkspaceId = overrideWorkspaceId ?? urlWorkspaceId;

  // Agent selection state (same pattern as AgentChatPage)
  const [selectedAgent, setSelectedAgent] = useState<string>('');

  // Fetch custom assistant to determine default agent name
  const { data: customAssistant } = api.assistant.getDefault.useQuery(
    { workspaceId: effectiveWorkspaceId ?? '' },
    { enabled: !!effectiveWorkspaceId && isOpen }
  );

  // Determine active agent from last AI message
  const activeAgentName = useMemo(() => {
    const lastAiMessage = [...messages].reverse().find(
      m => m.type === 'ai' && m.agentName && m.agentName !== 'System Error'
    );
    return lastAiMessage?.agentName ?? customAssistant?.name ?? 'Zoe';
  }, [messages, customAssistant?.name]);

  const handleSelectAgent = useCallback((agentName: string) => {
    setSelectedAgent(`@${agentName} `);
  }, []);

  const handleSelectDefault = useCallback(() => {
    setSelectedAgent('');
  }, []);

  // Clear selected agent after it's consumed by ManyChat
  useEffect(() => {
    if (selectedAgent) {
      const timer = setTimeout(() => setSelectedAgent(''), 100);
      return () => clearTimeout(timer);
    }
  }, [selectedAgent]);

  return (
    <Modal
      opened={isOpen}
      onClose={closeModal}
      keepMounted
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
      <div className="flex h-full flex-col overflow-hidden">
        {isOpen && (
          <AgentChatModalHeader
            activeAgentName={activeAgentName}
            onSelectAgent={handleSelectAgent}
            onSelectDefault={handleSelectDefault}
          />
        )}
        <ManyChat
          projectId={projectId ?? undefined}
          workspaceId={effectiveWorkspaceId ?? undefined}
          initialInput={selectedAgent}
        />
      </div>
    </Modal>
  );
}
