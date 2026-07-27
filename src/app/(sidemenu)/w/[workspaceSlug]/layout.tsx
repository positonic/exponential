'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { WorkspaceProvider, useWorkspace } from '~/providers/WorkspaceProvider';
import { useRegisterPageContext } from '~/hooks/useRegisterPageContext';
import { WorkspaceTopbar } from '~/app/_components/layout/WorkspaceTopbar';
import { GuestRouteGuard } from '~/app/_components/layout/GuestRouteGuard';
import styles from './WorkspaceLayout.module.css';

/**
 * Registers workspace context for the AI agent chat.
 * Must be rendered inside WorkspaceProvider so useWorkspace() is available.
 */
function WorkspaceContextRegistrar({ children }: { children: React.ReactNode }) {
  const { workspace, workspaceId } = useWorkspace();
  const pathname = usePathname();

  const pageContext = useMemo(() => {
    if (!workspace || !workspaceId) return null;
    // Product routes register their own richer context (ProductLayout). Yield
    // here: this registrar's effect re-runs on every pathname change and runs
    // AFTER child effects (parent effects fire last), so registering the
    // generic workspace context on product routes would clobber the product
    // context on every product tab switch.
    if (/\/products\/[^/]+/.test(pathname)) return null;
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

  return (
    <div className={styles.wrapper}>
      <WorkspaceTopbar />
      <GuestRouteGuard>{children}</GuestRouteGuard>
    </div>
  );
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
