'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { useRegisterPageContext } from '~/hooks/useRegisterPageContext';
import { WorkspaceTopbar } from '~/app/_components/layout/WorkspaceTopbar';
import { GuestRouteGuard } from '~/app/_components/layout/GuestRouteGuard';
import {
  useSeedWorkspaceQuery,
  type ServerWorkspace,
} from '~/hooks/useSeedWorkspaceQuery';
import styles from './WorkspaceLayout.module.css';

/**
 * Registers workspace context for the AI agent chat.
 * Reads the WorkspaceProvider in the root `(sidemenu)` layout, which already
 * follows the URL's workspace slug.
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

export function WorkspaceLayoutClient({
  children,
  workspaceSlug,
  workspace,
}: {
  children: React.ReactNode;
  workspaceSlug: string;
  workspace: ServerWorkspace;
}) {
  useSeedWorkspaceQuery(workspaceSlug, workspace);

  return (
    <WorkspaceContextRegistrar>
      {children}
    </WorkspaceContextRegistrar>
  );
}
