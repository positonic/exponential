import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '~/test/test-utils';
import '@testing-library/jest-dom/vitest';

const { mockReplace, mockPush, mockUseParams, mockGetBySlug, mockGetDefault, mockEnsureWS } =
  vi.hoisted(() => ({
    mockReplace: vi.fn(),
    mockPush: vi.fn(),
    mockUseParams: vi.fn(() => ({ workspaceSlug: 'revoked-ws' })),
    mockGetBySlug: vi.fn(),
    mockGetDefault: vi.fn(),
    mockEnsureWS: vi.fn(),
  }));

vi.mock('next/navigation', () => ({
  useParams: () => mockUseParams(),
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

vi.mock('~/trpc/react', () => ({
  api: {
    workspace: {
      getBySlug: { useQuery: (...args: unknown[]) => mockGetBySlug(...args) },
      getDefault: { useQuery: (...args: unknown[]) => mockGetDefault(...args) },
      ensurePersonalWorkspace: { useMutation: () => mockEnsureWS() },
    },
    useUtils: () => ({
      workspace: {
        getDefault: { invalidate: vi.fn() },
      },
    }),
  },
}));

// Import after mocks are set up.
import { WorkspaceProvider } from '../WorkspaceProvider';

describe('WorkspaceProvider — graceful 403 handling', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockPush.mockReset();
    mockUseParams.mockReturnValue({ workspaceSlug: 'revoked-ws' });
    mockGetDefault.mockReturnValue({ data: undefined, isLoading: false, isFetched: true });
    mockEnsureWS.mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false });
  });

  afterEach(() => {
    cleanup();
  });

  it('redirects to / when workspace.getBySlug returns FORBIDDEN', async () => {
    mockGetBySlug.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { data: { code: 'FORBIDDEN' } },
      refetch: vi.fn(),
    });

    render(
      <WorkspaceProvider>
        <div>child</div>
      </WorkspaceProvider>,
    );

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/');
    });
  });

  it('redirects to / when workspace.getBySlug returns NOT_FOUND', async () => {
    mockGetBySlug.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { data: { code: 'NOT_FOUND' } },
      refetch: vi.fn(),
    });

    render(
      <WorkspaceProvider>
        <div>child</div>
      </WorkspaceProvider>,
    );

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/');
    });
  });

  it('does NOT redirect on transient/non-access errors', async () => {
    mockGetBySlug.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { data: { code: 'INTERNAL_SERVER_ERROR' } },
      refetch: vi.fn(),
    });

    render(
      <WorkspaceProvider>
        <div>child</div>
      </WorkspaceProvider>,
    );

    // Wait a tick; replace should not be called.
    await new Promise((r) => setTimeout(r, 50));
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('does NOT redirect when the query succeeds', async () => {
    mockGetBySlug.mockReturnValue({
      data: {
        id: 'w1',
        name: 'Test',
        slug: 'revoked-ws',
        description: null,
        logoUrl: null,
        type: 'team',
        currentUserRole: 'guest',
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <WorkspaceProvider>
        <div>child</div>
      </WorkspaceProvider>,
    );

    await new Promise((r) => setTimeout(r, 50));
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
