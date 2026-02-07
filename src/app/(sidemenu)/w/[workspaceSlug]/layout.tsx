'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { WorkspaceProvider, useWorkspace } from '~/providers/WorkspaceProvider';
import { useRegisterPageContext } from '~/hooks/useRegisterPageContext';

/**
 * Registers workspace context for the AI agent chat.
 * Must be rendered inside WorkspaceProvider so useWorkspace() is available.
 */
function WorkspaceContextRegistrar({ children }: { children: React.ReactNode }) {
  const { workspace, workspaceId } = useWorkspace();
  const pathname = usePathname();

  const pageContext = useMemo(() => {
    if (!workspace || !workspaceId) return null;
    return {
      pageType: 'workspace',
      pageTitle: workspace.name,
      pagePath: pathname,
      data: {
        workspaceId,
        workspaceName: workspace.name,
        workspaceSlug: workspace.slug,
      },
    };
  }, [workspace, workspaceId, pathname]);

  useRegisterPageContext(pageContext);

  return <>{children}</>;
}

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WorkspaceProvider>
      <WorkspaceContextRegistrar>
        {children}
      </WorkspaceContextRegistrar>
    </WorkspaceProvider>
  );
}
