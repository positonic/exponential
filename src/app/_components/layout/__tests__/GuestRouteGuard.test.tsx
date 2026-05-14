import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '~/test/test-utils';
import '@testing-library/jest-dom/vitest';

const { mockReplace, mockUseWorkspace, mockUsePathname } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockUseWorkspace: vi.fn(),
  mockUsePathname: vi.fn(() => '/w/test/home'),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn() }),
  usePathname: () => mockUsePathname(),
}));

vi.mock('~/providers/WorkspaceProvider', () => ({
  useWorkspace: () => mockUseWorkspace(),
}));

import { GuestRouteGuard } from '../GuestRouteGuard';

describe('GuestRouteGuard', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockUseWorkspace.mockReset();
    mockUsePathname.mockReturnValue('/w/test/home');
  });

  afterEach(() => {
    cleanup();
  });

  it('redirects a guest off a hidden workspace route to /projects', async () => {
    mockUseWorkspace.mockReturnValue({
      workspaceSlug: 'test',
      userRole: 'guest',
      isLoading: false,
    });
    mockUsePathname.mockReturnValue('/w/test/goals');

    const { container } = render(
      <GuestRouteGuard>
        <div data-testid="restricted">secret content</div>
      </GuestRouteGuard>,
    );

    // Children must NOT render — no flash of restricted content.
    expect(container.querySelector('[data-testid="restricted"]')).toBeNull();

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/w/test/projects');
    });
  });

  it('lets a guest stay on /projects', async () => {
    mockUseWorkspace.mockReturnValue({
      workspaceSlug: 'test',
      userRole: 'guest',
      isLoading: false,
    });
    mockUsePathname.mockReturnValue('/w/test/projects');

    const { getByTestId } = render(
      <GuestRouteGuard>
        <div data-testid="ok">projects view</div>
      </GuestRouteGuard>,
    );

    expect(getByTestId('ok')).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('lets a guest stay on a project detail route under /projects/', async () => {
    mockUseWorkspace.mockReturnValue({
      workspaceSlug: 'test',
      userRole: 'guest',
      isLoading: false,
    });
    mockUsePathname.mockReturnValue('/w/test/projects/some-project-cmlxyz');

    const { getByTestId } = render(
      <GuestRouteGuard>
        <div data-testid="ok">project detail</div>
      </GuestRouteGuard>,
    );

    expect(getByTestId('ok')).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('does NOT redirect a full member from a hidden route (no regression)', async () => {
    mockUseWorkspace.mockReturnValue({
      workspaceSlug: 'test',
      userRole: 'member',
      isLoading: false,
    });
    mockUsePathname.mockReturnValue('/w/test/goals');

    const { getByTestId } = render(
      <GuestRouteGuard>
        <div data-testid="ok">goals page</div>
      </GuestRouteGuard>,
    );

    expect(getByTestId('ok')).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('blocks rendering while role is unknown (loading)', async () => {
    mockUseWorkspace.mockReturnValue({
      workspaceSlug: 'test',
      userRole: null,
      isLoading: true,
    });
    mockUsePathname.mockReturnValue('/w/test/goals');

    const { container } = render(
      <GuestRouteGuard>
        <div data-testid="restricted">hidden until role known</div>
      </GuestRouteGuard>,
    );

    expect(container.querySelector('[data-testid="restricted"]')).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
