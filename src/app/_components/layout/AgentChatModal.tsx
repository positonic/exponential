'use client';

import dynamic from 'next/dynamic';
import { Modal } from '@mantine/core';
import { useAgentModal } from '~/providers/AgentModalProvider';

// Dynamic import to prevent Vercel build timeout - ManyChat has 1000+ lines with complex tRPC types
const ManyChat = dynamic(() => import('../ManyChat'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <div className="animate-pulse text-text-muted">Loading chat...</div>
    </div>
  )
});

export function AgentChatModal() {
  const { isOpen, projectId, closeModal } = useAgentModal();

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
        <ManyChat projectId={projectId ?? undefined} />
      </div>
    </Modal>
  );
}
