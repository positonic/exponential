import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '~/test/test-utils';
import '@testing-library/jest-dom/vitest';
import { WorkspaceTopbar } from '../WorkspaceTopbar';

const { mockUseWorkspace, mockUsePathname } = vi.hoisted(() => ({
  mockUseWorkspace: vi.fn(),
  mockUsePathname: vi.fn(() => '/w/syntrofi/products/exponential/features'),
}));

vi.mock('~/providers/WorkspaceProvider', () => ({
  useWorkspace: () => mockUseWorkspace(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

vi.mock('~/trpc/react', () => ({
  api: {
    page: { parentCrumb: { useQuery: () => ({ data: undefined }) } },
  },
}));

describe('WorkspaceTopbar', () => {
  beforeEach(() => {
    mockUseWorkspace.mockReset();
    mockUseWorkspace.mockReturnValue({
      workspace: { name: 'Syntrofi' },
      workspaceSlug: 'syntrofi',
    });
    mockUsePathname.mockReturnValue('/w/syntrofi/products/exponential/features');
  });

  afterEach(() => {
    cleanup();
  });

  it('links the workspace name back to the workspace root', () => {
    render(<WorkspaceTopbar />);

    expect(screen.getByRole('link', { name: 'Syntrofi' })).toHaveAttribute(
      'href',
      '/w/syntrofi',
    );
  });

  it('keeps the workspace link on deep routes, alongside the section crumb', () => {
    render(<WorkspaceTopbar />);

    expect(screen.getByRole('link', { name: 'Syntrofi' })).toBeInTheDocument();
    expect(screen.getByText('Products')).toBeInTheDocument();
  });

  it('renders nothing without a workspace', () => {
    mockUseWorkspace.mockReturnValue({ workspace: null, workspaceSlug: null });

    render(<WorkspaceTopbar />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
