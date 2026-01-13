'use client';

import { useWorkspace } from '~/providers/WorkspaceProvider';
import { KnowledgeBaseContent } from '~/app/_components/knowledge-base/KnowledgeBaseContent';

export default function WorkspaceKnowledgeBasePage() {
  const { workspaceId, isLoading } = useWorkspace();

  return (
    <KnowledgeBaseContent
      workspaceId={workspaceId ?? undefined}
      isLoading={isLoading}
    />
  );
}
