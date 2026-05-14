'use client';

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react';
import { api } from '~/trpc/react';
import { useParams, useRouter } from 'next/navigation';
import {
  validateHomeLayout,
  type HomeLayout,
} from '~/app/_components/home/HomeLayoutPicker';

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
  logoUrl: string | null;
  type: string;
  homeLayout: HomeLayout;
  members?: WorkspaceMember[];
}

interface WorkspaceContextValue {
  workspace: Workspace | null;
  workspaceSlug: string | null;
  workspaceId: string | null;
  isLoading: boolean;
  userRole: 'owner' | 'admin' | 'member' | 'viewer' | 'guest' | null;
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
  const urlSlug =
    (params?.workspaceSlug as string | undefined) ?? initialWorkspaceSlug ?? null;

  // Track the context workspace slug (can be set without URL change)
  const [contextWorkspaceSlug, setContextWorkspaceSlug] = useState<string | null>(urlSlug);
  const [hasInitialized, setHasInitialized] = useState(!!urlSlug);

  // Fetch default workspace when no slug in URL
  const { data: defaultWorkspace, isLoading: defaultLoading, isFetched: defaultFetched } = api.workspace.getDefault.useQuery(
    undefined,
    {
      enabled: !urlSlug && !hasInitialized,
      staleTime: 5 * 60 * 1000,
    }
  );

  // Auto-create personal workspace if user has none
  const utils = api.useUtils();
  const { mutate: ensurePersonalWorkspace, isPending: isCreatingWorkspace, isError: createWorkspaceError } =
    api.workspace.ensurePersonalWorkspace.useMutation({
      onSuccess: (workspace) => {
        setContextWorkspaceSlug(workspace.slug);
        setHasInitialized(true);
        void utils.workspace.getDefault.invalidate();
      },
    });

  useEffect(() => {
    if (!urlSlug && defaultFetched && !defaultWorkspace && !hasInitialized && !isCreatingWorkspace && !createWorkspaceError) {
      ensurePersonalWorkspace();
    }
  }, [urlSlug, defaultFetched, defaultWorkspace, hasInitialized, isCreatingWorkspace, createWorkspaceError, ensurePersonalWorkspace]);

  // Use URL slug if present, otherwise use context workspace slug
  const effectiveSlug = urlSlug ?? contextWorkspaceSlug;

  // Fetch workspace data when we have a slug
  const {
    data: workspace,
    isLoading: workspaceLoading,
    error: workspaceError,
    refetch,
  } = api.workspace.getBySlug.useQuery(
    { slug: effectiveSlug! },
    {
      enabled: !!effectiveSlug,
      staleTime: 5 * 60 * 1000, // Cache for 5 minutes
      // Don't retry on permission/not-found errors — re-validate on
      // navigation instead and let the redirect effect below handle them.
      retry: (failureCount, err) => {
        const code = (err as { data?: { code?: string } } | null)?.data?.code;
        if (code === 'FORBIDDEN' || code === 'NOT_FOUND' || code === 'UNAUTHORIZED') {
          return false;
        }
        return failureCount < 2;
      },
    }
  );

  // Graceful 403 handling: when the user has lost access to the workspace
  // (e.g. a guest's last project membership was revoked) redirect them out
  // of the shell so no stale data or error overlay is shown.
  useEffect(() => {
    if (!workspaceError) return;
    const code = (workspaceError as { data?: { code?: string } } | null)?.data?.code;
    if (code === 'FORBIDDEN' || code === 'NOT_FOUND' || code === 'UNAUTHORIZED') {
      router.replace('/');
    }
  }, [workspaceError, router]);

  // Set default workspace when loaded (without URL navigation)
  useEffect(() => {
    if (!urlSlug && defaultWorkspace && !hasInitialized) {
      setContextWorkspaceSlug(defaultWorkspace.slug);
      setHasInitialized(true);
    }
  }, [urlSlug, defaultWorkspace, hasInitialized]);

  // Sync with URL changes
  useEffect(() => {
    if (urlSlug) {
      setContextWorkspaceSlug(urlSlug);
      setHasInitialized(true);
    }
  }, [urlSlug]);

  const switchWorkspace = useCallback(
    (slug: string) => {
      setContextWorkspaceSlug(slug);
      // Navigate to the new workspace's home page
      router.push(`/w/${slug}/home`);
    },
    [router]
  );

  const refetchWorkspace = useCallback(() => {
    void refetch();
  }, [refetch]);

  const isLoading = effectiveSlug
    ? workspaceLoading
    : (!hasInitialized && (defaultLoading || isCreatingWorkspace));

  // Narrow Prisma's `homeLayout: string` to the `HomeLayout` union so consumers
  // (e.g. the home-page router) don't have to repeat the validation.
  const narrowedWorkspace = workspace
    ? { ...workspace, homeLayout: validateHomeLayout(workspace.homeLayout) }
    : null;

  const value: WorkspaceContextValue = {
    workspace: narrowedWorkspace,
    workspaceSlug: effectiveSlug,
    workspaceId: workspace?.id ?? null,
    isLoading,
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
