'use client';

import dynamic from 'next/dynamic';
import { Drawer, Text, ActionIcon } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { useAgentDrawer } from '~/providers/AgentDrawerProvider';

// Dynamic import to prevent Vercel build timeout - ManyChat has 1000+ lines with complex tRPC types
const ManyChat = dynamic(() => import('../ManyChat'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <div className="animate-pulse text-text-muted">Loading chat...</div>
    </div>
  )
});

export function AgentChatDrawer() {
  const { isOpen, projectId, closeDrawer } = useAgentDrawer();

  return (
    <Drawer.Root
      opened={isOpen}
      onClose={closeDrawer}
      position="right"
      size="lg"
      trapFocus={false}
      lockScroll={false}
    >
      <Drawer.Content
        style={{
          height: "100vh",
          backgroundColor: 'transparent'
        }}
      >
        <div className="flex h-full flex-col bg-background-primary">
          {/* Header */}
          <div className="bg-background-secondary/90 backdrop-blur-lg border-b border-border-primary/30 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-brand-success rounded-full animate-pulse"></div>
                <Text size="lg" fw={600} className="text-text-primary">
                  {projectId ? 'Project Chat' : 'Agent Chat'}
                </Text>
              </div>
              <ActionIcon
                variant="subtle"
                size="lg"
                onClick={closeDrawer}
                c="dimmed"
                className="hover:bg-surface-hover/50 transition-colors"
              >
                <IconX size={20} />
              </ActionIcon>
            </div>
          </div>

          {/* Chat Content */}
          <div className="flex-1 h-full overflow-hidden">
            <ManyChat projectId={projectId ?? undefined} />
          </div>
        </div>
      </Drawer.Content>
    </Drawer.Root>
  );
}
