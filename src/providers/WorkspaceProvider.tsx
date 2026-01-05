'use client';

import {
  createContext,
  useContext,
  useCallback,
  type PropsWithChildren,
} from 'react';
import { api } from '~/trpc/react';
import { useParams, useRouter } from 'next/navigation';

interface WorkspaceMember {
  userId: string;
  role: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  };
}

interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: string;
  members?: WorkspaceMember[];
}

interface WorkspaceContextValue {
  workspace: Workspace | null;
  workspaceSlug: string | null;
  workspaceId: string | null;
  isLoading: boolean;
  userRole: 'owner' | 'admin' | 'member' | 'viewer' | null;
  switchWorkspace: (slug: string) => void;
  refetchWorkspace: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
  workspace: null,
  workspaceSlug: null,
  workspaceId: null,
  isLoading: true,
  userRole: null,
  switchWorkspace: () => {
    // Default no-op
  },
  refetchWorkspace: () => {
    // Default no-op
  },
});

export function useWorkspace() {
  return useContext(WorkspaceContext);
}

interface WorkspaceProviderProps extends PropsWithChildren {
  initialWorkspaceSlug?: string;
}

export function WorkspaceProvider({
  children,
  initialWorkspaceSlug,
}: WorkspaceProviderProps) {
  const params = useParams();
  const router = useRouter();

  // Get workspace slug from URL params or prop
  const workspaceSlug =
    (params?.workspaceSlug as string | undefined) ?? initialWorkspaceSlug ?? null;

  // Fetch workspace data when we have a slug
  const {
    data: workspace,
    isLoading,
    refetch,
  } = api.workspace.getBySlug.useQuery(
    { slug: workspaceSlug! },
    {
      enabled: !!workspaceSlug,
      staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    }
  );

  const switchWorkspace = useCallback(
    (slug: string) => {
      // Navigate to the new workspace's home page
      router.push(`/w/${slug}/home`);
    },
    [router]
  );

  const refetchWorkspace = useCallback(() => {
    void refetch();
  }, [refetch]);

  const value: WorkspaceContextValue = {
    workspace: workspace ?? null,
    workspaceSlug,
    workspaceId: workspace?.id ?? null,
    isLoading: workspaceSlug ? isLoading : false,
    userRole: (workspace?.currentUserRole as WorkspaceContextValue['userRole']) ?? null,
    switchWorkspace,
    refetchWorkspace,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}
